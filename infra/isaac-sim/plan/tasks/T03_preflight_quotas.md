# T03_preflight_quotas

Status: TODO  
Depends on: T01_preflight_profile_region  
Outputs: GPU quotas sufficient for dev + train tiers.

## Purpose

GPU instances often fail to launch due to account quotas. Validate early.

## Steps

1. List EC2 GPU quotas for the region.
2. Confirm On‑Demand and Spot quotas cover your chosen instance types.
3. Request increases if needed.

## Commands

```bash
# List EC2 service quotas (filter for GPU / G-family related)
aws service-quotas list-service-quotas \
  --profile dev-isaac \
  --service-code ec2 \
  --region eu-central-1 \
  --query "Quotas[?contains(QuotaName, 'G') || contains(QuotaName, 'GPU')].[QuotaName,Value]" \
  --output table
```

Notes:
- Quota codes vary; if unsure, use AWS Console → Service Quotas → EC2.
- Common blockers: “Running On-Demand G instances” and “Running Spot G instances”.

## Acceptance

- Quota values are ≥ peak concurrent GPUs you plan to use.

## Rollback

None required.

