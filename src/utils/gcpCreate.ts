import { ux } from '@cto.ai/sdk'
import { GCP_ALL_ACCESS_SCOPES, SELECT_EXISTING_NETWORK, CREATE_NETWORK } from '../constants'
import {
  selectNetworkPrompt,
  getNetworkPrompt,
  getSubnetworkPrompt,
  confirmCreatePrompt,
  gkeClusterPrompts,
  gkePrivateNodesPrompt,
  gkeEnableStackdriverPrompt,
  confirmRollbackPrompt,
} from '../prompts'
import { GCPConfig, GKEClusterSettings, WorkerSettings } from '../types'
import { track, uxprintmult } from '.'
import {
  createBastion,
  createBastionSSHFirewallRule,
  destroyBastion,
  destroyBastionSSHFirewallRule,
} from './gcpBastion'
import {
  gcpGetNetworks,
  gcpGetSubnetworks,
  printQuotas,
  gkeListClustersName,
  containerOperationPollStatus,
  createCustomNetwork,
  createPrivateSubnetwork,
  destroyCustomNetwork,
  destroyCustomSubnetwork,
  authenticateGCloudCLI,
  createCloudRouter,
  createCloudNAT,
  destroyCloudNAT,
  destroyCloudRouter,
} from './gcpHelpers'
import { configureMasterCidrBlock, configureWorkerNodes, configureMasterAuthorizedConfigCidr } from './gcpConfigure'
import { getValidatedPrompt } from './validatePrompts'
import { getNetworkName, getPrivateSubnetworkName, getBastionName } from './resourceNames'
import { startSpinner, succeedSpinner, failSpinner } from './spinner'

const { bold, green, magenta, yellow, blue } = ux.colors

const gkeConfirmSettings = async (gkeSettings: GKEClusterSettings) => {
  let settings = [
    magenta('\n🔧 Basic Settings'),
    `Project ID: \`${green(gkeSettings.profile.project_id)}\``,
    `Region: \`${green(gkeSettings.region)}\``,
    `Network: \`${green(gkeSettings.network)}\``,
    `Subnetwork: \`${green(gkeSettings.subnetwork)}\``,
    `Cluster Name: \`${green(gkeSettings.clusterName)}\``,
    `Cluster Topology: \`${
      gkeSettings.enablePrivateNodes
        ? green(`${'Private'}, ${gkeSettings.masterIpv4CidrBlock}`)
        : magenta(`${'Public'}`)
    }\``,
    magenta('\n👷  Worker Group Settings'),
  ]
  gkeSettings.workers.forEach((value: WorkerSettings) => {
    settings = settings.concat([
      `Machine type: \`${green(value.instance_type)}\``,
      `Autoscaling enabled: \`${
        value.autoscaling_enable ? green(`${value.autoscaling_enable}`) : magenta(`${value.autoscaling_enable}`)
      }\``,
    ])
    if (value.autoscaling_enable) {
      settings = settings.concat([
        `Minimum number of nodes: \`${green(`${value.asg_min_size}`)}\``,
        `Maximum number of nodes: \`${green(`${value.asg_max_size}`)}\``,
      ])
    } else {
      settings = settings.concat([`Desired number of nodes per zone: \`${green(`${value.asg_desired_capacity}`)}\``])
    }
    const accessScopes: string[] = []
    Object.keys(GCP_ALL_ACCESS_SCOPES).map(key => {
      if (value.oauthScopes.includes(GCP_ALL_ACCESS_SCOPES[key])) {
        accessScopes.push(key)
      }
    })
    settings = settings.concat([`Access scopes:${green(`\n• ${accessScopes.join('\n• ')}`)}`, ``])
  })

  await track({ event: 'Confirming settings with user' })
  await uxprintmult(settings.join('\n'))

  await printQuotas(gkeSettings.region) // TODO: review
}

