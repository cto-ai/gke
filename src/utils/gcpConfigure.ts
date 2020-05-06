import { ux, sdk } from '@cto.ai/sdk'
import {
  GCP_FULL_ACCESS_SCOPE,
  GCP_DEFAULT_ACCESS_SCOPES,
  GCP_CUSTOM_ACCESS_SCOPES,
  GCP_ACCESS_SCOPES,
} from '../constants'
import { nodeAccessLevel, nodeCustomAccessScopes } from '../prompts'
import {
  anotherWorkerGroupPrompt,
  generateGKEmachineTypePrompts,
  generateGKEMasterCidrPrompt,
  gkeAutoscalingEnablePrompt,
  gkeAutoscalingPrompts,
  gkeCapacityPrompt,
} from '../prompts/clusterGCP'
import { DefaultWorkerSettings, GCPConfig, GKEClusterSettings, WorkerSettings, AutoscalingConfig } from '../types'
import { track, uxprintmult } from '.'
import {
  gcpGetMachineTypes,
  saveCredsToDisk,
  gkeGetNextAvailRange,
  gkeGetUsedCidrRanges,
  gcpStripProfile,
} from './gcpHelpers'
import { getValidatedPrompt } from './validatePrompts'

const Compute = require('@google-cloud/compute')
const compute = new Compute()

const { bold, magenta, blue } = ux.colors

const configureOauthScopes = async () => {
  const { accessLevel } = await ux.prompt(nodeAccessLevel)

  switch (GCP_ACCESS_SCOPES[accessLevel]) {
    case 'all':
      return Object.values(GCP_FULL_ACCESS_SCOPE)
    case 'custom':
      await ux.print(
        `\nThe following scopes (GKE recommended) will be enabled by default:\n• ${Object.keys(
          GCP_DEFAULT_ACCESS_SCOPES,
        ).join('\n• ')}\n`,
      )
      const { customScopes } = await ux.prompt(nodeCustomAccessScopes)
      return customScopes
        .map(friendlyName => GCP_CUSTOM_ACCESS_SCOPES[friendlyName])
        .concat(Object.values(GCP_DEFAULT_ACCESS_SCOPES))
    case 'default':
      await ux.print(
        `\nThe following scopes (GKE recommended) will be enabled by default:\n• ${Object.keys(
          GCP_DEFAULT_ACCESS_SCOPES,
        ).join('\n• ')}\n`,
      )
      return Object.values(GCP_DEFAULT_ACCESS_SCOPES)
    default:
      return Object.values(GCP_DEFAULT_ACCESS_SCOPES)
  }
}

const configureAutoscaling = async (): Promise<AutoscalingConfig> => {
  const { autoscaling_enable }: { autoscaling_enable: boolean } = await ux.prompt(gkeAutoscalingEnablePrompt)

  if (autoscaling_enable) {
    const autoscalingInput: {
      asg_min_size: number
      asg_max_size: number
    } = await ux.prompt(gkeAutoscalingPrompts)
    return {
      autoscaling_enable,
      asg_desired_capacity: autoscalingInput.asg_min_size,
      asg_min_size: autoscalingInput.asg_min_size,
      asg_max_size: autoscalingInput.asg_max_size
    }
  } else {
    const { asg_desired_capacity } = await getValidatedPrompt(
      gkeCapacityPrompt,
      (resp: any) => {
        return resp.asg_desired_capacity > 0
      },
      'Number must be at least 1!',
    )
    return {
      autoscaling_enable,
      asg_desired_capacity,
      asg_min_size: undefined,
      asg_max_size: undefined,
    }
  }
}

