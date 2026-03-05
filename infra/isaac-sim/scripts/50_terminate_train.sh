#!/usr/bin/env bash
# Terminate a Spot Fleet and its instances.
set -euo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${script_dir}/00_env.sh"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <fleet-id>" >&2
  exit 1
fi

FLEET_ID="$1"

aws ec2 delete-fleets \
  --profile "${AWS_PROFILE}" --region "${AWS_REGION}" \
  --fleet-ids "${FLEET_ID}" \
  --terminate-instances

echo "Requested termination for fleet ${FLEET_ID} and its instances."
