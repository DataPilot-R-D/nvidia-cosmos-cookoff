# T25_dev_instance_launch

Status: TODO  
Depends on: T24_dev_ami_bake (or Marketplace AMI)  
Outputs: Always‑on Dev instance running.

## Purpose

Launch the persistent GUI Dev workstation in a private subnet.

## Steps

1. Pick AMI (Dev Golden or Marketplace).
2. Launch instance with Dev SG + instance profile + no public IP.
3. Resize root EBS and optionally attach data volume.
4. Tag instance for cost tracking.

## Commands (example)

```bash
source scripts/00_env.sh

OUT=$(cat scripts/infra_outputs.json)
get_out() { echo "$OUT" | jq -r ".[] | select(.OutputKey==\"$1\") | .OutputValue"; }

SUBNET_ID=$(get_out PrivateSubnet1Id)
SG_ID=$(get_out DevSecurityGroupId)
PROFILE_NAME=$(get_out InstanceProfileName)

DEV_ID=$(aws ec2 run-instances \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --image-id "$DEV_AMI_ID" \
  --instance-type "$DEV_INSTANCE_TYPE" \
  --key-name "$KEYPAIR_NAME" \
  --iam-instance-profile Name="$PROFILE_NAME" \
  --subnet-id "$SUBNET_ID" \
  --security-group-ids "$SG_ID" \
  --no-associate-public-ip-address \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":300,"VolumeType":"gp3"}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${PROJECT}-dev},{Key=Project,Value=${TAG_PROJECT}},{Key=Role,Value=dev}]" \
  --query "Instances[0].InstanceId" --output text)

echo "Dev instance: $DEV_ID"
```

## Acceptance

- Instance is `running`.
- DCV service is active on boot.
- `/shared` mounted automatically.

## Rollback

- Terminate and relaunch with corrected parameters.

