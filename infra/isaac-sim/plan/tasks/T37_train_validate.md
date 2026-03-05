# T37_train_validate

Status: TODO  
Depends on: T34_train_spot_fleet_script, T35_train_interrupt_hook  
Outputs: Verified training tier usable for real jobs.

## Purpose

Confirm headless training works and shared storage/artifacts behave correctly.

## Steps

1. Launch a Spot training node via Fleet script.
2. Run a small Isaac Lab headless training job.
3. Confirm artifacts/checkpoints land in:
   - `/shared/checkpoints/...`
   - `s3://<artifacts-bucket>/checkpoints/...`
4. Simulate interruption (terminate instance) and verify checkpoints persist.

## Acceptance

- Job completes or reaches stable checkpoint.
- Artifacts exist in EFS and S3.
- No data loss on termination.

## Rollback

- Fix Train AMI/bootstrap or user‑data and re‑bake.

