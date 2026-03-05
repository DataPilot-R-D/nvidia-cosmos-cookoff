#!/usr/bin/env bash
# Launch a Dev builder instance (Ubuntu 22.04) in the private subnet.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/00_env.sh"

OUT="$(cat "${script_dir}/infra_outputs.json")"
get_out() { echo "${OUT}" | jq -r ".[] | select(.OutputKey==\"$1\") | .OutputValue"; }

SUBNET_ID=$(get_out PrivateSubnet1Id)
SG_ID=$(get_out DevSecurityGroupId)
PROFILE_NAME=$(get_out InstanceProfileName)

UBUNTU_AMI="${1:-}"
if [[ -z "${UBUNTU_AMI}" ]]; then
  UBUNTU_AMI=$(aws ssm get-parameter \
    --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
    --name "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp3/ami-id" \
    --query "Parameter.Value" --output text 2>/tmp/ami.err || true)
  if [[ -z "${UBUNTU_AMI}" || "${UBUNTU_AMI}" == "None" ]]; then
    UBUNTU_AMI=$(aws ssm get-parameter \
      --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
      --name "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id" \
      --query "Parameter.Value" --output text)
  fi
fi

DEV_BUILDER_ID=$(aws ec2 run-instances \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --image-id "${UBUNTU_AMI}" \
  --instance-type "${DEV_INSTANCE_TYPE}" \
  --key-name "${KEYPAIR_NAME}" \
  --iam-instance-profile Name="${PROFILE_NAME}" \
  --subnet-id "${SUBNET_ID}" \
  --security-group-ids "${SG_ID}" \
  --no-associate-public-ip-address \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${PROJECT}-dev-builder},{Key=Project,Value=${TAG_PROJECT}},{Key=Role,Value=builder}]" \
  --query "Instances[0].InstanceId" --output text)

echo "Dev builder launched: ${DEV_BUILDER_ID}"
