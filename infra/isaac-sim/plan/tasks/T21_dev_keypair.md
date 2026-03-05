# T21_dev_keypair

Status: TODO  
Depends on: T12_infra_validate_outputs  
Outputs: EC2 key pair ready for SSH access.

## Purpose

Builders and Dev instance need SSH access over VPN.

## Steps

1. Create key pair or choose existing.
2. Store private key securely on local machine.
3. Reference key name in `scripts/00_env.sh`.

## Commands (create new)

```bash
source scripts/00_env.sh

aws ec2 create-key-pair \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --key-name "$KEYPAIR_NAME" \
  --query "KeyMaterial" --output text > ~/.ssh/${KEYPAIR_NAME}.pem

chmod 600 ~/.ssh/${KEYPAIR_NAME}.pem
```

## Acceptance

- Key pair exists:  
  `aws ec2 describe-key-pairs --key-name $KEYPAIR_NAME`.

## Rollback

- Delete key pair if created by mistake:  
  `aws ec2 delete-key-pair --key-name $KEYPAIR_NAME`.

