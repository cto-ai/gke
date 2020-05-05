import { ux } from '@cto.ai/sdk'
import { track } from '.'

const yargs = require('yargs')
const { red } = ux.colors

export const invalidParam = async ({ name, param, validOptions }) => {
  await ux.print(`\n${red(`'${param}' is an invalid ${name} name! The valid options are: ${validOptions.join(', ')}`)}`)

  await track({ event: `invalid ${name} param ${param}` })
}

export const getArg = (arg: string): string => {
  const args: object = yargs.argv
  return args[arg] || ''
}

export const getFlags = argv => {
  return argv.filter(arg => arg.startsWith('-'))
}
