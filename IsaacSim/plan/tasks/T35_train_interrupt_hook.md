# T35_train_interrupt_hook

Status: TODO  
Depends on: T34_train_spot_fleet_script  
Outputs: Safe Spot interruption behavior.

## Purpose

Spot nodes must checkpoint on 2‑minute interruption notices.

## Steps

1. On Train AMI, add a systemd service or cron that watches:
   - `/meta-data/spot/instance-action` (IMDS)
2. When notice appears, trigger checkpoint flush to `/shared` and S3.

## Reference

AWS docs: “Spot Instance interruption notices”.  
Common handler: `spot-instance-interruption-notice-handler`.

## Acceptance

- Simulated termination still leaves checkpoints in EFS/S3.

## Rollback

- Remove the handler if it causes instability, then re‑bake AMI.