const getGKEClusterSettings = async (profileConfig: GCPConfig, region: string, client: any) => {
  let clusters: string[]
  try {
    clusters = await gkeListClustersName(region, client, profileConfig)
  } catch (error) {
    await track({
      event: 'Failed to get list of clusters',
      region,
      profileConfig,
      error: JSON.stringify(error),
    })
    await uxprintmult('Failed to get list of clusters: ' + JSON.stringify(error.response))
    throw error
  }
  if (clusters.length > 0) {
    await uxprintmult(
      `\n💻  Here is a list of clusters you have created in ${green(bold(region))}: ` +
        '\n ∙ ' +
        clusters.join('\n ∙ '),
    )
  }

  const { clusterName } = await getValidatedPrompt(
    gkeClusterPrompts,
    (resp: any) => {
      return !clusters.includes(resp.clusterName)
    },
    'That name is already used! Please try a different name!',
  )
  await track({ event: 'Cluster name entered', region, profileConfig })

  let network, subnetwork
  let customNetwork = false
  const { networkSelected } = await ux.prompt(selectNetworkPrompt)
  if (networkSelected === SELECT_EXISTING_NETWORK) {
    await ux.print(
      `\n⚠️  ${yellow(
        'Warning:',
      )} Existing networks (other than the default one) might not be configured correctly for GKE. Continue at your own risk!\n`,
    )
    const networks = await gcpGetNetworks(region)
    const { networkId } = await ux.prompt(getNetworkPrompt(networks.map(n => n.id)))
    const selectedNetwork = networks.find(n => n.id === networkId)
    network = selectedNetwork ? selectedNetwork.name : 'default'

    const subnetworks = await gcpGetSubnetworks(region, profileConfig.project_id)
    const { subnetworkId } = await ux.prompt(getSubnetworkPrompt(subnetworks.map(s => s.id)))
    const selectedSubnetwork = subnetworks.find(s => s.id === subnetworkId)
    subnetwork = selectedSubnetwork ? selectedSubnetwork.name : 'default'
  } else if (networkSelected === CREATE_NETWORK) {
    customNetwork = true
    network = getNetworkName(clusterName)
    subnetwork = getPrivateSubnetworkName(clusterName)
  } else {
    network = `default`
    subnetwork = `default`
  }

  // Private cluster? And if so, get the private /28 CIDR for the master(s)
  const { enablePrivateNodes } = await ux.prompt(gkePrivateNodesPrompt)
  const masterIpv4CidrBlock = await configureMasterCidrBlock(enablePrivateNodes)

  const { enableStackdriver } = await ux.prompt(gkeEnableStackdriverPrompt)

  const workers = await configureWorkerNodes(profileConfig, region)

  await track({ event: 'Worker group(s) configured', region, profileConfig })

  return {
    profile: profileConfig,
    region,
    clusterName,
    customNetwork,
    network,
    subnetwork,
    enableStackdriver,
    // users: {},
    workers,
    enablePrivateNodes,
    masterIpv4CidrBlock,
    masterAuthorizedNetworksConfig: {
      enabled: enablePrivateNodes,
    },
  } as GKEClusterSettings
}

// Generates the request object we need for createCluster
// See https://googleapis.dev/nodejs/container/latest/v1.ClusterManagerClient.html#createCluster
const clusterCreateRequest = async (cluster: GKEClusterSettings) => {
  const {
    profile: { project_id },
    region,
    clusterName,
    enableStackdriver,
    masterAuthorizedNetworksConfig,
    network,
    customNetwork,
    subnetwork,
    workers,
    enablePrivateNodes,
    masterIpv4CidrBlock,
  } = cluster
  let request = {
    parent: 'projects/' + project_id + '/locations/' + region,
    cluster: {
      name: clusterName,
      initialClusterVersion: 'latest',
      ipAllocationPolicy: {
        useIpAliases: true,
        createSubnetwork: false,
      },
      loggingService: enableStackdriver ? 'logging.googleapis.com/kubernetes' : 'none',
      monitoringService: enableStackdriver ? 'monitoring.googleapis.com/kubernetes' : 'none',
      network: `projects/${project_id}/global/networks/${network}`,
      subnetwork: `projects/${project_id}/regions/${region}/subnetworks/${subnetwork}`,
      clusterTelemetry: {
        type: 'DISABLED',
      },
      nodePools: [] as any[],
      masterAuthorizedNetworksConfig: masterAuthorizedNetworksConfig,
    },
  }

  workers.forEach(
    ({ instance_type, autoscaling_enable, asg_desired_capacity, asg_min_size, asg_max_size, oauthScopes }, index) => {
      let pool = {
        name: clusterName + '-np-' + index,
        initialNodeCount: asg_desired_capacity,
        config: {
          machineType: instance_type,
          oauthScopes: oauthScopes,
        },
        management: {
          autoUpgrade: true,
          autoRepair: true,
        },
      }
      if (autoscaling_enable) {
        pool['autoscaling'] = {
          enabled: autoscaling_enable,
          minNodeCount: asg_min_size,
          maxNodeCount: asg_max_size,
        }
      }
      request.cluster.nodePools.push(pool)
    },
  )

  if (enablePrivateNodes) {
    request.cluster['privateClusterConfig'] = {
      enablePrivateNodes: enablePrivateNodes,
      enablePrivateEndpoint: enablePrivateNodes,
      masterIpv4CidrBlock: masterIpv4CidrBlock,
    }
  }
  await track({ event: 'Cluster creation request created' })
  return request
}

