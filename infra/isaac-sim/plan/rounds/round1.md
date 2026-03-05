# Round 1 Plan (Initial Draft)

Goal: Set up an AWS-based Isaac Sim 5.1.x environment with an always‑on GUI dev workstation (Amazon DCV) and on‑demand GPU training nodes, provisioned and operated via AWS CLI.

## Assumptions / Inputs Needed

- AWS region: default `eu-central-1` (Frankfurt) unless overridden.
- You have an OpenVPN into AWS or a routed VPN CIDR that can reach private subnets.
- Isaac Sim version target: 5.1.x on Ubuntu 22.04/24.04.
- Two tiers:
  - **Dev**: always-on, smaller RTX GPU + DCV GUI.
  - **Train**: on-demand, larger GPU, Spot preferred, headless.

## Phase 0 — Local Preflight

1. Install/verify AWS CLI v2 and login (SSO or access keys).
2. Choose/create AWS CLI profile and region defaults.
3. Collect config values: VPC CIDR, subnets, VPN CIDR, instance types for dev/train, AMI strategy (Marketplace vs custom golden AMIs).
4. Check EC2 GPU quotas in region; request increases if needed.

## Phase 1 — Baseline Infrastructure (CloudFormation via AWS CLI)

5. Create repo layout `aws-isaacsim/` with:
   - `cfn/infra.yaml` for VPC/private subnets/NAT/SGs/EFS/endpoints/IAM/S3.
   - `scripts/00_env.sh` and `scripts/10_deploy_infra.sh`.
6. Deploy the stack with `aws cloudformation deploy`.
7. Verify outputs: VPC, subnet IDs, SG IDs, EFS FS/AP IDs, instance profile, artifacts bucket.

## Phase 2 — Dev Workstation

8. Decide AMI path:
   - A) NVIDIA Marketplace Isaac Sim Workstation AMI (g6e-only), or
   - B) Custom golden AMI (recommended if you want g4dn/g5/g6 flexibility).
9. Launch a **dev builder** instance (private subnet, Dev SG, instance profile, no public IP).
10. On builder:
    - Install pinned NVIDIA driver baseline for Isaac Sim 5.1.
    - Install desktop environment.
    - Install and configure Amazon DCV for shared console session.
    - Mount EFS at `/shared`.
    - Install Isaac Sim + Isaac Lab dependencies.
11. Bake **Dev Golden AMI** via `aws ec2 create-image`.
12. Launch the always‑on **Dev instance** from Dev AMI; verify DCV connectivity over VPN.

## Phase 3 — Training Environment

13. Launch a **train builder** instance (larger GPU optional).
14. On builder:
    - Install pinned NVIDIA driver baseline.
    - Install headless Isaac Sim/Isaac Lab toolchain, containers if needed.
    - Mount EFS at `/shared`.
15. Bake **Train Golden AMI**.
16. Write AWS CLI scripts:
    - `40_launch_train_spot.sh`: Spot launch from Train AMI, instance-type parameter.
    - `50_terminate_train.sh`: terminate by instance-id.
    - `60_sync_artifacts.sh`: sync checkpoints/logs to S3.
17. Validate Spot training node:
    - EFS mounts, job bootstrap works.
    - Checkpointing to EFS/S3 handles interruption notice.

## Phase 4 — Operations & Validation

18. Add runbooks:
    - Connect via DCV (`PRIVATE_IP:8443#console`).
    - SSM fallback.
    - Start/stop/terminate procedures.
19. Add cost guardrails:
    - AWS Budgets, CloudWatch alarms, Spot max price policy.
20. End-to-end test:
    - GUI Isaac Sim scene on Dev.
    - Headless training run on Spot Train.

Open items for later rounds: refine task granularity, add exact CLI commands per task, decide on Fleet/instance-type list for better Spot capacity, and formalize validation criteria.

