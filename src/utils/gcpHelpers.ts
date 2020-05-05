import fs from 'fs'
import { ux } from '@cto.ai/sdk'
import Compute from '@google-cloud/compute'
import { GCPNetwork, GCPSubnetwork, GCPConfig, GKEClusterSettings } from '../types'
import {
  GOOGLE_APPLICATION_CREDENTIALS,
  DEFAULT_PRIVATE_SUBNET_IP_RANGE,
  CLUSTER_OPERATION_WIP_STATUSES,
  CLUSTER_OPERATION_FAILURE_STATUSES,
  CLUSTER_OPERATION_SUCCESS_STATUSES,
} from '../constants'
import { track, uxprintmult, sleep, pExec, startSpinner, succeedSpinner, failSpinner } from '.'
import { getNetworkName, getPrivateSubnetworkName, getCloudRouterName, getCloudNATName } from './resourceNames'

const compute = new Compute()
const {
  colors: { bold },
} = ux

export const gkeListClustersName = async (region: string, client: any, profileConfig: GCPConfig) => {
  let clusters
  try {
    clusters = (
      await client.listClusters(
        {
          parent: 'projects/' + profileConfig.project_id + '/locations/' + region,
        },
        { autoPaginate: true },
      )
    )[0].clusters
  } catch (error) {
    await uxprintmult('Unable to retrieve list of GKE clusters for region ', region)
    await await track({
      event: 'Error retrieving list of clusters',
      error: JSON.stringify(error),
      region,
      profileConfig,
    })
    throw error
  }
  await track({
    event: 'Converting list of cluster objects into list of cluster names',
    count: clusters.length,
  })
  return clusters.map(x => x.name).sort()
}

export const saveCredsToDisk = (credsJSON: string) => {
  //this needs to be called on every run to create the credentials file in FS
  fs.writeFileSync(GOOGLE_APPLICATION_CREDENTIALS, credsJSON)
  return
}

//gets a key-value object where keys are machine types in the given zone and values are the description of the machine
export const gcpGetMachineTypes = async (region: string, project: string): Promise<string[]> => {
  const zones = await gcpGetZones(region, project)
  const mtZonesPromises: { zone: string; promise: any }[] = zones.map((value: string) => {
    return {
      zone: value,
      promise: compute.getMachineTypes({
        autoPaginate: true,
        filter: `zone eq ${value}`,
      }),
    }
  })
  // let zonesMt = {} //key: zone, val: array of MachineTypes in that zone
  let zonesNamesMt = {} //key: zone, val: array of machine type names (strings)
  let shortestZone = { name: '', len: Infinity } //which zone has the least machine types available?
  for (let index = 0; index < mtZonesPromises.length; index++) {
    const zonePromise = mtZonesPromises[index]
    //the following should only really block on the first await
    //for loop, cause forEach does not permit await??
    const mtPerZoneResult = await zonePromise.promise
    // zonesMt[zonePromise.zone] = mtPerZoneResult[0]
    zonesNamesMt[zonePromise.zone] = mtPerZoneResult[0].map(val => val.id)
    if (mtPerZoneResult[0].length < shortestZone.len) {
      shortestZone = { name: zonePromise.zone, len: mtPerZoneResult[0].length }
    }
  }
  let commonNameList: string[] = []
  //for each machine type in the zone with least types
  zonesNamesMt[shortestZone.name].forEach(mt => {
    for (let index = 0; index < zones.length; index++) {
      //check if this mt exists in all other zones
      const zone = zones[index]
      if (zone == shortestZone.name) continue
      if (!zonesNamesMt[zone].includes(mt)) continue
    }
    //it does, add it
    commonNameList.push(mt)
  })

  return commonNameList.sort((a: string, b: string) => {
    if (a == b) {
      return 0
    } else {
      //each machine type consists of 3 parts
      //generation-size-cores
      const splitA = a.split('-')
      const splitB = b.split('-')
      if (splitA[0] != splitB[0]) {
        //generation
        return splitA[0] > splitB[0] ? 1 : -1
      } else if (splitA[1] != splitB[1]) {
        //size
        return splitA[1] > splitB[1] ? 1 : -1
      } else {
        //cores
        return parseInt(splitA[2]) - parseInt(splitB[2])
      }
    }
  })
}

