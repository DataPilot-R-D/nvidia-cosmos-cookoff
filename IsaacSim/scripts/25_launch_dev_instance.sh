#!/usr/bin/env bash
# Launch the always-on Dev workstation from the baked Dev AMI.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/00_env.sh"

OUT="$(cat "${script_dir}/infra_outputs.json")"
get_out() { echo "${OUT}" | jq -r ".[] | select(.OutputKey==\"$1\") | .OutputValue"; }

SUBNET_ID=$(get_out PrivateSubnet1Id)
SG_ID=$(get_out DevSecurityGroupId)
PROFILE_NAME=$(get_out InstanceProfileName)
EFS_FS_ID=$(get_out EfsFileSystemId)
EFS_AP_ID=$(get_out EfsAccessPointId)

AMI_ID="${1:-${DEV_AMI_ID}}"
if [[ -z "${AMI_ID}" ]]; then
  echo "DEV_AMI_ID is empty. Pass AMI ID as first arg or set DEV_AMI_ID in scripts/00_env.sh" >&2
  exit 1
fi

ROOT_VOL_SIZE_GB="${ROOT_VOL_SIZE_GB:-300}"

cat > /tmp/dev-userdata.sh <<EOF
#!/bin/bash
set -euxo pipefail
EFS_FS_ID="${EFS_FS_ID}"
EFS_AP_ID="${EFS_AP_ID}"
apt-get update
apt-get install -y amazon-efs-utils jq
mkdir -p /shared
mount -t efs -o tls,accesspoint=\${EFS_AP_ID} \${EFS_FS_ID}:/ /shared
echo "\${EFS_FS_ID}:/ /shared efs _netdev,tls,accesspoint=\${EFS_AP_ID} 0 0" >> /etc/fstab
# Restart DCV if baked into AMI
if systemctl list-units --type=service --all | grep -q dcvserver; then
  systemctl enable --now dcvserver || true
fi
EOF

USER_DATA_B64=$(base64 < /tmp/dev-userdata.sh | tr -d '\n')

DEV_ID=$(aws ec2 run-instances \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --image-id "${AMI_ID}" \
  --instance-type "${DEV_INSTANCE_TYPE}" \
  --key-name "${KEYPAIR_NAME}" \
  --iam-instance-profile Name="${PROFILE_NAME}" \
  --subnet-id "${SUBNET_ID}" \
  --security-group-ids "${SG_ID}" \
  --no-associate-public-ip-address \
  --block-device-mappings "[{\"DeviceName\":\"/dev/sda1\",\"Ebs\":{\"VolumeSize\":${ROOT_VOL_SIZE_GB},\"VolumeType\":\"gp3\"}}]" \
  --user-data "${USER_DATA_B64}" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${PROJECT}-dev},{Key=Project,Value=${TAG_PROJECT}},{Key=Role,Value=dev}]" \
  --query "Instances[0].InstanceId" --output text)

echo "Dev instance launched: ${DEV_ID}"
