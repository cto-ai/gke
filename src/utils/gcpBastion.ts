import { ux } from '@cto.ai/sdk'
import { GCPConfig, GKEClusterSettings, BastionInfo } from '../types'
import { track } from './analytics'
import { getValidatedPrompt } from './validatePrompts'
import { multipleBastionsPrompt } from '../prompts'
import { getBastionName, getFirewallRuleName } from './resourceNames'
import { uxprintmult } from './print'
import { startSpinner, failSpinner, succeedSpinner } from './spinner'

const Compute = require('@google-cloud/compute')
const compute = new Compute()

const getBastionInstance = async (profileConfig: GCPConfig, clusterName: string) => {
  try {
    const bastionName = getBastionName(clusterName)
    let instanceData = await compute.getVMs({
      autoPaginate: true,
      filter: `name eq ${bastionName}`,
    })
    await track({
      event: `getBastionInstance response`,
      profileConfig,
      clusterName,
      instanceCount: instanceData.length,
    })
    return instanceData[0]
  } catch (error) {
    await track({
      event: `getBastionInstance failed to get list of VMs`,
      profileConfig,
      clusterName,
      error: JSON.stringify(error),
    })
    throw error
  }
}

export const createBastion = async (
  profileConfig: GCPConfig,
  gkeSettings: GKEClusterSettings,
): Promise<BastionInfo> => {
  const { region, clusterName, subnetwork } = gkeSettings
  const [zones] = await compute.getZones({
    filter: `name eq ${region}-.*`,
  })
  if (zones.length == 0) {
    throw `Failed to create bastion. No zones in ${region} region!`
  }
  const zone = zones[0].name

  const bastionName = getBastionName(clusterName)
  const subnetName = subnetwork

  const createBastionRequest = {
    kind: 'compute#instance',
    name: bastionName,
    zone: `projects/${profileConfig.project_id}/zones/${zone}`,
    machineType: `projects/${profileConfig.project_id}/zones/${zone}/machineTypes/g1-small`,
    metadata: {
      kind: 'compute#metadata',
      items: [
        {
          key: 'startup-script',
          value: `#! /bin/bash\napt update && apt -y full-upgrade && apt install kubectl && apt -y autoremove && apt -y autoclean\n echo 'gcloud container --project ${profileConfig.project_id} clusters get-credentials ${clusterName} --region=${region}' > /etc/profile.d/gkeops-${clusterName}.sh`,
        },
      ],
    },
    tags: {
      items: [bastionName],
    },
    disks: [
      {
        kind: 'compute#attachedDisk',
        type: 'PERSISTENT',
        boot: true,
        mode: 'READ_WRITE',
        autoDelete: true,
        deviceName: bastionName,
        initializeParams: {
          sourceImage: 'projects/debian-cloud/global/images/family/debian-10',
          diskType: `projects/${profileConfig.project_id}/zones/${zone}/diskTypes/pd-standard`,
          diskSizeGb: '10',
        },
      },
    ],
    networkInterfaces: [
      {
        kind: 'compute#networkInterface',
        subnetwork: `projects/${profileConfig.project_id}/regions/${region}/subnetworks/${subnetName}`,
        accessConfigs: [
          {
            kind: 'compute#accessConfig',
            name: 'External NAT',
            type: 'ONE_TO_ONE_NAT',
            networkTier: 'PREMIUM',
          },
        ],
      },
    ],
    description: `Bastion host for GKE ops cluster ${clusterName}`,
    serviceAccounts: [
      {
        email: profileConfig.client_email, // TODO: use dedicated SA created for bastion
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      },
    ],
  }

  try {
    await startSpinner(`Creating bastion \`${bastionName}\``)
    const [vm, operationCreate] = await compute
      .zone(zone)
      .vm(bastionName)
      .create(createBastionRequest)
    await operationCreate.promise()
    const [bastionInfo] = await compute
      .zone(zone)
      .vm(bastionName)
      .get()
    await succeedSpinner(`Successfully created bastion \`${bastionName}\``)
    await track({
      event: 'Successfully created bastion',
      bastionName,
      subnetName,
      bastionInfo,
    })
    return bastionInfo
  } catch (error) {
    await failSpinner(`Failed to create bastion \`${bastionName}\``)
    await track({
      event: 'Error creating bastion',
      bastionName,
      error: JSON.stringify(error),
    })
    await uxprintmult(error)
    throw error
  }
}

