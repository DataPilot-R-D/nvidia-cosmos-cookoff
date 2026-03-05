# T45_ami_lifecycle

Status: TODO
Depends on: T24_dev_ami_bake, T32_train_ami_bake
Outputs: AMI naming convention, versioning scripts, update/deprecation procedures.

## Purpose

Establish consistent AMI naming, versioning, and lifecycle management for maintainability.

## AMI Naming Convention

**Format:** `{project}-{tier}-v{major}.{minor}.{patch}-{YYYYMMDD}`

**Examples:**
- `isaacsim-dev-v1.0.0-20250115`
- `isaacsim-train-v1.0.0-20250115`
- `isaacsim-dev-v1.1.0-20250201` (after Isaac Sim update)
- `isaacsim-train-v1.0.1-20250120` (after driver patch)

**Version Semantics:**
- **Major**: Breaking changes (new Isaac Sim major version, Ubuntu upgrade)
- **Minor**: Feature additions (new dependencies, configuration changes)
- **Patch**: Bug fixes (driver patches, security updates)

## Add to `scripts/00_env.sh`

```bash
# AMI Versioning
export AMI_VERSION="1.0.0"
export AMI_DATE=$(date +%Y%m%d)
export DEV_AMI_NAME="${PROJECT}-dev-v${AMI_VERSION}-${AMI_DATE}"
export TRAIN_AMI_NAME="${PROJECT}-train-v${AMI_VERSION}-${AMI_DATE}"

# AMI Deprecation settings
export AMI_DEPRECATION_DAYS=30
```

## Update T24 and T32 (AMI Bake Tasks)

When baking AMIs, use the naming convention:

```bash
# In T24_dev_ami_bake
aws ec2 create-image \
  --instance-id "$BUILDER_INSTANCE_ID" \
  --name "$DEV_AMI_NAME" \
  --description "Isaac Sim Dev workstation - v${AMI_VERSION}" \
  --tag-specifications "ResourceType=image,Tags=[
    {Key=Name,Value=${DEV_AMI_NAME}},
    {Key=Project,Value=${PROJECT}},
    {Key=Tier,Value=dev},
    {Key=Version,Value=${AMI_VERSION}},
    {Key=IsaacSimVersion,Value=5.1.0},
    {Key=DriverVersion,Value=535.129.03}
  ]"
```

## AMI Update Procedure

### When to Update

| Trigger | Version Bump | Example |
|---------|--------------|---------|
| Isaac Sim major release | Major | 5.1 → 6.0 = v2.0.0 |
| New dependencies added | Minor | Add monitoring agent = v1.1.0 |
| Driver security patch | Patch | Driver update = v1.0.1 |
| Configuration fix | Patch | DCV config fix = v1.0.2 |

### Update Workflow

```bash
#!/usr/bin/env bash
# scripts/ami_update.sh - AMI update workflow

set -euo pipefail
source "$(dirname "$0")/00_env.sh"

TIER="${1:?Usage: $0 <dev|train> <new-version>}"
NEW_VERSION="${2:?Usage: $0 <dev|train> <new-version>}"

# Get current AMI
CURRENT_AMI=$(aws ec2 describe-images \
  --owners self \
  --filters "Name=tag:Project,Values=${PROJECT}" "Name=tag:Tier,Values=${TIER}" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text)

echo "Current AMI: $CURRENT_AMI"

# Launch builder from current AMI
BUILDER_ID=$(aws ec2 run-instances \
  --image-id "$CURRENT_AMI" \
  --instance-type "${TIER}_INSTANCE_TYPE" \
  --subnet-id "$SUBNET_ID" \
  --security-group-ids "$SG_ID" \
  --iam-instance-profile Name="$PROFILE_NAME" \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=${PROJECT}-${TIER}-builder}]" \
  --query 'Instances[0].InstanceId' --output text)

echo "Builder launched: $BUILDER_ID"
echo "SSH in and apply updates, then run:"
echo "  AMI_VERSION=$NEW_VERSION ./scripts/ami_bake.sh $TIER $BUILDER_ID"
```

## AMI Deprecation Script

