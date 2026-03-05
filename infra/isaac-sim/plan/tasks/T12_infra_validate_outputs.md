# T12_infra_validate_outputs

Status: TODO  
Depends on: T11_infra_deploy  
Outputs: Machine‑readable infra outputs for later scripts.

## Purpose

Capture stack outputs once, so later scripts don’t re‑query ad hoc.

## Steps

1. Describe stack outputs.
2. Persist to `scripts/infra_outputs.json`.

## Commands

```bash
source scripts/00_env.sh

aws cloudformation describe-stacks \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs" \
  --output json > scripts/infra_outputs.json

cat scripts/infra_outputs.json | jq .
```

## Acceptance

- JSON contains keys:
  - `VpcId`, `PrivateSubnet1Id`, `PrivateSubnet2Id`
  - `DevSecurityGroupId`, `TrainSecurityGroupId`
  - `EfsFileSystemId`, `EfsAccessPointId`
  - `InstanceProfileName`
  - `ArtifactsBucketName`

## Rollback

- Delete the JSON if corrupted and regenerate.

