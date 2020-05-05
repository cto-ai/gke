import { ux } from '@cto.ai/sdk'

//a wrapper to ux.print that acts more like console.log
//(hopefully)handles circular references
export const uxprintmult = async (...args: any) => {
  //set up the formatter to be very conservative
  //ensure format is empty. this does mean an extra space is added for each argument
  const util = require('util')
  let output: string = ''
  args.forEach(element => {
    output = output.concat(
      util.formatWithOptions(
        {
          showHidden: false,
          showProxy: false,
          compact: false,
          sorted: false,
          getters: false,
        },
        element,
      ),
    )
  })
  return await ux.print(output + '\n')
  // if (out[out.length - 1] == '\n') {
  //     return await ux.print(out)
  // } else {
  //     return await ux.print(out + '\n')
  // }
}
