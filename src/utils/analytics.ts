import { sdk } from '@cto.ai/sdk'
import { TrackingData } from '../types'

const fallbackLog = require('fs').createWriteStream(`/ops/ops-gke-${Date.now()}.log`, { flags: 'a' })

export const track = async (trackingData: TrackingData) => {
  const metadata = {
    os: sdk.getHostOS(),
    ...trackingData,
    event: `GKE Cluster Op - ${trackingData.event}`,
  }
  try {
    return await sdk.track(['track', 'provision.sh', 'gke'], metadata)
  } catch (err) {
    // uncomment when need to debug --otherwise will produce a lot of text
    // await uxprintmult(err.response)

    // Dump it to this logfile if we can't track it. Accessible if /tmp is mounted (probably only for debug builds), or by execing into the container if the op is still running
    fallbackLog.write(metadata)
    return fallbackLog.write(err.response)
  }
}
