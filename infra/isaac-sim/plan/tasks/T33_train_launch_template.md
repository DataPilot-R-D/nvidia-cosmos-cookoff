# T33_train_launch_template

Status: TODO  
Depends on: T32_train_ami_bake  
Outputs: EC2 Launch Template ID/version for training nodes.

## Purpose

Encapsulate training launch configuration so Spot fleets can reuse it.

## Steps

1. Write user‑data script that:
   - mounts EFS `/shared`
   - pulls job JSON from S3
   - starts training
2. Create Launch Template with Train AMI, SG, IAM profile, user‑data.

## Commands

```bash
cat > /tmp/train-userdata.sh <<'EOF'
#!/bin/bash
set -euxo pipefail
apt-get update
apt-get install -y amazon-efs-utils jq
mkdir -p /shared
mount -t efs -o tls,accesspoint=<EFS_ACCESS_POINT_ID> <EFS_FS_ID>:/ /shared

# Pull and run job
JOB_ID=${JOB_ID:-latest}
aws s3 cp s3://<ARTIFACTS_BUCKET>/jobs/$JOB_ID.json /tmp/job.json
# TODO: run job based on /tmp/job.json
EOF

LT_ID=$(aws ec2 create-launch-template \
  --profile "$AWS_PROFILE" --region "$AWS_REGION" \
  --launch-template-name "${PROJECT}-train-lt" \
  --launch-template-data "{
    \"ImageId\":\"$TRAIN_AMI_ID\",
    \"InstanceType\":\"${TRAIN_INSTANCE_TYPES[0]}\",
    \"IamInstanceProfile\":{\"Name\":\"$PROFILE_NAME\"},
    \"SecurityGroupIds\":[\"$SG_ID\"],
    \"SubnetId\":\"$SUBNET_ID\",
    \"UserData\":\"$(base64 < /tmp/train-userdata.sh | tr -d '\n')\",
    \"InstanceMarketOptions\":{\"MarketType\":\"spot\"}
  }" \
  --query "LaunchTemplate.LaunchTemplateId" --output text)
```

## Acceptance

- Launch Template exists and can launch a test Spot instance.

## Rollback

- Delete template: `aws ec2 delete-launch-template --launch-template-id $LT_ID`.

