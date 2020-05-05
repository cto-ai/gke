import { promisify } from 'util'
import { exec } from 'child_process'
import { sdk, ux } from '@cto.ai/sdk'

const {
  reset: { bold, magenta },
} = ux.colors

// pExec executes commands in the shell https://stackoverflow.com/questions/20643470/execute-a-command-line-binary-with-node-js
export const pExec = promisify(exec)

export const pExecWithLogs = async (command: string) => {
  sdk.log(bold(`Running ${magenta(command)}`))

  const { stdout, stderr } = await pExec(command)
  if (stdout) sdk.log(stdout)
  if (stderr) sdk.log(stderr)

  return { stdout, stderr }
}
