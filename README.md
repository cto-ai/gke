![CTO Banner](https://cto.ai/static/oss-banner.png)

# GKE Op

An Op that facilitates the creation and destruction of [GKE](https://cloud.google.com/kubernetes-engine) (Google Kubernetes Engine) clusters.

## Requirements

### Ops Platform

Running this op requires you to have access to the [Ops Platform](https://cto.ai/platform). Please review the [documentation](https://cto.ai/docs/overview) for detailed instructions on how to install the Ops CLI and/or Ops Slack application.

### GCP Credentials

❗️ **Please consider running this op in a test environment before running it in a production enviroment.**

Before running the op, please set the GCP credentials as a secret, following the instructions below. In order for the op to automatically retrieve these secrets, please reference the details below for the exact key names you should use when storing them. If the auto-match fails, the op users will be prompted to select an option from the available list of secrets every time they run the op.

`GOOGLE_APPLICATION_CREDENTIALS`

The following predefined [roles](https://cloud.google.com/iam/docs/understanding-roles#predefined_roles) are required for all of the features in this op to function as expected:
* Compute Instance Admin
* Compute Network Admin
* Compute Security Admin
* Kubernetes Engine Cluster Admin
* Service Account User

Please refer to [this URL](https://cloud.google.com/iam/docs/creating-managing-service-accounts) for instructions on how to create a service account with the above mentioned permissions. Once created, you will need to create a private key for the respective service account and download it to your computer (JSON). When ready, run the following command to save the credentials as a secret in your Ops team, replacing `<key_file>` with the full path to your credentials JSON file:

```sh
ops secrets:set -k GOOGLE_APPLICATION_CREDENTIALS -v "$(cat <key_file> | tr -d '\n')"
```

## Usage

### CLI

```sh
ops run gke
```

### Slack

```
/ops run gke
```

## Features

### Create cluster

- Public or private topology (will create a bastion host inside the VPC; all access to the cluster will happen through the bastion host)
- Configure Stackdriver Kubernetes Engine Monitoring (y/n, incurs additional costs)
- Configure worker nodes instance types (supports multiple worker groups)
- Configure autoscaling (y/n) and min/max nodes

### Destroy cluster

- Select existing cluster
- Destroy all associated resources, incl. bastion host

## Contributing

See the [Contributing Docs](CONTRIBUTING.md) for more information.

## Contributors

<table>
  <tr>
    <td align="center"><a href="https://github.com/aschereT"><img src="https://avatars2.githubusercontent.com/u/12742227?s=100" width="100px;" alt=""/><br /><sub><b>Vincent Tan</b></sub></a><br/></td>
    <td align="center"><a href="https://github.com/ruxandrafed"><img src="https://avatars2.githubusercontent.com/u/11021586?s=100" width="100px;" alt=""/><br /><sub><b>Ruxandra Fediuc</b></sub></a><br/></td>
  </tr>
</table>

## License

[MIT](LICENSE)