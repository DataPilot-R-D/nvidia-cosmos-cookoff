# T01_preflight_profile_region

Status: TODO  
Depends on: T00_preflight_tooling  
Outputs: Authenticated AWS CLI profile with correct region.

## Purpose

Create a repeatable AWS CLI identity and set the target region (`eu-central-1` by default).

## Steps

1. Configure SSO profile (recommended) or access keys.
2. Verify identity.
3. Set default region for the profile.

## Commands

```bash
# SSO (recommended)
aws configure sso --profile dev-isaac

# Verify identity
aws sts get-caller-identity --profile dev-isaac --region eu-central-1

# Persist defaults for this profile
aws configure set region eu-central-1 --profile dev-isaac
aws configure set output json --profile dev-isaac
```

## Acceptance

- `aws sts get-caller-identity` succeeds and shows the intended account/user.

## Rollback

- Remove the profile from `~/.aws/config` / `~/.aws/credentials` if misconfigured.

