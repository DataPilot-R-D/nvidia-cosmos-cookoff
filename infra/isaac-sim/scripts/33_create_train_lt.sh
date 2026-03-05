#!/usr/bin/env bash
# Create or update the training Launch Template used by Spot Fleet.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/00_env.sh"

OUT="$(cat "${script_dir}/infra_outputs.json")"
get_out() { echo "${OUT}" | jq -r ".[] | select(.OutputKey==\"$1\") | .OutputValue"; }

SUBNET_ID=$(get_out PrivateSubnet2Id)
SG_ID=$(get_out TrainSecurityGroupId)
PROFILE_NAME=$(get_out InstanceProfileName)
EFS_FS_ID=$(get_out EfsFileSystemId)
EFS_AP_ID=$(get_out EfsAccessPointId)
ARTIFACTS_BUCKET=$(get_out ArtifactsBucketName)

AMI_ID="${1:-${TRAIN_AMI_ID}}"
if [[ -z "${AMI_ID}" ]]; then
  echo "TRAIN_AMI_ID is empty and no AMI passed. Pass AMI ID as first arg or set TRAIN_AMI_ID." >&2
  exit 1
fi

# Build user data for mounting EFS and running job-runner (assumes baked onto AMI at /opt/isaacsim/job-runner.sh)
cat > /tmp/train-userdata.sh <<EOF
#!/bin/bash
set -euxo pipefail

EFS_FS_ID="${EFS_FS_ID}"
EFS_AP_ID="${EFS_AP_ID}"
ARTIFACTS_BUCKET="${ARTIFACTS_BUCKET}"

apt-get update
apt-get install -y amazon-efs-utils jq awscli

mkdir -p /shared
mount -t efs -o tls,accesspoint=\${EFS_AP_ID} \${EFS_FS_ID}:/ /shared
echo "\${EFS_FS_ID}:/ /shared efs _netdev,tls,accesspoint=\${EFS_AP_ID} 0 0" >> /etc/fstab

# Set defaults for job runner
export ARTIFACTS_BUCKET="\${ARTIFACTS_BUCKET}"
export JOB_ID="\${JOB_ID:-latest}"

# Run job runner if present
if [[ -x /opt/isaacsim/job-runner.sh ]]; then
  /opt/isaacsim/job-runner.sh
else
  echo "Job runner not found at /opt/isaacsim/job-runner.sh; leaving instance up for manual use."
fi
EOF

USER_DATA_B64=$(base64 < /tmp/train-userdata.sh | tr -d '\n')

LT_NAME="${PROJECT}-train-lt"

aws ec2 create-launch-template \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --launch-template-name "${LT_NAME}" \
  --launch-template-data "{
    \"ImageId\": \"${AMI_ID}\",
    \"InstanceType\": \"${TRAIN_INSTANCE_TYPES[0]}\",
    \"IamInstanceProfile\": {\"Name\": \"${PROFILE_NAME}\"},
    \"NetworkInterfaces\": [{
      \"AssociatePublicIpAddress\": false,
      \"SubnetId\": \"${SUBNET_ID}\",
      \"Groups\": [\"${SG_ID}\"]
    }],
    \"UserData\": \"${USER_DATA_B64}\",
    \"TagSpecifications\": [
      {\"ResourceType\":\"instance\",\"Tags\":[{\"Key\":\"Project\",\"Value\":\"${TAG_PROJECT}\"},{\"Key\":\"Role\",\"Value\":\"train\"}]},
      {\"ResourceType\":\"volume\",\"Tags\":[{\"Key\":\"Project\",\"Value\":\"${TAG_PROJECT}\"},{\"Key\":\"Role\",\"Value\":\"train\"}]}
    ]
  }" \
  >/tmp/lt-response.json

LT_ID=$(jq -r '.LaunchTemplate.LaunchTemplateId' /tmp/lt-response.json)
LT_VERSION=$(jq -r '.LaunchTemplate.LatestVersionNumber' /tmp/lt-response.json)

echo "Launch Template created: ${LT_ID} (version ${LT_VERSION})"
echo "Name: ${LT_NAME}"
