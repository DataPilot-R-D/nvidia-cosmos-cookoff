#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/00_env.sh"

aws cloudformation delete-stack \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}"

echo "Waiting for stack deletion: ${STACK_NAME}"
aws cloudformation wait stack-delete-complete \
  --profile "${AWS_PROFILE}" \
  --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}"

echo "Stack ${STACK_NAME} deleted."
