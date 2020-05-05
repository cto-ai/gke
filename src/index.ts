import { ux } from '@cto.ai/sdk'
import Container from '@google-cloud/container'
import { CLUSTER_ACTIONS } from './constants'
import { gcpRegionPrompt, selectAction, showPrerunMessage } from './prompts'
import { GCPConfig } from './types'
import {
  getArg,
  invalidParam,
  track,
  uxprintmult,
  gcpCreate,
  gcpDestroy,
  gcpConfigureCreds,
  gcpGetRegions,
} from './utils'

async function main() {
  try {
    await showPrerunMessage()
    await track({ event: 'Showed prerun message' })

    const profileConfig: GCPConfig = await gcpConfigureCreds() // this needs to run before initializing any client

    let action: string = getArg('_')[0]

    if (!action) {
      const actionPrompt: { action: string } = await ux.prompt(selectAction)
      action = CLUSTER_ACTIONS[actionPrompt.action]
    }
    await track({ event: `Op action '${action}' selected` })

    const { region } = await ux.prompt(gcpRegionPrompt(await gcpGetRegions()))
    await track({ event: `Region '${region}' selected` })

    const client = new Container.v1.ClusterManagerClient()
    switch (action) {
      case 'create': {
        return await gcpCreate(profileConfig, client, region)
      }
      case 'destroy': {
        return await gcpDestroy(profileConfig, client, region)
      }
      default:
        return await invalidParam({
          name: 'action',
          param: action,
          validOptions: Object.values(CLUSTER_ACTIONS),
        })
    }
  } catch (error) {
    await uxprintmult(error)
    return
  }
}

main()
