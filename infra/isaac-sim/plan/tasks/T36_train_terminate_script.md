# T36_train_terminate_script

Status: TODO  
Depends on: T34_train_spot_fleet_script  
Outputs: Cleanup script for training resources.

## Purpose

Terminate Spot instances/fleets cleanly to stop cost.

## Steps

1. Write `scripts/50_terminate_train.sh` that:
   - takes `fleet-id` or `instance-id`
   - cancels fleet request
   - terminates instances

## Script Skeleton

```bash
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_env.sh"

FLEET_ID="${1:?pass fleet-id}"

aws ec2 delete-fleets \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --fleet-ids "$FLEET_ID" \
  --terminate-instances
```

## Acceptance

- Fleet and Spot instances terminate; no running GPUs remain.

## Rollback

None; script is destructive by design.

