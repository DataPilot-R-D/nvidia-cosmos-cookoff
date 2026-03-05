# Round 3 Plan (Hardening + Automation)

Round 3 adds operational hardening, clearer dependencies, and optional automation for scale/cost. It also introduces acceptance criteria per task and explicit rollback.

## Additional Gaps Addressed

- Need consistent tagging to enable cost allocation and scripted lookups.
- Need explicit rollback/teardown steps to avoid orphaned costs.
- DCV requires S3 reachability for license checks → ensure either NAT or S3 endpoint is present and validated.
- Training tier should include interruption hooks and a job‑pull convention to make Spot safe.

## Refined Task Graph (with deps)

### Phase 0 — Preflight

**T00** Local tooling install.  
**T01** AWS profile + region set.  
**T02** IAM permission check.  
**T03** GPU quotas checked/raised.  
**T04** Tagging standard defined (`Project=isaacsim`, `Role=dev|train|builder`, `Owner=<team>`, `Env=prod|dev`).  
**T05** VPN routing verified.

Rollback: none.

### Phase 1 — Infra (depends on T00–T05)

**T10** Author CloudFormation infra template.  
**T11** Deploy stack.  
**T12** Validate infra outputs + endpoint reachability:
  - `aws ssm describe-instance-information` works once an instance joins.
  - `curl https://s3.<region>.amazonaws.com` from private subnet works (via NAT or endpoint).
**T13** Teardown script `99_destroy_infra.sh` (`aws cloudformation delete-stack` + wait).  

Acceptance: stack stable; EFS mount targets `available`; S3 bucket exists; endpoints `available`.

### Phase 2 — Dev AMI + Instance (depends on Phase 1)

**T20 (Gate)** AMI strategy decision recorded.  
**T21** Key pair created/verified.  
**T22** Dev builder launched from base Ubuntu or Marketplace AMI.  
**T23** Dev builder bootstrap script created (idempotent):
  - NVIDIA driver install pinned to Isaac Sim tested version
  - Desktop + X11/Wayland config
  - DCV server install + shared console config + QUIC toggle
  - EFS mount with TLS + Access Point, persistent via `/etc/fstab`
  - Isaac Sim install (launcher or container) + Isaac Lab deps
  - Local cache dirs on EBS (`/var/cache/omniverse`, `/var/lib/docker`, pip cache)
**T24** Bake Dev AMI; snapshot IDs recorded.  
**T25** Launch always‑on Dev instance from Dev AMI, with:
  - bigger root EBS (`gp3`, e.g. 200–500 GB)
  - optional data volume for caches
  - instance recovery enabled
**T26** Validate Dev:
  - DCV thick client login
  - Isaac Sim GUI sample scene
  - write/read to `/shared`

Rollback: terminate builder; deregister AMI if invalid.

### Phase 3 — Train AMI + Spot Launch (depends on Phase 1)

**T30** Train builder launched.  
**T31** Train bootstrap script:
  - driver baseline
  - headless Isaac Sim/Isaac Lab
  - EFS mount `/shared`
  - job runner stub that pulls job JSON from S3 and runs
  - optional CloudWatch agent for logs
**T32** Bake Train AMI.  
**T33** Create training Launch Template (LT) from Train AMI + user‑data.  
**T34** Spot Fleet script (preferred):
  - `aws ec2 create-fleet` with instance‑type overrides list (e.g., `g6e.2xlarge`, `g6e.4xlarge`, `g5.4xlarge`)
  - capacity‑optimized allocation
  - max price cap optional
  - tags propagate to instances/volumes
**T35** Interruption handling:
  - enable `spot-instance-interruption-notice-handler` or systemd hook
  - checkpoint to EFS/S3 on notice
**T36** Terminate/cleanup script for Spot instances and fleets.
**T37** Validate Train:
  - headless sample run
  - interruption simulation (terminate) preserves checkpoints

Rollback: delete fleet, terminate instances, deregister AMI.

### Phase 4 — Ops & Cost (depends on Phase 2–3)

**T40** Runbooks for team.  
**T41** Cost guardrails:
  - Budgets + email/Slack
  - optional `ec2:StopInstances` cron for idle builders
  - S3 lifecycle for old artifacts
**T42** Final “ready for production” checklist.  

## Next Round Focus

- Produce final, numbered task list that becomes the per‑task markdown files.
- Ensure tasks are minimal, atomic, and executable in order.

