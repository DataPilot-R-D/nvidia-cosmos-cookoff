# T31_train_builder_bootstrap

Status: TODO
Depends on: T30_train_builder_launch
Outputs: Train builder ready to bake.

## Purpose

Install a headless training toolchain that is Spot-friendly, shares `/shared`, and runs the job runner.

## Steps (on builder)

1. Update system packages.
2. Install NVIDIA driver `535.129.03` (or `560.35.03+` for kernel 6.8+).
3. Install EFS mount helper and mount `/shared` with TLS + Access Point + fstab.
4. Install Isaac Sim headless dependencies.
5. Install the job runner service.
6. Install Spot interruption handler.
7. (Optional) Install Docker and pre-pull training images.
8. Validate and prepare for AMI bake.

## Reference Commands

### Step 2: NVIDIA Driver Installation (Headless)

```bash
# Add NVIDIA repository
sudo add-apt-repository -y ppa:graphics-drivers/ppa
sudo apt-get update

# Install driver (headless server variant)
sudo apt-get install -y nvidia-headless-535 nvidia-utils-535

# OR for newer kernels (6.8+)
# sudo apt-get install -y nvidia-headless-560 nvidia-utils-560

# Verify after reboot
nvidia-smi
```

### Step 3: EFS Mount with fstab Persistence

```bash
# Install EFS mount helper
sudo apt-get install -y amazon-efs-utils nfs-common jq ca-certificates curl unzip

# Get EFS ID and Access Point ID from infra outputs
EFS_FS_ID="<from-infra-outputs>"
EFS_AP_ID="<from-infra-outputs>"

# Create mount point
sudo mkdir -p /shared

# Mount with TLS and IAM
sudo mount -t efs -o tls,accesspoint=${EFS_AP_ID},iam ${EFS_FS_ID}:/ /shared

# Add to fstab for persistence across reboots
echo "${EFS_FS_ID}:/ /shared efs _netdev,tls,accesspoint=${EFS_AP_ID},iam 0 0" | sudo tee -a /etc/fstab

# Create standard directories
sudo mkdir -p /shared/workspace
sudo mkdir -p /shared/checkpoints
sudo mkdir -p /shared/results
```

### Step 4: Isaac Sim Headless Dependencies

```bash
# Install miniforge for conda management
cd /tmp
wget https://github.com/conda-forge/miniforge/releases/latest/download/Miniforge3-Linux-x86_64.sh
bash Miniforge3-Linux-x86_64.sh -b -p /opt/miniforge3

# Add to system profile
echo 'export PATH="/opt/miniforge3/bin:$PATH"' | sudo tee /etc/profile.d/conda.sh
source /etc/profile.d/conda.sh

# Create Isaac Lab environment
conda create -y -n isaaclab python=3.10
conda activate isaaclab

# Install Isaac Sim via pip (headless)
pip install isaacsim==5.1.0 --extra-index-url https://pypi.nvidia.com

# Clone Isaac Lab to shared workspace
cd /shared
git clone https://github.com/isaac-sim/IsaacLab.git || true
cd IsaacLab
pip install -e .
```

### Step 5: Job Runner Installation

