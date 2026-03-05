# T30_train_builder_launch

Status: TODO  
Depends on: T12_infra_validate_outputs, T21_dev_keypair  
Outputs: Running Train builder instance.

## Purpose

Create a temporary builder to prepare the headless training AMI.

## Steps

1. Choose base Ubuntu AMI (22.04).
2. Launch builder in private subnet with Train SG + instance profile.
3. SSH in over VPN.

## Commands

```bash
source scripts/00_env.sh
OUT=$(cat scripts/infra_outputs.json)
get_out() { echo "$OUT" | jq -r ".[] | select(.OutputKey==\"$1\") | .OutputValue"; }

SUBNET_ID=$(get_out PrivateSubnet2Id)
SG_ID=$(get_out TrainSecurityGroupId)
PROFILE_NAME=$(get_out InstanceProfileName)

UBUNTU_AMI=$(aws ssm get-parameter \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --name "/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp3/ami-id" \
  --query "Parameter.Value" --output text)

TRAIN_BUILDER_ID=$(aws ec2 run-instances \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --image-id "$UBUNTU_AMI" \
  --instance-type "${TRAIN_INSTANCE_TYPES[0]}" \
  --key-name "$KEYPAIR_NAME" \
  --iam-instance-profile Name="$PROFILE_NAME" \
  --subnet-id "$SUBNET_ID" \
  --security-group-ids "$SG_ID" \
  --no-associate-public-ip-address \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${PROJECT}-train-builder},{Key=Project,Value=${TAG_PROJECT}},{Key=Role,Value=builder}]" \
  --query "Instances[0].InstanceId" --output text)

echo "Train builder: $TRAIN_BUILDER_ID"
```

## Acceptance

- Builder instance is `running` and reachable by SSH over VPN.

## Rollback

- Terminate builder if wrong type/AMI.

