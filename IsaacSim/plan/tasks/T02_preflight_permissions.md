# T02_preflight_permissions

Status: TODO  
Depends on: T01_preflight_profile_region  
Outputs: Confirmed IAM ability to execute plan.

## Purpose

Avoid mid‑setup failures by confirming your AWS identity can create the required resources.

## Required Permissions

At minimum, your identity must be able to:

- CloudFormation: deploy, update, delete stacks.
- EC2/VPC: create VPC, subnets, route tables, IGW, NAT GW, security groups, endpoints, launch/terminate instances, create AMIs, launch templates, fleets.
- EFS: create file systems, mount targets, access points.
- S3: create bucket, put/get/list/delete objects.
- IAM: create role + instance profile, attach managed policies.
- SSM/Logs: create VPC interface endpoints, allow instances to register.
- Service Quotas: read quotas (requesting increases may require admin).

## Validation Options

**Option A (fast manual checklist):**
1. Ensure you are in an IAM group/role with `PowerUserAccess` or equivalent plus IAM create‑role rights.

**Option B (simulate critical actions):**

```bash
aws iam simulate-principal-policy \
  --profile dev-isaac \
  --policy-source-arn <YOUR_ROLE_ARN> \
  --action-names cloudformation:CreateStack ec2:RunInstances efs:CreateFileSystem s3:CreateBucket iam:CreateRole
```

## Acceptance

- You can deploy a small test CloudFormation stack (or simulation shows `allowed`).

## Rollback

None required.

