# T40_ops_runbooks

Status: TODO  
Depends on: T26_dev_validate_gui, T37_train_validate  
Outputs: Team‑friendly operational documentation.

## Purpose

Make the environment usable by others without tribal knowledge.

## Runbooks to Write

1. **Access**
   - Connect OpenVPN.
   - DCV thick client connect string: `<dev-private-ip>:8443#console`.
   - System auth credentials and how to add users.
2. **SSM Fallback**
   - `aws ssm start-session --target <instance-id>`.
3. **Dev Lifecycle**
   - Start/stop (if ever needed), updates, cache hygiene.
4. **Training Lifecycle**
   - Launch Fleet with instance-type switching.
   - Terminate Fleet.
   - Where artifacts/checkpoints live.
5. **Teardown**
   - Terminate GPUs, then delete infra stack.

## Acceptance

- A new teammate can follow docs to log in and run a sample job.

## Rollback

None.

