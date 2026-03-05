#!/usr/bin/env bash
# Bake a Dev AMI from the configured Dev builder instance.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/00_env.sh"

DEV_BUILDER_ID="${1:-}"
if [[ -z "${DEV_BUILDER_ID}" ]]; then
  echo "Usage: $0 <dev-builder-instance-id>" >&2
  exit 1
fi

AMI_NAME="${PROJECT}-dev-ami-$(date +%Y%m%d)"

DEV_AMI_ID=$(aws ec2 create-image \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --instance-id "${DEV_BUILDER_ID}" \
  --name "${AMI_NAME}" \
  --description "Isaac Sim Dev Workstation AMI" \
  --tag-specifications "ResourceType=image,Tags=[{Key=Project,Value=${TAG_PROJECT}},{Key=Role,Value=dev-ami}]" \
  --query "ImageId" --output text)

echo "Waiting for AMI to become available: ${DEV_AMI_ID}"
aws ec2 wait image-available \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --image-ids "${DEV_AMI_ID}"

echo "Dev AMI ready: ${DEV_AMI_ID}"
