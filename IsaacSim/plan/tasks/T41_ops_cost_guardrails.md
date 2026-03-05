# T41_ops_cost_guardrails

Status: TODO  
Depends on: T11_infra_deploy  
Outputs: Budget alerts and cleanup policies active.

## Purpose

Prevent unexpected spend, especially on Spot or forgotten builders.

## Steps

1. Create AWS Budget with monthly limit and alerts.
2. Enable cost allocation tags for `Project`, `Role`, `Owner`.
3. Add S3 lifecycle rules for old artifacts.
4. (Optional) Auto‑stop idle builders using cron/SSM Automation.

## Commands (Budget example)

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws budgets create-budget \
  --account-id "$ACCOUNT_ID" \
  --budget '{
    "BudgetName":"isaacsim-monthly",
    "BudgetLimit":{"Amount":"500","Unit":"USD"},
    "TimeUnit":"MONTHLY",
    "BudgetType":"COST"
  }'
```

S3 lifecycle can be set in CloudFormation or via:

```bash
aws s3api put-bucket-lifecycle-configuration \
  --bucket "<ARTIFACTS_BUCKET>" \
  --lifecycle-configuration file://cfn/s3_lifecycle.json
```

## Acceptance

- Budget exists and alerts configured.
- Lifecycle rules visible on the artifacts bucket.

## Rollback

- Delete budget or lifecycle rules if misconfigured.

