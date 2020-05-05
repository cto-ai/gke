import { Question, ux } from '@cto.ai/sdk'
import { CLUSTER_ACTIONS } from '../constants'
import { PromptAnswer } from '../types'

const { magenta } = ux.colors

// https://psfonttk.com/big-text-generator/
const logo = `
█▀▀▀ █░█ █▀▀   █▀▀█ █▀▀█
█░▀█ █▀▄ █▀▀   █░░█ █░░█
▀▀▀▀ ▀░▀ ▀▀▀   ▀▀▀▀ █▀▀▀
`

export const showPrerunMessage = async () => {
  const greetingLines = [
    `\n🦹  Hello there, we've been waiting for you! If you have any questions be sure to reach out to the CTO.ai team, we're always happy to help!`,
    `\n⚠️  This Op requires some setup. Here's what you'll need:`,
    `\n✅  Service account credentials from ${magenta('https://console.cloud.google.com/apis/credentials')}`,
  ]

  await ux.print(logo)
  await ux.print(greetingLines.join(`\n`))
}

export const selectAction: Question<PromptAnswer>[] = [
  {
    type: 'autocomplete',
    name: 'action',
    message: 'What would you like to do?',
    choices: Object.keys(CLUSTER_ACTIONS),
  },
]
