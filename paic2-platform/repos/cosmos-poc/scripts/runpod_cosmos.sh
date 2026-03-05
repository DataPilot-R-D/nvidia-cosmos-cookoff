#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${RUNPOD_COSMOS_ENV_FILE:-$REPO_ROOT/.env}"
LOG_DIR="${RUNPOD_COSMOS_LOG_DIR:-$REPO_ROOT/logs/runpod-cosmos}"
SECRETS_FILE="$REPO_ROOT/.openclaw/.env"

mkdir -p "$LOG_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${RUNPOD_API_KEY:-}" && -f "$SECRETS_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
  set +a
fi

export RUNPOD_COSMOS_LOG_DIR="$LOG_DIR"
export RUNPOD_COSMOS_DEFAULT_WARM_MINUTES="${RUNPOD_COSMOS_DEFAULT_WARM_MINUTES:-60}"

export PYTHONUNBUFFERED=1

exec python3 "$SCRIPT_DIR/runpod_cosmos.py" "$@"