```bash
# Create job runner script
sudo mkdir -p /opt/isaacsim
sudo tee /opt/isaacsim/job-runner.sh > /dev/null << 'JOBRUNNER'
#!/bin/bash
set -euo pipefail

# Configuration (override via environment or instance tags)
ARTIFACTS_BUCKET="${ARTIFACTS_BUCKET:-isaacsim-artifacts}"
JOBS_PREFIX="jobs"
RESULTS_PREFIX="results"
CHECKPOINT_INTERVAL="${CHECKPOINT_INTERVAL:-300}"  # 5 minutes

# Get job ID from instance tag, user-data, or environment
get_job_id() {
    # Try instance tag first
    local tag_job_id
    tag_job_id=$(curl -sf http://169.254.169.254/latest/meta-data/tags/instance/JobId 2>/dev/null || echo "")
    if [[ -n "$tag_job_id" ]]; then
        echo "$tag_job_id"
        return
    fi

    # Fall back to environment variable
    echo "${JOB_ID:-default}"
}

JOB_ID=$(get_job_id)
echo "Starting job: $JOB_ID"

# Download job definition
if ! aws s3 cp "s3://${ARTIFACTS_BUCKET}/${JOBS_PREFIX}/${JOB_ID}.json" /tmp/job.json; then
    echo "ERROR: Failed to download job definition for $JOB_ID"
    exit 1
fi

# Parse job JSON
SCRIPT=$(jq -r '.script' /tmp/job.json)
ARGS=$(jq -r '.args // ""' /tmp/job.json)
TIMEOUT=$(jq -r '.timeout // 3600' /tmp/job.json)
WORKDIR=$(jq -r '.workdir // "/shared/workspace"' /tmp/job.json)

# Export any environment variables from job definition
eval "$(jq -r '.env // {} | to_entries | .[] | "export \(.key)=\"\(.value)\""' /tmp/job.json)"

# Set up checkpoint function
checkpoint() {
    echo "[$(date -Iseconds)] Checkpointing to S3..."
    aws s3 sync /shared/checkpoints/ "s3://${ARTIFACTS_BUCKET}/${RESULTS_PREFIX}/${JOB_ID}/checkpoints/" --quiet || true
}

# Trap signals for graceful shutdown
cleanup() {
    echo "[$(date -Iseconds)] Received shutdown signal, final checkpoint..."
    checkpoint
    echo "{\"status\": \"interrupted\", \"timestamp\": \"$(date -Iseconds)\"}" | \
        aws s3 cp - "s3://${ARTIFACTS_BUCKET}/${RESULTS_PREFIX}/${JOB_ID}/status.json"
}
trap cleanup EXIT SIGTERM SIGINT

# Mark job as running
echo "{\"status\": \"running\", \"started\": \"$(date -Iseconds)\", \"instance\": \"$(curl -sf http://169.254.169.254/latest/meta-data/instance-id)\"}" | \
    aws s3 cp - "s3://${ARTIFACTS_BUCKET}/${RESULTS_PREFIX}/${JOB_ID}/status.json"

# Periodic checkpoint in background
(while true; do sleep $CHECKPOINT_INTERVAL; checkpoint; done) &
CHECKPOINT_PID=$!

# Activate conda environment
source /opt/miniforge3/bin/activate isaaclab

# Execute training
cd "$WORKDIR"
echo "[$(date -Iseconds)] Executing: $SCRIPT $ARGS"
echo "[$(date -Iseconds)] Timeout: ${TIMEOUT}s"

set +e
timeout "$TIMEOUT" $SCRIPT $ARGS
EXIT_CODE=$?
set -e

# Clean up checkpoint process
kill $CHECKPOINT_PID 2>/dev/null || true

# Final sync of results
echo "[$(date -Iseconds)] Syncing results to S3..."
aws s3 sync /shared/results/ "s3://${ARTIFACTS_BUCKET}/${RESULTS_PREFIX}/${JOB_ID}/" --quiet
checkpoint

# Mark job complete
STATUS="completed"
if [[ $EXIT_CODE -eq 124 ]]; then
    STATUS="timeout"
elif [[ $EXIT_CODE -ne 0 ]]; then
    STATUS="failed"
fi

echo "{\"status\": \"$STATUS\", \"exit_code\": $EXIT_CODE, \"finished\": \"$(date -Iseconds)\"}" | \
    aws s3 cp - "s3://${ARTIFACTS_BUCKET}/${RESULTS_PREFIX}/${JOB_ID}/status.json"

echo "[$(date -Iseconds)] Job $JOB_ID finished with status: $STATUS (exit code: $EXIT_CODE)"
exit $EXIT_CODE
JOBRUNNER

sudo chmod +x /opt/isaacsim/job-runner.sh

# Create systemd service for job runner
sudo tee /etc/systemd/system/isaacsim-job.service > /dev/null << 'SERVICE'
[Unit]
Description=Isaac Sim Training Job Runner
After=network-online.target efs.mount
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
Environment="PATH=/opt/miniforge3/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
ExecStart=/opt/isaacsim/job-runner.sh
Restart=no
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE

# Enable service (will start on boot if JOB_ID is set)
sudo systemctl daemon-reload
sudo systemctl enable isaacsim-job.service
```

### Step 6: Spot Interruption Handler

```bash
# Create Spot interruption handler
sudo tee /opt/isaacsim/spot-handler.sh > /dev/null << 'SPOTHANDLER'
#!/bin/bash
# Spot instance interruption handler
# Polls IMDS for interruption notice and triggers checkpoint

POLL_INTERVAL=5

while true; do
    # Check for Spot interruption notice
    RESPONSE=$(curl -sf http://169.254.169.254/latest/meta-data/spot/instance-action 2>/dev/null || echo "")

    if [[ -n "$RESPONSE" ]]; then
        echo "[$(date -Iseconds)] SPOT INTERRUPTION NOTICE RECEIVED"
        echo "$RESPONSE"

        # Send SIGTERM to job runner to trigger checkpoint
        pkill -TERM -f "job-runner.sh" || true

        # Wait for job runner to finish cleanup
        sleep 30

        # Additional S3 sync if job runner didn't handle it
        aws s3 sync /shared/checkpoints/ "s3://${ARTIFACTS_BUCKET}/emergency-checkpoints/$(hostname)/" --quiet || true

        exit 0
    fi

    sleep $POLL_INTERVAL
done
SPOTHANDLER

sudo chmod +x /opt/isaacsim/spot-handler.sh

# Create systemd service for Spot handler
sudo tee /etc/systemd/system/spot-handler.service > /dev/null << 'SERVICE'
[Unit]
Description=Spot Instance Interruption Handler
After=network-online.target

[Service]
Type=simple
ExecStart=/opt/isaacsim/spot-handler.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable spot-handler.service
```

### Step 7 (Optional): Docker Installation

```bash
# Install Docker for container-based training
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu

# Configure NVIDIA container toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
    sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker

# Pre-pull Isaac Sim container (optional)
# docker pull nvcr.io/nvidia/isaac-sim:5.1.0
```

## Job JSON Schema

Jobs are defined as JSON files in `s3://<bucket>/jobs/<job-id>.json`:

```json
{
  "script": "/shared/workspace/train.py",
  "args": "--epochs 100 --batch-size 32",
  "timeout": 7200,
  "workdir": "/shared/workspace/project",
  "env": {
    "CUDA_VISIBLE_DEVICES": "0",
    "WANDB_API_KEY": "xxx"
  }
}
```

See `cfn/job-schema.json` for full schema definition.

## Acceptance

- `nvidia-smi` shows GPU and driver version `535.x` or `560.x`.
- `/shared` is mounted and writable.
- `/etc/fstab` contains EFS entry.
- `systemctl status isaacsim-job.service` shows enabled.
- `systemctl status spot-handler.service` shows enabled.
- Headless Isaac Lab sample runs successfully.
- Job runner can fetch and execute a test job from S3.

## Rollback

- Fix bootstrap and rerun; otherwise relaunch builder.