export const gcpConfigureCreds = async () => {
  await ux.print(`\n💻  Let's configure your GCP credentials.\n`)
  const { GOOGLE_APPLICATION_CREDENTIALS } = await sdk.getSecret('GOOGLE_APPLICATION_CREDENTIALS')

  let profConf: GCPConfig
  try {
    profConf = JSON.parse(GOOGLE_APPLICATION_CREDENTIALS)
    profConf = gcpStripProfile(profConf)
  } catch (error) {
    await uxprintmult(magenta("The credentials JSON looks incorrect. Let's try that again, shall we?"))
    await track({
      event: 'Malformed GKE credentials entered',
      error: JSON.stringify(error),
    })
    return await gcpConfigureCreds()
  }

  saveCredsToDisk(GOOGLE_APPLICATION_CREDENTIALS)

  try {
    await compute.getRegions({ maxResults: 1 })
  } catch (error) {
    await uxprintmult(magenta('The credentials appear to be invalid. Try another credential, or re-enter it!\n'), error)
    return await gcpConfigureCreds()
  }

  await track({
    event: 'Configure GKE',
    profile: profConf,
  })
  return profConf
}

export const configureWorkerNodes = async (profileConfig: GCPConfig, region: string): Promise<WorkerSettings[]> => {
  await uxprintmult(bold("\nLet's configure your worker group(s)!"))

  let workers: WorkerSettings[] = []
  let another = false
  do {
    const defaultWorkerSettings: DefaultWorkerSettings = {
      asg_desired_capacity: 1,
      asg_min_size: 1,
      asg_max_size: 3,
    }

    const gcpSizes = gcpGetMachineTypes(region, profileConfig.project_id)
    const { instance_type }: { instance_type: string } = await ux.prompt(generateGKEmachineTypePrompts(await gcpSizes))
    if (instance_type == 'f1-micro') {
      await uxprintmult(
        `Please note that Google requires that clusters of ${magenta(
          'f1-micro',
        )} instances must contain at least ${blue('3 nodes')}. Please make sure the cluster has at least ${blue(
          '3 nodes',
        )} or use a different machine type.`,
      )
    }

    const autoscalingConfig: AutoscalingConfig = await configureAutoscaling()
    const oauthScopes = await configureOauthScopes()

    workers.push({
      ...defaultWorkerSettings,
      instance_type,
      ...autoscalingConfig,
      oauthScopes,
    })

    console.log('workers', workers)

    const { anotherWorkerGroup } = await ux.prompt(anotherWorkerGroupPrompt)
    another = anotherWorkerGroup
  } while (another)

  return workers
}

export const configureMasterCidrBlock = async (enablePrivateNodes: boolean): Promise<string> => {
  let masterIpv4CidrBlock: string = '172.16.0.0/28'
  if (enablePrivateNodes) {
    const usedRanges = await gkeGetUsedCidrRanges()
    const nextRange = gkeGetNextAvailRange(usedRanges)
    if (nextRange) {
      await track({ event: `Setting Master IPv4 CIDR range as ${nextRange}` })
      masterIpv4CidrBlock = nextRange
    } else {
      //exhausted the range?
      //probably printed a really long list of CIDR ranges up there
      const isCidr = require('is-cidr')
      if (usedRanges.length > 0) {
        await uxprintmult('Here are the currently used CIDR ranges:\n ∙ ' + usedRanges.join('\n ∙ '))
      }
      await uxprintmult(
        'The CIDR range needs to be a valid, non-overlapping /28 block according to RFC 1918.\nSee https://cloud.google.com/kubernetes-engine/docs/reference/rest/v1/projects.locations.clusters#Cluster.PrivateClusterConfig for more details.\n',
      )

      const resp = await getValidatedPrompt(
        generateGKEMasterCidrPrompt(usedRanges.length > 0),
        (resp: any) => {
          return !usedRanges.includes(resp.masterIpv4CidrBlock) && isCidr.v4(resp.masterIpv4CidrBlock)
        },
        'Needs to be a valid, non-overlapping CIDR range!',
      )
      masterIpv4CidrBlock = resp?.masterIpv4CidrBlock
    }
  }
  return masterIpv4CidrBlock
}

export const configureMasterAuthorizedConfigCidr = async (
  bastionInfo,
  clusterSettings: GKEClusterSettings,
): Promise<GKEClusterSettings> => {
  return {
    ...clusterSettings,
    masterAuthorizedNetworksConfig: {
      enabled: true,
      cidrBlocks: [
        {
          displayName: 'bastion',
          cidrBlock: `${bastionInfo.metadata.networkInterfaces[0].networkIP}/32`,
        },
      ],
    },
  }
}
