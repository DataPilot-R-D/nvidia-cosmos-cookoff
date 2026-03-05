# T20_dev_ami_strategy_decision

Status: TODO  
Depends on: T12_infra_validate_outputs  
Outputs: Recorded choice of AMI strategy for Dev tier.

## Purpose

Your AMI strategy determines instance flexibility and later scripts.

## Options

### A) NVIDIA Marketplace Isaac Sim Workstation AMI

- Fastest path.
- Hardware‑locked to **g6e** family.
- Minimal bootstrap required beyond EFS mount + DCV tweaks.

### B) Golden AMI (recommended)

- Works on g4dn/g5/g6/g6e.
- Requires one‑time builder + bake.

## Decision Criteria

- Need cheaper/older GPUs for dev? → Golden AMI.
- OK with g6e costs and want speed? → Marketplace.

## Steps

1. Decide A or B.
2. Record in `plan/decisions.md` including: chosen AMI IDs, supported instance types, driver version pin.

## Acceptance

- `plan/decisions.md` exists and is explicit enough for the team to follow.

## Rollback

- You can switch later, but redo tasks T22–T25 accordingly.

