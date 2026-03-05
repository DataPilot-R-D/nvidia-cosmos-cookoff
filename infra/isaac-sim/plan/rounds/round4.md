# Round 4 Plan (Finalized Task List)

This is the “satisfying” consolidated plan. Tasks are atomic, ordered, and each has a clear output so they can be implemented one‑by‑one with AWS CLI + shell scripts.

## Final Task List

### Phase 0 — Preflight

**T00_preflight_tooling**  
Install/verify local tools: AWS CLI v2, jq, session manager plugin, OpenVPN client.  
Output: `aws --version` OK; `jq --version` OK.

**T01_preflight_profile_region**  
Configure AWS CLI profile and region defaults (`aws configure sso` recommended).  
Output: `aws sts get-caller-identity` succeeds.

**T02_preflight_permissions**  
Validate IAM permissions for VPC/EC2/EFS/S3/IAM/SSM/CloudFormation.  
Output: checklist signed off.

**T03_preflight_quotas**  
Check/raise EC2 GPU quotas in target region (On‑Demand + Spot for G4dn/G5/G6/G6e).  
Output: quotas meet planned instance types.

**T04_preflight_config_file**  
Create a single env/config file (`scripts/00_env.sh`) with CIDRs, VPN CIDR, tags, instance-type lists, AMI IDs placeholders.  
Output: config file committed.

**T05_preflight_vpn_routes**  
Verify VPN routes allow client CIDR → VPC CIDR reachability.  
Output: `ping`/`ssh` to a private instance works once launched.

### Phase 1 — Baseline Infra

**T10_infra_template** (deps: T00–T04)  
Author `cfn/infra.yaml` (VPC, 2 private subnets, 1 public + NAT, SGs, EFS+AP, S3 artifacts bucket, SSM+Logs interface endpoints, S3 gateway endpoint, EC2 role/profile).  
Output: template validates `aws cloudformation validate-template`.

**T11_infra_deploy** (deps: T10)  
Deploy infra stack via `aws cloudformation deploy`.  
Output: stack `CREATE_COMPLETE`.

**T12_infra_validate_outputs** (deps: T11)  
Fetch outputs; write to a generated `scripts/infra_outputs.json` for later scripts.  
Output: JSON contains VPC/Subnet/SG/EFS/AP/Profile/Bucket IDs.

**T13_infra_teardown_script** (deps: T10)  
Write `scripts/99_destroy_infra.sh` for safe cleanup.  
Output: teardown script tested on sandbox stack.

### Phase 2 — Dev Tier (GUI + DCV)

**T20_dev_ami_strategy_decision** (deps: T12)  
Decide Marketplace vs Golden AMI; record in `plan/decisions.md`.  
Output: chosen path + rationale.

**T21_dev_keypair** (deps: T12)  
Create or select EC2 key pair used for builders/dev.  
Output: key pair name stored in config.

**T22_dev_builder_launch** (deps: T12, T21, T20)  
Launch Dev builder instance in private subnet using base Ubuntu or Marketplace AMI.  
Output: builder instance ID + private IP.

**T23_dev_builder_bootstrap** (deps: T22)  
Create/run bootstrap script to install:
- NVIDIA driver pinned to Isaac Sim 5.1 baseline  
- Ubuntu Desktop  
- Amazon DCV server + shared console config (`isaac-devs` group)  
- EFS mount at `/shared` with TLS + Access Point + fstab  
- Isaac Sim + Isaac Lab deps  
Output: builder passes validation (`nvidia-smi`, DCV service running, `/shared` rw).

**T24_dev_ami_bake** (deps: T23)  
Bake Dev Golden AMI (skip if Marketplace path).  
Output: Dev AMI ID in config.

**T25_dev_instance_launch** (deps: T24 or Marketplace AMI)  
Launch always‑on Dev instance from Dev AMI.  
Output: Dev instance ID + private IP.

**T26_dev_validate_gui** (deps: T25, T05)  
Validate DCV over VPN and Isaac Sim GUI sample.  
Output: screenshots/logs; go/no‑go.

### Phase 3 — Train Tier (Spot)

**T30_train_builder_launch** (deps: T12, T21)  
Launch Train builder in private subnet.  
Output: builder ID.

**T31_train_builder_bootstrap** (deps: T30)  
Bootstrap headless toolchain:
- NVIDIA driver baseline  
- headless Isaac Sim/Isaac Lab + training deps  
- EFS mount `/shared`  
- job runner stub pulling job JSON from S3  
Output: builder runs headless sample.

**T32_train_ami_bake** (deps: T31)  
Bake Train AMI.  
Output: Train AMI ID in config.

**T33_train_launch_template** (deps: T32)  
Create EC2 Launch Template with Train AMI, SG, IAM profile, user‑data for EFS mount + job start.  
Output: LT ID/version stored.

**T34_train_spot_fleet_script** (deps: T33)  
Write `scripts/40_launch_train_spot.sh` using `aws ec2 create-fleet` with instance‑type overrides list (capacity‑optimized).  
Output: fleet/instance IDs printed.

**T35_train_interrupt_hook** (deps: T34)  
Add interruption notice handler to checkpoint to EFS/S3.  
Output: interruption script installed and tested.

**T36_train_terminate_script** (deps: T34)  
Write `scripts/50_terminate_train.sh` to delete fleets and terminate instances.  
Output: cleanup works.

**T37_train_validate** (deps: T34–T36)  
Run sample training job; verify artifacts in EFS/S3; simulate termination.  
Output: validated checkpoint persistence.

### Phase 4 — Ops & Cost

**T40_ops_runbooks** (deps: T26, T37)  
Write team runbooks (DCV connect, SSM fallback, start/stop, hardware switch, teardown).  
Output: docs committed.

**T41_ops_cost_guardrails** (deps: T11)  
Create AWS Budgets + alerts; set S3 lifecycle; optional idle auto‑stop for builders.  
Output: budgets active.

**T42_ops_final_checklist** (deps: all)  
Final acceptance checklist for production readiness.  
Output: checklist signed off.

## Atomicity & Execution Rules

- Tasks should be done strictly in order, skipping only where the decision gate makes a path irrelevant.
- Every task produces a concrete artifact or verified state change.
- If a task fails acceptance, rollback before proceeding.

