#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/00_env.sh"

OUT_FILE="${script_dir}/infra_outputs.json"

aws cloudformation describe-stacks \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs" \
  --output json > "${OUT_FILE}"

echo "Wrote outputs to ${OUT_FILE}"
cat "${OUT_FILE}" | jq .