```bash
#!/usr/bin/env bash
# scripts/ami_deprecate.sh - Deprecate old AMIs

set -euo pipefail
source "$(dirname "$0")/00_env.sh"

DEPRECATION_DAYS="${AMI_DEPRECATION_DAYS:-30}"
CUTOFF_DATE=$(date -d "${DEPRECATION_DAYS} days ago" +%Y-%m-%dT00:00:00Z 2>/dev/null || \
              date -v-${DEPRECATION_DAYS}d +%Y-%m-%dT00:00:00Z)

echo "Finding AMIs older than $CUTOFF_DATE..."

# Find old AMIs
OLD_AMIS=$(aws ec2 describe-images \
  --owners self \
  --filters "Name=tag:Project,Values=${PROJECT}" \
  --query "Images[?CreationDate<\`${CUTOFF_DATE}\`].{ImageId:ImageId,Name:Name,Created:CreationDate}" \
  --output json)

echo "$OLD_AMIS" | jq -r '.[] | "\(.ImageId)\t\(.Name)\t\(.Created)"'

# Prompt before deprecation
read -p "Deprecate these AMIs? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Deprecate each AMI
echo "$OLD_AMIS" | jq -r '.[].ImageId' | while read -r ami_id; do
  echo "Deprecating $ami_id..."

  # Enable deprecation (makes AMI unavailable for new launches after date)
  aws ec2 enable-image-deprecation \
    --image-id "$ami_id" \
    --deprecate-at "$(date -d '+7 days' --iso-8601=seconds 2>/dev/null || date -v+7d +%Y-%m-%dT%H:%M:%SZ)"

  # Tag as deprecated
  aws ec2 create-tags \
    --resources "$ami_id" \
    --tags Key=Deprecated,Value=true Key=DeprecatedDate,Value="$(date -Iseconds)"
done

echo "Done. AMIs will become unavailable for new launches in 7 days."
echo "To fully delete, use: aws ec2 deregister-image --image-id <ami-id>"
```

## AMI Inventory Script

```bash
#!/usr/bin/env bash
# scripts/ami_inventory.sh - List all project AMIs

set -euo pipefail
source "$(dirname "$0")/00_env.sh"

echo "=== Isaac Sim AMI Inventory ==="
echo ""

aws ec2 describe-images \
  --owners self \
  --filters "Name=tag:Project,Values=${PROJECT}" \
  --query 'Images | sort_by(@, &CreationDate) | reverse(@)' \
  --output table \
  --query 'Images[*].{
    Name:Name,
    ImageId:ImageId,
    Created:CreationDate,
    Tier:Tags[?Key==`Tier`].Value|[0],
    Version:Tags[?Key==`Version`].Value|[0],
    Deprecated:Tags[?Key==`Deprecated`].Value|[0]
  }'
```

## Update Launch Template After AMI Update

After creating a new AMI, update the Launch Template:

```bash
# Get new AMI ID
NEW_AMI_ID=$(aws ec2 describe-images \
  --owners self \
  --filters "Name=name,Values=${TRAIN_AMI_NAME}" \
  --query 'Images[0].ImageId' --output text)

# Create new Launch Template version
aws ec2 create-launch-template-version \
  --launch-template-id "$TRAIN_LAUNCH_TEMPLATE_ID" \
  --source-version '$Latest' \
  --launch-template-data "{\"ImageId\": \"${NEW_AMI_ID}\"}"

# Set as default version
NEW_VERSION=$(aws ec2 describe-launch-template-versions \
  --launch-template-id "$TRAIN_LAUNCH_TEMPLATE_ID" \
  --query 'LaunchTemplateVersions | sort_by(@, &VersionNumber) | [-1].VersionNumber' \
  --output text)

aws ec2 modify-launch-template \
  --launch-template-id "$TRAIN_LAUNCH_TEMPLATE_ID" \
  --default-version "$NEW_VERSION"
```

## Acceptance

- [ ] AMI naming convention documented in `scripts/00_env.sh`.
- [ ] Bake scripts (T24, T32) use naming convention.
- [ ] `scripts/ami_update.sh` created and tested.
- [ ] `scripts/ami_deprecate.sh` created and tested.
- [ ] `scripts/ami_inventory.sh` created and tested.
- [ ] Launch Template update procedure documented.
- [ ] Team trained on update workflow.

## Files to Create

| File | Description |
|------|-------------|
| `scripts/ami_update.sh` | Launch builder from existing AMI |
| `scripts/ami_bake.sh` | Bake new AMI with naming convention |
| `scripts/ami_deprecate.sh` | Deprecate old AMIs |
| `scripts/ami_inventory.sh` | List all project AMIs |

## Rollback

- If new AMI is problematic, update Launch Template to use previous AMI version.
- Re-enable deprecated AMIs if needed: `aws ec2 disable-image-deprecation --image-id <ami-id>`
