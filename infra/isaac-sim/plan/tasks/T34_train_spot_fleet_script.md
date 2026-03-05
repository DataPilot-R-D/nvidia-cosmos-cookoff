# T34_train_spot_fleet_script

Status: TODO  
Depends on: T33_train_launch_template  
Outputs: Scripted Spot fleet launcher with instance‑type overrides.

## Purpose

Enable “hardware switching” by letting Spot pick from multiple GPU types.

## Steps

1. Decide instance‑type override list (from `TRAIN_INSTANCE_TYPES`).
2. Write `scripts/40_launch_train_spot.sh` using `aws ec2 create-fleet` with:
   - Launch Template
   - capacity‑optimized allocation
   - one‑time request
3. Print fleet + instance IDs for tracking.

## Script Skeleton

```bash
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_env.sh"

LT_ID="<train-lt-id>"
LT_VERSION="1"

OVERRIDES=$(printf '{"InstanceType":"%s"},' "${TRAIN_INSTANCE_TYPES[@]}")
OVERRIDES="[${OVERRIDES%,}]"

FLEET_ID=$(aws ec2 create-fleet \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --spot-options "AllocationStrategy=capacity-optimized,InstanceInterruptionBehavior=terminate" \
  --launch-template-configs "[{
    \"LaunchTemplateSpecification\":{\"LaunchTemplateId\":\"$LT_ID\",\"Version\":\"$LT_VERSION\"},
    \"Overrides\":$OVERRIDES
  }]" \
  --target-capacity-specification "TotalTargetCapacity=1,DefaultTargetCapacityType=spot" \
  --type "instant" \
  --query "FleetId" --output text)

echo "Fleet launched: $FLEET_ID"
```

## Acceptance

- Fleet creates at least one Spot instance within a few minutes.
- Instance gets correct tags.

## Rollback

- Delete fleet and terminate instances via T36.

