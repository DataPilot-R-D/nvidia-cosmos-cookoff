# T10_infra_template

Status: TODO  
Depends on: T00_preflight_tooling, T04_preflight_config_file  
Outputs: Validated CloudFormation template for baseline infra.

## Purpose

Create the shared AWS foundation required by both Dev and Train tiers.

## Scope of Template

In `cfn/infra.yaml` include:

- VPC (`VPC_CIDR`)
- Public subnet (for NAT GW)
- Two private subnets (2 AZs)
- IGW + NAT GW + route tables
- Security groups:
  - Dev SG: SSH 22 + DCV 8443 TCP/UDP from `VPN_CIDR`
  - Train SG: SSH 22 from `VPN_CIDR`
  - EFS SG: NFS 2049 from Dev/Train SGs
  - Endpoint SG: 443 from Dev/Train SGs
- VPC endpoints (private access):
  - Interface: `ssm`, `ssmmessages`, `ec2messages`, `logs`
  - Gateway: `s3`
- EFS filesystem + mount targets + Access Point (`/shared`)
- S3 artifacts bucket (versioned, encrypted)
- EC2 role + instance profile:
  - `AmazonSSMManagedInstanceCore`
  - S3 RW to artifacts bucket

Use the reference in `guideline.md` as baseline.

## Steps

1. Create `cfn/infra.yaml`.
2. Validate with AWS CLI.

## Commands

```bash
source scripts/00_env.sh

aws cloudformation validate-template \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --template-body file://cfn/infra.yaml
```

## Acceptance

- Template validates successfully.

## Rollback

- Delete the file or revert edits.

