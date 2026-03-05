#!/bin/bash
# Isaac Sim Training Job Runner
# Installed to /opt/isaacsim/job-runner.sh on training AMI
set -euo pipefail

# Configuration (override via environment or instance tags)
ARTIFACTS_BUCKET="${ARTIFACTS_BUCKET:-isaacsim-artifacts}"
JOBS_PREFIX="jobs"
RESULTS_PREFIX="results"
CHECKPOINT_INTERVAL="${CHECKPOINT_INTERVAL:-300}"

# Get job ID from instance tag, user-data, or environment
get_job_id() {
    local tag_job_id
    tag_job_id=$(curl -sf http://169.254.169.254/latest/meta-data/tags/instance/JobId 2>/dev/null || echo "")
    if [[ -n "$tag_job_id" ]]; then
        echo "$tag_job_id"
        return
    fi
    echo "${JOB_ID:-default}"
}

JOB_ID=$(get_job_id)
echo "[$(date -Iseconds)] Starting job: $JOB_ID"

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

# Export environment variables from job definition
eval "$(jq -r '.env // {} | to_entries | .[] | "export \(.key)=\"\(.value)\""' /tmp/job.json)"

# Checkpoint function
checkpoint() {
    echo "[$(date -Iseconds)] Checkpointing to S3..."
    aws s3 sync /shared/checkpoints/ "s3://${ARTIFACTS_BUCKET}/${RESULTS_PREFIX}/${JOB_ID}/checkpoints/" --quiet || true
}

# Cleanup on exit
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
echo "[$(date -Iseconds)] Executing: $SCRIPT $ARGS (timeout: ${TIMEOUT}s)"

set +e
timeout "$TIMEOUT" $SCRIPT $ARGS
EXIT_CODE=$?
set -e

# Cleanup
kill $CHECKPOINT_PID 2>/dev/null || true
aws s3 sync /shared/results/ "s3://${ARTIFACTS_BUCKET}/${RESULTS_PREFIX}/${JOB_ID}/" --quiet
checkpoint

# Determine status
STATUS="completed"
[[ $EXIT_CODE -eq 124 ]] && STATUS="timeout"
[[ $EXIT_CODE -ne 0 ]] && [[ $EXIT_CODE -ne 124 ]] && STATUS="failed"

echo "{\"status\": \"$STATUS\", \"exit_code\": $EXIT_CODE, \"finished\": \"$(date -Iseconds)\"}" | \
    aws s3 cp - "s3://${ARTIFACTS_BUCKET}/${RESULTS_PREFIX}/${JOB_ID}/status.json"

echo "[$(date -Iseconds)] Job $JOB_ID finished: $STATUS (exit code: $EXIT_CODE)"
exit $EXIT_CODE
