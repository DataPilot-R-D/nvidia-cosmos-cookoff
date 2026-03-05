# T13_infra_teardown_script

Status: TODO  
Depends on: T10_infra_template  
Outputs: Safe infra cleanup path.

## Purpose

Avoid orphaned infra costs by providing a scripted teardown.

## Steps

1. Create `scripts/99_destroy_infra.sh`.
2. Test on a sandbox stack or after full teardown.

## Script Template

```bash
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/00_env.sh"

aws cloudformation delete-stack \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME"

aws cloudformation wait stack-delete-complete \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --stack-name "$STACK_NAME"
```

## Acceptance

- Running the script deletes the stack cleanly (when resources are no longer in use).

## Rollback

- If deletion fails due to dependencies (e.g., mounted EFS), detach/terminate instances then retry.