export const createBastionSSHFirewallRule = async (clusterSettings: GKEClusterSettings, bastionInfo: BastionInfo) => {
  const {
    clusterName,
    network,
    profile: { project_id },
  } = clusterSettings
  const firewallName = getFirewallRuleName(clusterName)
  try {
    await startSpinner('Configuring bastion SSH access')
    const [firewall, operation] = await compute.createFirewall(firewallName, {
      network: `projects/${project_id}/global/networks/${network}`,
      protocols: {
        tcp: [22],
      },
      ranges: ['0.0.0.0/0'], // TODO: Ask user for IP ranges?
      tags: [bastionInfo.name],
    })
    await operation.promise()
    await succeedSpinner('Successfully configured bastion SSH access')
    await track({
      event: 'Successfully created firewall rule to allow SSH access to bastion',
      firewallName,
    })
    return firewall
  } catch (error) {
    await failSpinner('Failed to configure bastion SSH access')
    await track({
      event: 'Error creating firewall rule to allow SSH access to bastion',
      firewallName,
      error: JSON.stringify(error),
    })
    await uxprintmult(error)
    throw error
  }
}

export const destroyBastionSSHFirewallRule = async (clusterName: string) => {
  const firewallName = getFirewallRuleName(clusterName)
  const firewall = compute.firewall(firewallName)

  const [exists] = await firewall.exists()
  if (!exists) return

  try {
    await startSpinner(`Destroying custom firewall \`${firewallName}\``)
    const [operation] = await firewall.delete()
    await operation.promise()
    await succeedSpinner(`Successfully deleted custom firewall \`${firewallName}\``)
    await track({
      event: `Successfully deleted custom firewall`,
      firewallName,
    })
    return operation
  } catch (error) {
    await failSpinner(`Failed to delete custom firewall \`${firewallName}\`. Please check and clean up manually!`)
    await track({
      event: `Failed to delete custom firewall`,
      firewallName,
      error: JSON.stringify(error),
    })
    await uxprintmult(error)
    throw error
  }
}

export const destroyBastion = async (profileConfig: GCPConfig, clusterName: string) => {
  let bastions = await getBastionInstance(profileConfig, clusterName)
  let bastion
  if (bastions.length === 0) {
    await track({
      event: `destroyBastion - no bastions found`,
      clusterName,
    })
    return
  } else if (bastions.length > 1) {
    await track({
      event: `destroyBastion multiple bastions found`,
      clusterName,
      bastionsCount: bastions.length,
    })
    bastion = await getValidatedPrompt(
      multipleBastionsPrompt(bastions),
      response => {
        return bastions.includes(response.multipleBastions)
      },
      'Must be one of the bastions listed!',
    )
  } else {
    bastion = bastions[0]
  }

  try {
    await startSpinner(`Destroying bastion \`${bastion.name}\``)
    const [operation] = await bastion.delete()
    await operation.promise()
    await succeedSpinner(`Successfully destroyed bastion \`${bastion.name}\``)
    await track({
      event: `Successfully destroyed bastion`,
      bastionName: bastion.name,
    })
    return operation
  } catch (error) {
    await failSpinner(`Failed to destroy bastion \`${bastion.name}\`. Please check and clean up manually!`)
    await track({
      event: `Failed to destroy bastion`,
      error: JSON.stringify(error),
      bastionName: bastion.name,
    })
    await uxprintmult(error)
    throw error
  }
}

// const createExternalIP = async (
//   gkeSettings: GKEClusterSettings,
// ) => {
//   await startSpinner('Reserving external IP for bastion')
//   const { region, clusterName } = gkeSettings
//   const addressName = getBastionExternalIPName(clusterName)
//   try {
//     const [address, operation] = await compute
//       .region(region)
//       .createAddress(addressName, {
//         networkTier: 'PREMIUM',
//         addressType: 'EXTERNAL'
//       })
//     await operation.promise()
//     await track({
//       event: 'Successfully reserved external IP address for bastion',
//       address
//     })
//     await succeedSpinner(
//       `Successfully reserved external IP address for bastion`,
//     )
//     return address
//   } catch (error) {
//     await track({
//       event: 'Error reserving external IP address',
//       addressName,
//       error: JSON.stringify(error)
//     })
//     await failSpinner('Failed to reserve external IP address for bastion!')
//     await uxprintmult(error)
//     throw error
//   }
// }

// const destroyExternalIP = async (
//   profileConfig: GCPConfig,
//   region: string,
//   clusterName: string,
// ) => {
//   const addressName = getBastionExternalIPName(clusterName)
//   const address = compute.region(region).address(addressName)

//   const [exists] = await address.exists()
//   if (!exists) return

//   try {
//     await startSpinner(
//       `Releasing bastion external IP address \`${addressName}\``,
//     )
//     const [operation] = await address.delete()
//     await operation.promise()
//     await succeedSpinner(
//       `Successfully released bastion external IP address \`${addressName}\``,
//     )
//     await track({
//       event: `Successfully released external IP address`,
//       addressName,
//     })
//     return operation
//   } catch (error) {
//     await failSpinner(
//       `Failed to release bastion external IP address \`${addressName}\`. Please check and clean up manually!`,
//     )
//     await track({
//       event: `Failed to release external IP address`,
//       addressName,
//       error: JSON.stringify(error),
//     })
//     await uxprintmult(error)
//     throw error
//   }
// }
