export const getBastionName = (clusterName: string): string => `gke-ops-${clusterName}-bastion`
export const getNetworkName = (clusterName: string): string => `gke-ops-${clusterName}-network`
export const getPrivateSubnetworkName = (clusterName: string): string => `gke-ops-${clusterName}-network-private-subnet`
export const getFirewallRuleName = (clusterName: string): string => `gke-ops-${clusterName}-bastion-allow-ssh`
export const getCloudRouterName = (clusterName: string): string => `gke-ops-${clusterName}-cloud-router`
export const getCloudNATName = (clusterName: string): string => `gke-ops-${clusterName}-cloud-nat`
export const getBastionExternalIPName = (clusterName: string): string => `gke-ops-${clusterName}-bastionaddr`
