#!/usr/bin/env bash
set -euo pipefail

# AWS configuration
export AWS_PROFILE="${AWS_PROFILE:-default}"
export AWS_REGION="${AWS_REGION:-eu-central-1}"

# Project naming
export PROJECT="${PROJECT:-isaacsim}"
export STACK_NAME="${STACK_NAME:-${PROJECT}-infra}"

# Network CIDRs (edit to match your VPC/VPN plan)
export VPC_CIDR="${VPC_CIDR:-10.50.0.0/16}"
export PUBLIC_SUBNET_CIDR="${PUBLIC_SUBNET_CIDR:-10.50.0.0/24}"
export PRIVATE_SUBNET_1_CIDR="${PRIVATE_SUBNET_1_CIDR:-10.50.1.0/24}"
export PRIVATE_SUBNET_2_CIDR="${PRIVATE_SUBNET_2_CIDR:-10.50.2.0/24}"
export VPN_CIDR="${VPN_CIDR:-10.8.0.0/24}"

# Instance types
export DEV_INSTANCE_TYPE="${DEV_INSTANCE_TYPE:-g6.2xlarge}"
export TRAIN_INSTANCE_TYPES=("${TRAIN_INSTANCE_TYPES[@]:-g6e.2xlarge g6e.4xlarge g5.4xlarge}")

# AMI placeholders (fill after baking or choosing marketplace)
export DEV_AMI_ID="${DEV_AMI_ID:-}"
export TRAIN_AMI_ID="${TRAIN_AMI_ID:-}"

# Key pair
export KEYPAIR_NAME="${KEYPAIR_NAME:-isaacsim-key}"

# Tags
export TAG_PROJECT="${TAG_PROJECT:-isaacsim}"
export TAG_OWNER="${TAG_OWNER:-team}"
