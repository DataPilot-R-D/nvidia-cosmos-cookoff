# T22_dev_builder_launch

Status: TODO  
Depends on: T20_dev_ami_strategy_decision, T21_dev_keypair  
Outputs: Running Dev builder instance in private subnet.

## Purpose

Create a temporary instance to install drivers/Isaac Sim/DCV and bake a Dev AMI.

## Steps

1. Fetch required IDs from `scripts/infra_outputs.json`.
2. Choose base AMI:
   - Marketplace AMI if using Strategy A.
   - Latest Ubuntu 22.04 AMI via SSM if using Strategy B.
3. Launch builder with Dev SG + instance profile.

## Commands (Strategy B example)

```bash
source scripts/00_env.sh

OUT=$(cat scripts/infra_outputs.json)
get_out() { echo "$OUT" | jq -r ".[] | select(.OutputKey==\"$1\") | .OutputValue"; }

SUBNET_ID=$(get_out PrivateSubnet1Id)
SG_ID=$(get_out DevSecurityGroupId)
PROFILE_NAME=$(get_out InstanceProfileName)

UBUNTU_AMI=$(aws ssm get-parameter \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --name "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp3/ami-id" \
  --query "Parameter.Value" --output text)

BUILDER_ID=$(aws ec2 run-instances \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --image-id "$UBUNTU_AMI" \
  --instance-type "$DEV_INSTANCE_TYPE" \
  --key-name "$KEYPAIR_NAME" \
  --iam-instance-profile Name="$PROFILE_NAME" \
  --subnet-id "$SUBNET_ID" \
  --security-group-ids "$SG_ID" \
  --no-associate-public-ip-address \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${PROJECT}-dev-builder},{Key=Project,Value=${TAG_PROJECT}},{Key=Role,Value=builder}]" \
  --query "Instances[0].InstanceId" --output text)

echo "Dev builder: $BUILDER_ID"
```

## Acceptance

- Instance reaches `running` state.
- You can SSH in over VPN.

## Rollback

- Terminate the builder: `aws ec2 terminate-instances --instance-ids $BUILDER_ID`.

