export const GOOGLE_APPLICATION_CREDENTIALS = '/ops/gcp.json'

// see https://cloud.google.com/kubernetes-engine/docs/how-to/alias-ips#cluster_sizing_primary_range
export const DEFAULT_PRIVATE_SUBNET_IP_RANGE = '10.0.0.0/24'
export const PRIVATE_SUBNET_POD_RANGE = '10.1.0.0/16' // not used
export const PRIVATE_SUBNET_SERVICE_RANGE = '10.2.0.0/20' // not used

export const GCP_ACCESS_SCOPES = {
  'Default GKE': 'default',
  Custom: 'custom',
  'All Cloud APIs': 'all',
}

export const GCP_FULL_ACCESS_SCOPE = {
  'All Cloud APIs': 'https://www.googleapis.com/auth/cloud-platform',
}

export const GCP_DEFAULT_ACCESS_SCOPES = {
  'Storage - Read Only [Default]': 'https://www.googleapis.com/auth/devstorage.read_only',
  'Logging - Write [Default]': 'https://www.googleapis.com/auth/logging.write',
  'Monitoring [Default]': 'https://www.googleapis.com/auth/monitoring',
  'Service Control [Default]': 'https://www.googleapis.com/auth/servicecontrol',
  'Service Management - Read Only [Default]': 'https://www.googleapis.com/auth/service.management.readonly',
  'Stackdriver Trace - Write Only [Default]': 'https://www.googleapis.com/auth/trace.append',
}

export const GCP_CUSTOM_ACCESS_SCOPES = {
  'User Info': 'https://www.googleapis.com/auth/userinfo.email',
  'Compute Engine - Read Only': 'https://www.googleapis.com/auth/compute.readonly',
  'Compute Engine - Read Write': 'https://www.googleapis.com/auth/compute',
  'Storage - Write Only': 'https://www.googleapis.com/auth/devstorage.write_only',
  'Storage - Read Write': 'https://www.googleapis.com/auth/devstorage.read_write',
  'Storage - Full': 'https://www.googleapis.com/auth/devstorage.full_control',
  'Task Queue': 'https://www.googleapis.com/auth/taskqueue',
  BigQuery: 'https://www.googleapis.com/auth/bigquery',
  'Cloud SQL': 'https://www.googleapis.com/auth/sqlservice.admin',
  'Cloud Datastore': 'https://www.googleapis.com/auth/datastore',
  'Logging - Read': 'https://www.googleapis.com/auth/logging.read',
  'Logging - Full': 'https://www.googleapis.com/auth/logging.admin',
  'Bigtable Data - Read Only': 'https://www.googleapis.com/auth/bigtable.data.readonly',
  'Bigtable Data - Read Write': 'https://www.googleapis.com/auth/bigtable.data',
  'Bigtable Admin - Tables Only': 'https://www.googleapis.com/auth/bigtable.admin.table',
  'Bigtable Admin - Full': 'https://www.googleapis.com/auth/bigtable.admin',
  'Cloud Pub/Sub': 'https://www.googleapis.com/auth/pubsub',
  'Service Management - Read Write': 'https://www.googleapis.com/auth/service.management',
  'Stackdriver Trace - Read Only': 'https://www.googleapis.com/auth/trace.readonly',
  'Cloud Source Repositories - Read Only': 'https://www.googleapis.com/auth/source.read_only',
  'Cloud Source Repositories - Read Write': 'https://www.googleapis.com/auth/source.read_write',
  'Cloud Source Repositories - Full Control': 'https://www.googleapis.com/auth/source.full_control',
  'Cloud Debugger': 'https://www.googleapis.com/auth/cloud_debugger',
}

export const GCP_ALL_ACCESS_SCOPES = {
  ...GCP_FULL_ACCESS_SCOPE,
  ...GCP_DEFAULT_ACCESS_SCOPES,
  ...GCP_CUSTOM_ACCESS_SCOPES,
}

export const CLUSTER_OPERATION_WIP_STATUSES = ['STATUS_UNSPECIFIED', 'PENDING', 'RUNNING']
export const CLUSTER_OPERATION_SUCCESS_STATUSES = ['DONE', 'ABORTING']
export const CLUSTER_OPERATION_FAILURE_STATUSES = ['ABORTING']
