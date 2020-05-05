export type GCPConfig = {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_url: string
  token_url: string
  auth_provider_x509_cert_url: string
  client_x509_cert_url: string
}

export type PromptAnswer = {
  clusterNamep?: string
  instance_type?: string
  autoscaling_enable?: boolean
  asg_desired_capacity?: number
  confirmAddUsers?: boolean
}

export type MachineType = {
  id: string
  creationTimestamp: string
  name: string
  description: string
  guestCpus: number
  memoryMb: number
  imageSpaceGb: number
  maximumPersistentDisks: number
  maximumPersistentDisksSizeGb: string
  zone: string
  selfLink: string
  isSharedCpu: boolean
  kind: string
}

export type GCPNetwork = {
  id: string
  name: string
}

export type GCPSubnetwork = {
  id: string
  name: string
}

type NetworkInterface = {
  networkIP: string
}

export type BastionInfo = {
  name: string
  metadata: {
    networkInterfaces: NetworkInterface[]
  }
}
