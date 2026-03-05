# Round 2 Plan (Review + Added Detail)

This round refines Round 1 by (a) adding missing AWS prerequisites, (b) splitting coarse steps into atomic tasks, and (c) attaching concrete AWS‑CLI actions and acceptance criteria.

## Key Review Findings

- Need explicit tasks for: key pair creation, IAM permissions check, VPN route verification, GPU quota validation.
- Dev vs Train AMI strategy should be an early decision gate, because it affects later scripts.
- Training launch benefits from a Launch Template or Fleet if you want multi‑type Spot capacity.
- Must standardize EFS mount helper (`amazon-efs-utils`) with TLS and Access Point usage.

## Updated Task Breakdown

### Phase 0 — Account & Local Preflight

**T00** Install/verify AWS CLI v2, jq, session tooling.  
**T01** Configure AWS profile (SSO recommended) and default region.  
**T02** Validate IAM permissions (CloudFormation, EC2, EFS, S3, IAM, SSM, VPC).  
**T03** Check EC2 service quotas: G‑family On‑Demand and Spot.  
**T04** Define config values in one env file (`AWS_REGION`, CIDRs, VPN CIDR, instance-type lists, tags).  
**T05** Verify OpenVPN routing to target VPC CIDR (outside AWS, but required before DCV works).

### Phase 1 — Baseline Infra (CloudFormation)

**T10** Create `cfn/infra.yaml` (VPC, 2 private subnets, 1 public subnet + NAT, SGs, EFS + Access Point, S3 artifacts bucket, SSM + S3 endpoints, EC2 role/profile).  
**T11** `scripts/10_deploy_infra.sh` → deploy stack.  
**T12** `scripts/11_validate_infra.sh` → fetch and print outputs; fail fast if any missing.  
Acceptance: stack is `CREATE_COMPLETE`; outputs usable by later scripts.

### Phase 2 — Dev Tier

**T20 (Gate)** Choose AMI strategy:
- **A Marketplace** (fast, g6e‑only)  
- **B Golden AMI** (flexible, recommended)  
Decision recorded in `plan/decisions.md`.

**T21** Create/verify EC2 key pair (store private key locally, no public IP access without VPN).  
**T22** Launch dev builder instance via CLI (private subnet, Dev SG, instance profile).  
**T23** Bootstrap builder:
- install pinned NVIDIA driver baseline
- install desktop (GNOME/Ubuntu Desktop)
- install DCV server + web viewer
- configure shared `console` session + permissions group
- mount EFS `/shared` using Access Point + TLS
- install Isaac Sim + Isaac Lab deps
**T24** Bake Dev AMI (`aws ec2 create-image`), tag `Role=dev-ami`.  
**T25** Launch always‑on Dev instance from Dev AMI.  
Acceptance: DCV login works over VPN; `nvidia-smi` OK; Isaac Sim GUI runs.

### Phase 3 — Train Tier

**T30** Launch train builder (can reuse Dev builder if identical deps).  
**T31** Bootstrap train builder:
- driver baseline
- headless Isaac Sim/Isaac Lab toolchain
- EFS mount `/shared`
- optional container runtime (docker) and pre‑pull images
**T32** Bake Train AMI (`Role=train-ami`).  
**T33** Create Launch Template for training (AMI, SG, IAM profile, user‑data for EFS mount + job start).  
**T34** Spot launcher script:
- simple `run-instances` for single type, **or**
- EC2 Fleet with instance‑type list for capacity‑optimized Spot.
**T35** Terminate script + S3 sync script.  
Acceptance: Spot node mounts EFS, runs a sample headless job, checkpoints survive termination.

### Phase 4 — Ops & Cost

**T40** Document runbooks (DCV connect, SSM fallback, start/stop flows, teardown).  
**T41** Add cost guardrails (Budgets + alarms, optional instance scheduler).  
**T42** End‑to‑end validation checklist.  

## Next Round Focus

- Flesh out each task file with exact commands.
- Add rollback / cleanup steps per phase.
- Decide whether to default to Fleet or simple Spot launch.

