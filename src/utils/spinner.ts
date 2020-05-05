import { sdk, ux } from '@cto.ai/sdk'

export const startSpinner = async (text: string) => {
  return await ux.print(`⏳  ${text}`)
}

export const succeedSpinner = async (text: string) => {
  return await ux.print(`✅  ${ux.colors.green(text)}`)
}

export const failSpinner = async (text:string) => {
  return await ux.print(`❌  ${ux.colors.red(text)}`)
}