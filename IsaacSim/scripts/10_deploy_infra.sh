#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/00_env.sh"

aws cloudformation deploy \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}" \
  --template-file "${script_dir%/*}/cfn/infra.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    ProjectName="${PROJECT}" \
    VpcCidr="${VPC_CIDR}" \
    PublicSubnetCidr="${PUBLIC_SUBNET_CIDR}" \
    PrivateSubnet1Cidr="${PRIVATE_SUBNET_1_CIDR}" \
    PrivateSubnet2Cidr="${PRIVATE_SUBNET_2_CIDR}" \
    VpnCidr="${VPN_CIDR}"

aws cloudformation describe-stacks \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].StackStatus"