const printClusterInstructions = async (
  gkeSettings: GKEClusterSettings,
  profileConfig: GCPConfig,
  bastion: any | null,
) => {
  let instructions = [
    bold(green('\n🚀  Cluster successfully created!')),
    bold('\nℹ️  To access the cluster:\n'),
    `1. Make sure ${magenta(
      'gcloud',
    )} is installed and configured with an (service) account with sufficient permissions: ${blue(
      'https://cloud.google.com/sdk/docs/#install_the_latest_cloud_tools_version_cloudsdk_current_version',
    )}`,
    `2. Verify that your cluster is created with the command \`${magenta('gcloud container clusters list')}\`\n`,
  ]
  if (gkeSettings.enablePrivateNodes) {
    if (bastion) {
      await uxprintmult(
        instructions.join('\n'),
        `3. Enter your bastion through \`${magenta(
          `gcloud beta compute --project ${profileConfig.project_id} ssh --zone=${bastion.zone.id} ${getBastionName(
            gkeSettings.clusterName,
          )}`,
        )}\`\n`,
        `4. Once in the bastion, verify that your configuration is correct with the command \`${magenta(
          'kubectl get nodes',
        )}\`\n`,
        `5. [Optional] Install SSH configuration with \`${magenta(
          `gcloud compute config-ssh`,
        )}\`, and then connect directly to the bastion with \`${magenta(
          `ssh ${getBastionName(gkeSettings.clusterName)}.${bastion.zone.id}.${profileConfig.project_id}`,
        )}\``,
      )
    } else {
      await uxprintmult(
        instructions.join('\n'),
        "\nThe bastion was not created succesfully, so you may not be able to access the cluster!\nYou'll have to resolve this manually!",
      )
    }
  } else {
    await uxprintmult(
      instructions.join('\n'),
      `3. Please make sure you have installed ${magenta('kubectl')}: ${blue(
        'https://kubernetes.io/docs/tasks/tools/install-kubectl',
      )}\n`,
      `4. Add the necessary credentials and configuration by running \`${magenta(
        `KUBECONFIG=$HOME/.kube/config_gke_${gkeSettings.clusterName}_${gkeSettings.region} gcloud container clusters get-credentials ${gkeSettings.clusterName} --region=${gkeSettings.region}`,
      )}\`\n`,
      `5. Verify that your configuration is correct with the command \`${magenta('kubectl get nodes')}\``,
    )
  }
}

export const gcpCreate = async (profileConfig: GCPConfig, client: any, region: string) => {
  const action = 'create'
  let clusterSettings = await getGKEClusterSettings(profileConfig, region, client)

  await gkeConfirmSettings(clusterSettings)
  await ux.print(`${bold('Note:')} This WILL take ${magenta('~5 minutes')}\n`)

  const { confirmCreate } = await ux.prompt(confirmCreatePrompt)
  if (!confirmCreate) {
    await track({
      profileConfig,
      region,
      event: 'Cluster creation aborted',
      action,
      ...clusterSettings,
    })
    await uxprintmult('Aborting...')
    return Infinity
  }
  await track({
    profileConfig,
    region,
    event: 'Cluster creation confirmed',
    action,
    ...clusterSettings,
  })

  try {
    // Create network
    if (clusterSettings.customNetwork) {
      await createCustomNetwork(clusterSettings)
      await createPrivateSubnetwork(clusterSettings)
    }

    // Private cluster resources
    let bastionInfo
    if (clusterSettings.enablePrivateNodes) {
      // const externalIP = await createExternalIP(clusterSettings)
      bastionInfo = await createBastion(profileConfig, clusterSettings)
      clusterSettings = await configureMasterAuthorizedConfigCidr(bastionInfo, clusterSettings)
      await createBastionSSHFirewallRule(clusterSettings, bastionInfo)

      await authenticateGCloudCLI(profileConfig.project_id)
      await createCloudRouter(clusterSettings.clusterName, clusterSettings.network, clusterSettings.region)
      await createCloudNAT(clusterSettings.clusterName, clusterSettings.region)
    }

    await startSpinner('Validating settings')
    let clusterOperation: any
    try {
      const req = await clusterCreateRequest(clusterSettings)
      const [operation] = await client.createCluster(req)
      clusterOperation = operation
    } catch (error) {
      await uxprintmult(`\n☠️  Validation failed with error:\n${error.details}\n`)
      await track({
        profileConfig,
        region,
        event: 'Validation failed',
        action,
        ...clusterSettings,
        error: JSON.stringify(error),
      })
      throw error
    }
    await succeedSpinner('Settings validated! Cluster creation underway!')

    const status = await containerOperationPollStatus(clusterOperation, region, profileConfig)
    await ux.print(`⏲️  Cluster \`${magenta(clusterSettings.clusterName)}\` created ${green('successfully')}!`)
    await printClusterInstructions(clusterSettings, profileConfig, bastionInfo)
    await track({
      profileConfig,
      region,
      event: 'Cluster creation complete',
      status,
    })
  } catch (error) {
    await failSpinner('Failed to validate settings')
    await track({
      profileConfig,
      region,
      event: 'Cluster creation failed',
      error: JSON.stringify(error),
    })
    await uxprintmult(error)
    await checkAndRollback(profileConfig, clusterSettings, region)
  }
}

const checkAndRollback = async (profileConfig: GCPConfig, clusterSettings: GKEClusterSettings, region: string) => {
  const { confirmRollback } = await ux.prompt(confirmRollbackPrompt)
  if (!confirmRollback) return
  await destroyBastion(profileConfig, clusterSettings.clusterName)
  await destroyBastionSSHFirewallRule(clusterSettings.clusterName)

  await authenticateGCloudCLI(profileConfig.project_id)
  await destroyCloudRouter(clusterSettings.clusterName, region)
  await destroyCloudNAT(clusterSettings.clusterName, region)

  await destroyCustomSubnetwork(clusterSettings.clusterName, region)
  await destroyCustomNetwork(clusterSettings.clusterName)
}
