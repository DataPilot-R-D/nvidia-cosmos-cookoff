# T42_ops_final_checklist

Status: TODO  
Depends on: All previous tasks  
Outputs: Signed‑off production readiness.

## Purpose

Formal go/no‑go gate before real workloads.

## Checklist

- [ ] Infra stack deployed and validated.
- [ ] Dev AMI/instance stable; DCV latency acceptable over VPN.
- [ ] Isaac Sim GUI works on Dev.
- [ ] Train AMI stable; Spot fleet launches in <10 min.
- [ ] Headless sample training runs; checkpoints persist on interruption.
- [ ] `/shared` permissions correct for team.
- [ ] S3 artifacts bucket versioned + lifecycle.
- [ ] Budgets/alarms active.
- [ ] Teardown path tested.

## Acceptance

- All boxes checked, owner signs off.

## Rollback

- Reopen failed checklist items and repeat relevant tasks.