//get list of GCP regions
export const gcpGetRegions: () => Promise<string[]> = async () => {
  try {
    let regions = await compute.getRegions()
    await track({
      event: 'Retrieved list of regions',
      count: regions[0].length,
    })
    return regions[0].map(x => x.id).sort()
  } catch (error) {
    await track({
      event: 'Error trying to retrieve list of GCP regions',
      error,
    })
    await uxprintmult(error)
    throw error
  }
}

//get zones within a region
export const gcpGetZones: (region: string, projectId: string) => Promise<string[]> = async (
  region: string,
  projectId: string,
) => {
  try {
    let zones = await compute.getZones({
      autoPaginate: true,
      filter: `region eq https://www.googleapis.com/compute/v1/projects/${projectId}/regions/${region}`,
    })
    await track({ event: 'Retrieved list of zones', count: zones[0].length })
    return zones[0].map(x => x.id).sort()
  } catch (error) {
    await track({
      event: 'Error trying to retrieve list of GCP regions',
      error,
    })
    await uxprintmult(error)
    throw error
  }
}

export const gcpGetNetworks: (region: string) => Promise<GCPNetwork[]> = async region => {
  try {
    let [networks] = await compute.getNetworks({
      autoPaginate: true,
    })
    await track({ event: 'Retrieved list of networks', count: networks.length })
    return networks.sort().filter(network => {
      if (!network.metadata.subnetworks) return false
      return network.metadata.subnetworks.some(subnetwork => subnetwork.includes(`regions/${region}`))
    })
  } catch (error) {
    await track({
      event: 'Error trying to retrieve list of GCP networks',
      region,
      error,
    })
    await uxprintmult(error)
    throw error
  }
}

export const gcpGetSubnetworks: (region: string, projectId: string) => Promise<GCPSubnetwork[]> = async (
  region,
  projectId,
) => {
  try {
    let [subnetworks] = await compute.getSubnetworks({
      autoPaginate: true,
      filter: `region eq https://www.googleapis.com/compute/v1/projects/${projectId}/regions/${region}`,
    })
    await track({
      event: 'Retrieved list of networks',
      count: subnetworks.length,
    })
    return subnetworks.sort()
  } catch (error) {
    await track({
      event: 'Error trying to retrieve list of GCP subnetworks',
      region,
      error,
    })
    await uxprintmult(error)
    throw error
  }
}

//gets project-wide and region-wide quotas
//each entry in project/region is {metric: string, limit: number, usage: number}
export const gcpGetQuota: (region: string) => Promise<{ project: any; region: any }> = async (region: string) => {
  try {
    const regionProm = compute.region(region).get()
    const projProm = compute.project().get()

    const regionData = await regionProm
    const regionQuotas = regionData[0].metadata.quotas
    let regionKV: any = {}
    for (let index = 0; index < regionQuotas.length; index++) {
      const metric = regionQuotas[index]
      regionKV[metric.metric] = metric
    }

    const projData = await projProm
    const projQuotas = projData[0].metadata.quotas
    let projectKV: any = {}
    for (let index = 0; index < projQuotas.length; index++) {
      const metric = projQuotas[index]
      projectKV[metric.metric] = metric
    }
    return { project: projectKV, region: regionKV }
  } catch (error) {
    await track({ event: `Unable to retrieve quotas`, error, region })
    await uxprintmult(error)
    throw error
  }
}

