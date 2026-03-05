#!/usr/bin/env bash
# Launch a Spot training node via EC2 Fleet using the training Launch Template.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/00_env.sh"

LT_NAME="${1:-${PROJECT}-train-lt}"
TARGET_CAPACITY="${TARGET_CAPACITY:-1}"

LT_DESC=$(aws ec2 describe-launch-templates \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --launch-template-names "${LT_NAME}" \
  --query "LaunchTemplates[0]" --output json 2>/dev/null || true)

if [[ -z "${LT_DESC}" || "${LT_DESC}" == "null" ]]; then
  echo "Launch Template ${LT_NAME} not found. Create it first with scripts/33_create_train_lt.sh." >&2
  exit 1
fi

LT_ID=$(echo "${LT_DESC}" | jq -r '.LaunchTemplateId')
LT_VERSION=$(echo "${LT_DESC}" | jq -r '.LatestVersionNumber')

# Build instance-type overrides from TRAIN_INSTANCE_TYPES array
OVERRIDES=$(printf '%s\n' "${TRAIN_INSTANCE_TYPES[@]}" | jq -R . | jq -s 'map({InstanceType:.})')

FLEET_ID=$(aws ec2 create-fleet \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --spot-options "AllocationStrategy=capacity-optimized,InstanceInterruptionBehavior=terminate" \
  --launch-template-configs "[
    {
      \"LaunchTemplateSpecification\":{
        \"LaunchTemplateId\":\"${LT_ID}\",
        \"Version\":\"${LT_VERSION}\"
      },
      \"Overrides\":${OVERRIDES}
    }
  ]" \
  --target-capacity-specification "{
    \"TotalTargetCapacity\": ${TARGET_CAPACITY},
    \"DefaultTargetCapacityType\": \"spot\",
    \"OnDemandPercentageAboveBaseCapacity\": 0
  }" \
  --type "instant" \
  --tag-specifications "[
    {\"ResourceType\":\"fleet\",\"Tags\":[{\"Key\":\"Project\",\"Value\":\"${TAG_PROJECT}\"},{\"Key\":\"Role\",\"Value\":\"train\"}]},
    {\"ResourceType\":\"instance\",\"Tags\":[{\"Key\":\"Project\",\"Value\":\"${TAG_PROJECT}\"},{\"Key\":\"Role\",\"Value\":\"train\"}]},
    {\"ResourceType\":\"volume\",\"Tags\":[{\"Key\":\"Project\",\"Value\":\"${TAG_PROJECT}\"},{\"Key\":\"Role\",\"Value\":\"train\"}]}
  ]" \
  --query "FleetId" --output text)

echo "Fleet launched: ${FLEET_ID}"

aws ec2 describe-fleet-instances \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --fleet-id "${FLEET_ID}" \
  --query "ActiveInstances[].InstanceId" --output text || true
