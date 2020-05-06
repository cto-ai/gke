import { Question, ux } from '@cto.ai/sdk'
import { PromptAnswer } from '../types'

const { magenta, red, green } = ux.colors

// export const gkeShowPreCreateMessage = async (zone: string, totalComputeInstancerequired: number) => {
//   const infoLines = [
//     `\nℹ️  In order to successfully create an GKE cluster in ${green(zone)}, you need to have availability for:\n`,
//     `  ∙ ${green('1')} VPC`,
//     `  ∙ ${green(totalComputeInstancerequired.toString())} GCE instance(s)`,
//     `  ∙ ${green('3')} Static IPs\n`,
//   ]

//   await uxprintmult(infoLines.join(`\n`))
//   return
// }

export const gkeClusterPrompts: Question<PromptAnswer>[] = [
  {
    type: 'input',
    name: 'clusterName',
    message: 'Please enter a cluster name',
  },
  // TODO - uncomment when ready to support this
  // {
  //   type: 'number',
  //   name: 'numWorkers',
  //   message: '\nPlease select the number of worker groups you would like to create: ',
  //   default: 1,
  //   validate: value => { return typeof value === 'number' },
  // },
]

export const confirmCreatePrompt: Question<Boolean> = {
  type: 'confirm',
  name: 'confirmCreate',
  default: false,
  message: `Please enter ${green('Y')} to create the cluster, or ${red('N')} to exit`,
}

export const generateGKEmachineTypePrompts = (gcpSizes: string[]): Question<PromptAnswer> => {
  return {
    type: 'autocomplete',
    name: 'instance_type',
    default: gcpSizes[0],
    message: 'Please select the size of the nodes in this group',
    choices: gcpSizes,
  }
}

export const gkeCapacityPrompt: Question<PromptAnswer> = {
  type: 'number',
  name: 'asg_desired_capacity',
  default: 1,
  message: `Please select the number of nodes per zone you would like to start with`,
}

export const gkeAutoscalingEnablePrompt: Question<PromptAnswer> = {
  type: 'confirm',
  name: 'autoscaling_enable',
  message: 'Would you like to enable autoscaling for this group?',
}

export const gkePrivateNodesPrompt: Question<Boolean> = {
  type: 'confirm',
  name: 'enablePrivateNodes',
  default: true,
  message: 'Should nodes have internal IP addresses only? This is also known as a private cluster',
}

export const gkeEnableStackdriverPrompt: Question<Boolean> = {
  type: 'confirm',
  name: 'enableStackdriver',
  default: false,
  message:
    'Would you like to enable Stackdriver Kubernetes Engine Monitoring (https://cloud.google.com/kubernetes-engine-monitoring/)?',
}

export const generateGKEMasterCidrPrompt = (exclusions: boolean): Question<String> => {
  const message = [
    'We need a private CIDR range for the master(s)',
    exclusions ? `, which should ${red('NOT')} overlap with any of the above ranges.\n` : '.\n',
    'Enter the IPv4 CIDR block for the master(s)',
  ]
  return {
    type: 'input',
    name: 'masterIpv4CidrBlock',
    message: message.join(''),
  }
}

export const gkeAutoscalingPrompts: Question[] = [
  {
    type: 'number',
    name: 'asg_min_size',
    default: 1,
    message: `${magenta('Please select a minimum & maximum number of worker nodes per zone for the autoscaler:')} \nMinimum number of nodes per zone`,
  },
  {
    type: 'number',
    name: 'asg_max_size',
    default: 2,
    message: `Maximum number of nodes per zone`,
  },
]

export const anotherWorkerGroupPrompt: Question<Boolean> = {
  type: 'confirm',
  message: 'Do you want to create another worker group?',
  name: 'anotherWorkerGroup',
}

export const GKEdeleteClusterPrompts: Question<String> = {
  type: 'input',
  name: 'clusterToDestroy',
  message: `🔥 Please enter the name of the cluster you would like to destroy \n${red(
    'Warning: this WILL initiate cluster destruction!',
  )}`,
}

export const multipleBastionsPrompt = (bastionNames: string[]): Question<String> => {
  return {
    type: 'autocomplete',
    name: 'multipleBastions',
    message: `Multiple possible bastions detected! Please select the bastion to delete!`,
    choices: bastionNames,
  }
}