//polls container (GKE) operation's status every freq ms (default 5000ms) until state is done or aborting, then returns that status
export const containerOperationPollStatus = async (
  operation,
  region: string,
  profileConfig: GCPConfig,
  freq?: number,
) => {
  const Container = require('@google-cloud/container')
  const client = new Container.v1.ClusterManagerClient()
  const path = 'projects/' + profileConfig.project_id + '/locations/' + region + '/operations/' + operation.name

  await track({
    event: 'Begin polling container operation for status',
    region,
    profileConfig,
  })
  await startSpinner(`Waiting for cluster operation to complete`)
  while (true) {
    const [operation] = await client.getOperation({ name: path })
    const { status } = operation

    if (CLUSTER_OPERATION_FAILURE_STATUSES.includes(status)) {
      await track({
        event: 'Cluster operation aborting',
        operationName: operation.name,
      })
      await failSpinner(`Something went wrong! Aborting...`)
      throw 'Something went wrong! Aborting...'
    }

    if (CLUSTER_OPERATION_WIP_STATUSES.includes(status)) {
      // await ux.print(`🤓  Still working on this...`)
      await sleep(freq ? freq : 5000)
    }

    if (CLUSTER_OPERATION_SUCCESS_STATUSES.includes(status)) {
      await track({
        event: 'Cluster operation completed successfully',
        operationName: operation.name,
      })
      await succeedSpinner(`Cluster operation completed`)
      return status
    }
  }
}

//Returns the CIDR ranges used by GKE Private masters. Non-exhaustive; some masters (especially custom made ones) may not be detected
export const gkeGetUsedCidrRanges: () => Promise<string[]> = async () => {
  try {
    const firewalls = await compute.getFirewalls({
      filter: 'name eq gke-.*-.*-master',
    }) // detects only GKE-created masters
    return firewalls[0]
      .filter(fw => fw.metadata.disabled == false && fw.metadata.direction == 'INGRESS')
      .map(fw => fw.metadata.sourceRanges)
      .flat()
      .sort()
  } catch (error) {
    await track({ event: 'Error getting used CIDR ranges', error })
    await uxprintmult(error)
    return []
  }
}

//given a list of used private ranges, returns a /28 block that is available
//currently returns inside 172.16.0.0/12 only
export const gkeGetNextAvailRange: (usedRange: string[]) => string | undefined = (usedRange: string[]) => {
  const Netmask = require('netmask').Netmask
  let usedRangesArray: Array<Boolean> = new Array(65536).fill(true) // Priv block range 172.16.0.0/12 divided into /28 blocks (1048576 / 16)
  const baseRange = new Netmask('172.16.0.0/28') //total available range
  usedRange.forEach(element => {
    const eleMask = new Netmask(element) // the CIDR range of a currently used /28 block
    const index = (eleMask.netLong - baseRange.netLong) / 16 //get index into the used array
    if (index >= 0 && index < 65536) {
      usedRangesArray[index] = false
    }
  })
  for (let index = 0; index < usedRangesArray.length; index++) {
    if (usedRangesArray[index]) {
      //found a /28 block that is unused
      return baseRange.next(index).base + '/28'
    }
  }
}

export const printQuotas = async region => {
  let quotas = await gcpGetQuota(region)
  await uxprintmult(
    `${bold(`Worried about hitting your quotas? Here is your current status:`)}\n`,
    `• \`${bold('project-wide')}\` quotas:\n`,
    `\tCPU (limit \`${quotas.project.NETWORKS.limit}\`, used \`${quotas.project.NETWORKS.usage}\`)\n`,
    `\tVPC Networks (limit \`${quotas.project.CPUS_ALL_REGIONS.limit}\`, used \`${quotas.project.CPUS_ALL_REGIONS.usage}\`)\n`,
    `\tFirewall rules (limit \`${quotas.project.FIREWALLS.limit}\`, used \`${quotas.project.FIREWALLS.usage}\`)\n`,
    `• \`${bold(region)}\` quotas:\n`,
    `\tCPU (limit \`${quotas.region.CPUS.limit}\`, used \`${quotas.region.CPUS.usage}\`)\n`,
    `\tDisk (limit \`${quotas.region.DISKS_TOTAL_GB.limit}GB\`, used \`${quotas.region.DISKS_TOTAL_GB.usage}GB\`)\n`,
    `\tStatic IP Addresses (limit \`${quotas.region.STATIC_ADDRESSES.limit}\`, used \`${quotas.region.STATIC_ADDRESSES.usage}\`)\n`,
    `\tTotal instances (limit \`${quotas.region.INSTANCES.limit}\`, used \`${quotas.region.INSTANCES.usage}\`)`,
  )
  return
}

