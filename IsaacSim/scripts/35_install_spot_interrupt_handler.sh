#!/usr/bin/env bash
# Install a Spot interruption notice handler on the training AMI.
set -euo pipefail

HANDLER_PATH="/usr/local/bin/spot-interrupt-handler.sh"
SERVICE_PATH="/etc/systemd/system/spot-interrupt-handler.service"

cat > "${HANDLER_PATH}" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

METADATA_URL="http://169.254.169.254/latest/meta-data/spot/instance-action"
ARTIFACTS_BUCKET="${ARTIFACTS_BUCKET:-isaacsim-artifacts}"
RESULTS_PREFIX="${RESULTS_PREFIX:-results}"
JOB_ID="${JOB_ID:-latest}"

while true; do
  if curl -fs "${METADATA_URL}" >/tmp/spot-action.json; then
    echo "Spot interruption notice received: $(cat /tmp/spot-action.json)"
    if [[ -d /shared/checkpoints ]]; then
      aws s3 sync /shared/checkpoints/ "s3://${ARTIFACTS_BUCKET}/${RESULTS_PREFIX}/${JOB_ID}/checkpoints/" --quiet || true
    fi
    if [[ -d /shared/results ]]; then
      aws s3 sync /shared/results/ "s3://${ARTIFACTS_BUCKET}/${RESULTS_PREFIX}/${JOB_ID}/" --quiet || true
    fi
    sleep 120
  fi
  sleep 5
done
EOF

chmod +x "${HANDLER_PATH}"

cat > "${SERVICE_PATH}" <<EOF
[Unit]
Description=Spot interruption handler
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=${HANDLER_PATH}
Restart=always
RestartSec=5
Environment=ARTIFACTS_BUCKET=${ARTIFACTS_BUCKET:-isaacsim-artifacts}
Environment=RESULTS_PREFIX=${RESULTS_PREFIX:-results}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now spot-interrupt-handler.service
systemctl status spot-interrupt-handler.service --no-pager
