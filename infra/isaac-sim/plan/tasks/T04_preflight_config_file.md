# T04_preflight_config_file

Status: TODO  
Depends on: T01_preflight_profile_region  
Outputs: Single source of truth for scripts.

## Purpose

Centralize configuration so all scripts and CloudFormation deployments are consistent.

## Steps

1. Create `scripts/00_env.sh` with all editable variables.
2. Commit to repo (no secrets).

## Template

```bash
#!/usr/bin/env bash
set -euo pipefail

export AWS_PROFILE="dev-isaac"
export AWS_REGION="eu-central-1"

export PROJECT="isaacsim"
export STACK_NAME="${PROJECT}-infra"

# CIDRs (edit to your network plan)
export VPC_CIDR="10.50.0.0/16"
export PUBLIC_SUBNET_CIDR="10.50.0.0/24"
export PRIVATE_SUBNET_1_CIDR="10.50.1.0/24"
export PRIVATE_SUBNET_2_CIDR="10.50.2.0/24"

# OpenVPN client CIDR(s) allowed to reach Dev/Train
export VPN_CIDR="10.8.0.0/24"

# Instance types
export DEV_INSTANCE_TYPE="g6.2xlarge"
export TRAIN_INSTANCE_TYPES=("g6e.2xlarge" "g6e.4xlarge" "g5.4xlarge")

# AMI IDs (filled after baking or choosing marketplace)
export DEV_AMI_ID=""
export TRAIN_AMI_ID=""

# Key pair
export KEYPAIR_NAME="isaacsim-key"

# Tags
export TAG_PROJECT="isaacsim"
export TAG_OWNER="team"
```

## Acceptance

- `source scripts/00_env.sh` works without errors.

## Rollback

Delete or revert the config file.

