# T24_dev_ami_bake

Status: TODO  
Depends on: T23_dev_builder_bootstrap  
Outputs: Dev Golden AMI ID (Strategy B only).

## Purpose

Freeze the configured Dev builder into a reusable AMI.

## Steps

1. Stop any running GUI apps on builder.
2. Create AMI.
3. Wait for AMI to become `available`.
4. Store AMI ID in `scripts/00_env.sh`.

## Commands

```bash
DEV_BUILDER_ID="<builder-id>"

DEV_AMI_ID=$(aws ec2 create-image \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --instance-id "$DEV_BUILDER_ID" \
  --name "${PROJECT}-dev-ami-$(date +%Y%m%d)" \
  --description "IsaacSim dev workstation AMI" \
  --tag-specifications "ResourceType=image,Tags=[{Key=Project,Value=${TAG_PROJECT}},{Key=Role,Value=dev-ami}]" \
  --query "ImageId" --output text)

aws ec2 wait image-available \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --image-ids "$DEV_AMI_ID"

echo "Dev AMI: $DEV_AMI_ID"
```

## Acceptance

- AMI is `available` and boots successfully when launched.

## Rollback

- Deregister invalid AMI:  
  `aws ec2 deregister-image --image-id $DEV_AMI_ID`.

