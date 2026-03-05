# T32_train_ami_bake

Status: TODO  
Depends on: T31_train_builder_bootstrap  
Outputs: Train AMI ID.

## Purpose

Bake the headless training environment into a reusable AMI.

## Commands

```bash
TRAIN_AMI_ID=$(aws ec2 create-image \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --instance-id "$TRAIN_BUILDER_ID" \
  --name "${PROJECT}-train-ami-$(date +%Y%m%d)" \
  --description "IsaacSim headless training AMI" \
  --tag-specifications "ResourceType=image,Tags=[{Key=Project,Value=${TAG_PROJECT}},{Key=Role,Value=train-ami}]" \
  --query "ImageId" --output text)

aws ec2 wait image-available \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --image-ids "$TRAIN_AMI_ID"
```

## Acceptance

- AMI becomes `available` and boots in a test launch.

## Rollback

- Deregister AMI if invalid.

