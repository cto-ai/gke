import { ux } from '@cto.ai/sdk'
import { GKEdeleteClusterPrompts } from '../prompts/clusterGCP'
import { GCPConfig } from '../types'
import { track, uxprintmult } from '.'
import { destroyBastion, destroyBastionSSHFirewallRule } from './gcpBastion'
import {
  gkeListClustersName,
  containerOperationPollStatus,
  destroyCustomNetwork,
  destroyCustomSubnetwork,
  destroyCloudRouter,
  destroyCloudNAT,
  authenticateGCloudCLI,
} from './gcpHelpers'
import { getValidatedPrompt } from './validatePrompts'

const { bold, green, magenta, bgRed } = ux.colors

//see https://googleapis.dev/nodejs/container/latest/v1.ClusterManagerClient.html#deleteCluster
const gkeClusterDestroy = async (clusterName: string, region: string, client: any, profileConfig: GCPConfig) => {
  try {
    const results = await client.deleteCluster({
      name: 'projects/' + profileConfig.project_id + '/locations/' + region + '/clusters/' + clusterName,
    })
    await track({ event: 'API call to destroy cluster', region, profileConfig })
    return results[0]
  } catch (error) {
    await track({
      event: 'Failed to destroy cluster',
      region,
      profileConfig,
      error: JSON.stringify(error),
    })
    await uxprintmult(error)
    throw error
  }
}

export const gcpDestroy = async (profileConfig: GCPConfig, client: any, region: string) => {
  await ux.print(bold(bgRed('\n⚠️  Destroying a cluster is irreversible! Please proceed with caution!')))
  const action = 'destroy'

  let clusters: string[]
  try {
    clusters = await gkeListClustersName(region, client, profileConfig)
  } catch (error) {
    await track({
      profileConfig,
      region,
      event: 'Failed getting list of clusters',
      error: JSON.stringify(error),
    })
    await uxprintmult('😩  Failed to get list of clusters: ' + JSON.stringify(error.response))
    throw error
  }
  if (clusters.length == 0) {
    await track({ event: 'No cluster detected for destruction' })
    await uxprintmult('⛔  No clusters detected in this region!')
    return
  }
  await track({
    profileConfig,
    region,
    event: 'Obtained clusters list',
    count: clusters.length,
  })
  await uxprintmult(`\n💻  Here is a list of clusters you have created in ${green(bold(region))}:`)
  await uxprintmult(' ∙ ' + clusters.join('\n ∙ '))

  await ux.print(`${bold('Note:')} Cluster destruction WILL take ~5 minutes.`)
  const { clusterToDestroy } = await getValidatedPrompt(
    GKEdeleteClusterPrompts,
    (resp: any) => {
      return clusters.includes(resp.clusterToDestroy)
    },
    '⚠️  That cluster does not exist!',
  )

  const settings = {
    clusterName: clusterToDestroy,
    profileConfig,
  }
  await track({
    profileConfig,
    region,
    event: 'Cluster destruction confirmed',
    action,
    ...settings,
  })

  const clusterOperation = await gkeClusterDestroy(clusterToDestroy, region, client, profileConfig)

  try {
    const status = await containerOperationPollStatus(clusterOperation, region, profileConfig)
    await ux.print(`⏲️  Cluster \`${magenta(clusterToDestroy)}\` deleted ${green('successfully')}!`)
    await track({
      profileConfig,
      region,
      event: 'Cluster destruction complete',
      status,
    })
  } catch (error) {
    await ux.print(`😱  Error destroying the GKE cluster. Please check & clean up resources manually!`)
    await track({
      profileConfig,
      region,
      event: 'Cluster destruction failed',
      error: JSON.stringify(error),
    })
    await uxprintmult(error)
    throw error
  }

  // Attempt to delete all other resources
  await destroyBastion(profileConfig, clusterToDestroy)
  await destroyBastionSSHFirewallRule(clusterToDestroy)

  await authenticateGCloudCLI(profileConfig.project_id)
  await destroyCloudRouter(clusterToDestroy, region)
  await destroyCloudNAT(clusterToDestroy, region)

  await destroyCustomSubnetwork(clusterToDestroy, region)
  await destroyCustomNetwork(clusterToDestroy)
}
