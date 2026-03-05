# T11_infra_deploy

Status: TODO  
Depends on: T10_infra_template  
Outputs: Baseline infra stack deployed.

## Purpose

Deploy baseline infra consistently using AWS CLI.

## Steps

1. Create `scripts/10_deploy_infra.sh` wrapper.
2. Deploy stack.

## Commands

```bash
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_env.sh"

aws cloudformation deploy \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME" \
  --template-file "cfn/infra.yaml" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    ProjectName="$PROJECT" \
    VpcCidr="$VPC_CIDR" \
    PublicSubnetCidr="$PUBLIC_SUBNET_CIDR" \
    PrivateSubnet1Cidr="$PRIVATE_SUBNET_1_CIDR" \
    PrivateSubnet2Cidr="$PRIVATE_SUBNET_2_CIDR" \
    VpnCidr="$VPN_CIDR"
```

Run:

```bash
bash scripts/10_deploy_infra.sh
```

## Acceptance

- `aws cloudformation describe-stacks --stack-name $STACK_NAME` shows `CREATE_COMPLETE`.

## Rollback

- Use T13 teardown script if deployment must be removed.