//removes sensitive information from the profile so we don't track private keys etc.
export const gcpStripProfile = (profile: GCPConfig) => {
  let profileConfig: GCPConfig = {} as GCPConfig
  Object.assign(profileConfig, profile)
  profileConfig.private_key = ''
  profileConfig.private_key_id = ''
  profileConfig.client_email = ''
  return profileConfig
}

export const createPrivateSubnetwork = async (clusterSettings: GKEClusterSettings) => {
  const networkName = getNetworkName(clusterSettings.clusterName)
  const subnetworkName = getPrivateSubnetworkName(clusterSettings.clusterName)
  
  await startSpinner(`Configuring private subnetwork \`${subnetworkName}\``)
  
  const network = await compute.network(networkName)
  try {
    const [subnetwork, operation] = await network.createSubnetwork(subnetworkName, {
      region: clusterSettings.region,
      range: DEFAULT_PRIVATE_SUBNET_IP_RANGE,
      privateIpGoogleAccess: true,
      enableFlowLogs: false,
    })
    await operation.promise()
    await succeedSpinner(`Successfully configured private subnetwork \`${subnetworkName}\``)
    await track({
      event: 'Successfully created custom subnetwork',
      subnetworkName,
    })
    return subnetwork
  } catch (error) {
    await failSpinner(`Failed to configure private subnetwork \`${subnetworkName}\``)
    await track({
      event: 'Error creating subnetwork',
      subnetworkName,
      error,
    })
    await uxprintmult(error)
    throw error
  }
}

export const createCustomNetwork = async (clusterSettings: GKEClusterSettings) => {
  const networkName = getNetworkName(clusterSettings.clusterName)
  await startSpinner(`Creating custom network \`${networkName}\``)

  try {
    const [network, operation] = await compute.createNetwork(networkName, {
      autoCreateSubnetworks: false,
      routingConfig: {
        routingMode: `REGIONAL`,
      },
    })
    await operation.promise()
    await succeedSpinner(`Successfully created custom network \`${networkName}\``)
    await track({
      event: 'Successfully created custom network',
      networkName,
    })
    return network
  } catch (error) {
    await failSpinner(`Failed to create custom network \`${networkName}\``)
    await track({
      event: 'Error creating network',
      networkName,
      error,
    })
    await uxprintmult(error)
    throw error
  }
}

export const destroyCustomSubnetwork = async (clusterName: string, region: string) => {
  const subnetworkName = getPrivateSubnetworkName(clusterName)
  const subnetwork = compute.region(region).subnetwork(subnetworkName)

  const [exists] = await subnetwork.exists()
  if (!exists) return

  try {
    await startSpinner(`Destroying custom subnetwork \`${subnetworkName}\``)
    const [operation] = await subnetwork.delete()
    await operation.promise()
    await succeedSpinner(`Successfully deleted custom subnetwork \`${subnetworkName}\``)
    await track({
      event: `Successfully deleted custom subnetwork`,
      subnetworkName,
    })
    return operation
  } catch (error) {
    await failSpinner(
      `Failed to delete custom subnetwork \`${subnetworkName}\`. Please check and clean up manually!`,
    )
    await track({
      event: `Failed to delete custom subnetwork`,
      error: JSON.stringify(error),
      subnetwork,
    })
  }
}

