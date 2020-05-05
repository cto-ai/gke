import { Question } from '@cto.ai/sdk'
import { GCPConfig, PromptAnswer } from '../types'
import { GCP_ACCESS_SCOPES, GCP_CUSTOM_ACCESS_SCOPES, SELECT_EXISTING_NETWORK, CREATE_NETWORK } from '../constants'

export const gcpAppCredsPrompt: Question<GCPConfig> = {
  type: 'secret',
  name: 'gkeJsonCreds',
  message:
    "Paste in the Google Cloud Platform credentials (JSON)\nRun `cat $GOOGLE_APPLICATION_CREDENTIALS | tr -d '\\n'` on a terminal",
}

export const gcpRegionPrompt = (regions: string[]): Question<String> => {
  return {
    type: 'autocomplete',
    name: 'region',
    message: '\nPlease select which region to operate on',
    choices: regions,
  }
}

export const userAccessPrompt = (users: any[]): Question<PromptAnswer>[] => {
  return [
    {
      type: 'confirm',
      name: 'confirmAddUsers',
      message: 'Would you like to grant additional users access to your cluster?',
    },
    {
      type: 'checkbox',
      name: 'users',
      message: 'Select any additional users you would like to grant access to your cluster',
      choices: users,
    },
  ]
}

export const nodeAccessLevel: Question<String> = {
  type: 'autocomplete',
  name: 'accessLevel',
  message: `Please select an access scopes configuration for your worker nodes`,
  choices: Object.keys(GCP_ACCESS_SCOPES),
}

export const nodeCustomAccessScopes: Question<String> = {
  type: 'checkbox',
  name: 'customScopes',
  message: `Select the custom access scopes you want to enable for your nodes`,
  choices: Object.keys(GCP_CUSTOM_ACCESS_SCOPES),
}

export const selectNetworkPrompt: Question<String> = {
  type: 'autocomplete',
  name: 'networkSelected',
  message: 'Please configure your cluster network',
  choices: [SELECT_EXISTING_NETWORK, CREATE_NETWORK],
}

export const getNetworkPrompt = (networks: string[]): Question<String> => {
  return {
    type: 'autocomplete',
    name: 'networkId',
    message: 'Select one of the following networks with subnets configured for the selected region',
    choices: networks,
  }
}

export const getSubnetworkPrompt = (subnetworks: string[]): Question<String> => {
  return {
    type: 'autocomplete',
    name: 'subnetworkId',
    message: 'Select a subnetwork for your cluster',
    choices: subnetworks,
  }
}

export const confirmRollbackPrompt: Question<String> = {
  type: 'confirm',
  name: 'confirmRollback',
  message: 'Please confirm if you would like any resources already created to be cleaned up',
  default: true,
}
