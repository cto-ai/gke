import { GCPConfig } from './gcp'
import { createCustomNetwork } from '../utils'

export interface DefaultWorkerSettings {
  asg_desired_capacity: number
  asg_min_size: number | undefined
  asg_max_size: number | undefined
}

export interface WorkerSettings extends DefaultWorkerSettings {
  instance_type: string
  autoscaling_enable: boolean
  oauthScopes: string[]
}

export type MasterAuthorizedNetworksConfig = {
  enabled: boolean
  cidrBlocks: [
    {
      displayName: string
      cidrBlock: string
    },
  ]
}

export type GKEClusterSettings = {
  clusterName: string
  // numWorkers: number - TODO uncomment when ready to support
  enableStackdriver: boolean
  region: string
  customNetwork: boolean
  network: string
  subnetwork: string
  profile: GCPConfig
  workers: WorkerSettings[]
  enablePrivateNodes: boolean
  masterIpv4CidrBlock: string
  masterAuthorizedNetworksConfig: MasterAuthorizedNetworksConfig
}

export type AutoscalingConfig = {
  autoscaling_enable: boolean
  asg_desired_capacity: number
  asg_min_size: number | undefined
  asg_max_size: number | undefined
}