export const destroyCustomNetwork = async (clusterName: string) => {
  const networkName = getNetworkName(clusterName)
  const network = compute.network(networkName)

  const [exists] = await network.exists()
  if (!exists) return

  try {
    await startSpinner(`Destroying custom network \`${networkName}\``)
    const [operation] = await network.delete()
    await operation.promise()
    await succeedSpinner(`Successfully deleted custom network \`${networkName}\``)
    await track({
      event: `Successfully deleted custom network`,
      networkName,
    })
    return operation
  } catch (error) {
    await failSpinner(`Failed to delete custom network \`${networkName}\`. Please check and clean up manually!`)
    await track({
      event: `Failed to delete custom network`,
      error: JSON.stringify(error),
      network,
    })
  }
}

// TODO: Refactor
export const authenticateGCloudCLI = async (projectId: string) => {
  try {
    await pExec(`gcloud auth activate-service-account --key-file=${GOOGLE_APPLICATION_CREDENTIALS}`)
    await pExec(`gcloud config set project ${projectId}`)
    return
  } catch (error) {
    throw error.stderr
  }
}

export const createCloudRouter = async (clusterName: string, networkName: string, region: string) => {
  const routerName = getCloudRouterName(clusterName)
  await startSpinner(`Creating cloud router \`${routerName}\``)
  try {
    await pExec(`gcloud compute routers create ${routerName} --network ${networkName} --region ${region}`)
    await succeedSpinner(`Successfully created cloud router \`${routerName}\``)
  } catch (error) {
    await failSpinner(`Failed to create cloud router \`${routerName}\``)
    await uxprintmult(error.stderr)
    throw error.stderr
  }
}

const cloudRouterExists = async (routerName: string, region: string) => {
  try {
    await pExec(`gcloud compute routers describe ${routerName} --region ${region}`)
    return true
  } catch (error) {
    return false
  }
}

export const destroyCloudRouter = async (clusterName: string, region: string) => {
  const routerName = getCloudRouterName(clusterName)
  if (!(await cloudRouterExists(routerName, region))) return

  await startSpinner(`Destroying cloud router \`${routerName}\``)
  try {
    await pExec(`gcloud compute routers delete ${routerName} --region ${region} --quiet`)
    await succeedSpinner(`Successfully deleted cloud router \`${routerName}\``)
  } catch (error) {
    await failSpinner(`Failed to delete cloud router \`${routerName}\``)
    await uxprintmult(error.stderr)
    throw error.stderr
  }
}

export const createCloudNAT = async (clusterName: string, region: string) => {
  const natName = getCloudNATName(clusterName)
  const routerName = getCloudRouterName(clusterName)

  await startSpinner(`Creating cloud NAT \`${natName}\``)
  try {
    await pExec(
      `gcloud compute routers nats create ${natName} --router-region ${region} --router ${routerName} --auto-allocate-nat-external-ips --nat-all-subnet-ip-ranges`,
    )
    await succeedSpinner(`Successfully created cloud NAT \`${natName}\``)
  } catch (error) {
    await failSpinner(`Failed to create cloud NAT \`${natName}\``)
    await uxprintmult(error.stderr)
    throw error.stderr
  }
}

const cloudNATExists = async (natName: string, routerName: string, region: string) => {
  try {
    await pExec(`gcloud compute routers nats describe ${natName} --router ${routerName} --region ${region}`)
    return true
  } catch (error) {
    return false
  }
}

export const destroyCloudNAT = async (clusterName: string, region: string) => {
  const natName = getCloudNATName(clusterName)
  const routerName = getCloudRouterName(clusterName)

  if (!(await cloudNATExists(natName, routerName, region))) return

  await startSpinner(`Destroying cloud NAT \`${natName}\``)
  try {
    await pExec(`gcloud compute routers nats delete ${natName} --router ${routerName} --region ${region} --quiet`)
    await succeedSpinner(`Successfully deleted cloud NAT \`${natName}\``)
  } catch (error) {
    await failSpinner(`Failed to delete cloud NAT \`${natName}\``)
    await uxprintmult(error.stderr)
    throw error.stderr
  }
}
