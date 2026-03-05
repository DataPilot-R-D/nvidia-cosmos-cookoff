# Environment and Secrets Policy

PAIC2 does not store secrets in git.

## Required policy

- Secret values must come from AWS SSM Parameter Store or AWS Secrets Manager.
- Repositories may only store templates (`*.example`) and key names.
- Runtime systems must resolve secret values during deployment/startup.

## Rotation policy

- Rotate API keys and credentials in AWS secret stores.
- Track rotation date in ops runbooks.
- Never embed rotated secrets in commit history.

## Baseline variables

See `ops/env/sras-platform.env.example` for expected key names.
