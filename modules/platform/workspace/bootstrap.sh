#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="$ROOT_DIR/workspace/lock.yaml"
SKIP_FETCH=0
ALLOW_DIRTY=0

usage() {
  cat <<'EOF'
Usage:
  ./workspace/bootstrap.sh [--skip-fetch] [--allow-dirty]

Options:
  --skip-fetch   Do not fetch from remotes before checkout.
  --allow-dirty  Do not fail when target repo has uncommitted changes.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-fetch)
      SKIP_FETCH=1
      shift
      ;;
    --allow-dirty)
      ALLOW_DIRTY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[bootstrap] unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$LOCK_FILE" ]]; then
  echo "[bootstrap] missing lock file: $LOCK_FILE" >&2
  exit 1
fi

mkdir -p "$ROOT_DIR/repos"

while IFS=$'\t' read -r repo_id repo_path repo_remote repo_commit; do
  abs_path="$ROOT_DIR/$repo_path"
  mkdir -p "$(dirname "$abs_path")"

  repo_exists=0
  if [[ -d "$abs_path" ]] && git -C "$abs_path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    repo_exists=1
  fi

  if [[ "$repo_exists" -eq 0 ]]; then
    if [[ -d "$abs_path" ]] && [[ -n "$(find "$abs_path" -mindepth 1 -maxdepth 1 2>/dev/null)" ]]; then
      echo "[bootstrap] existing non-git directory at $repo_path; cannot clone into non-empty path" >&2
      exit 3
    fi
    echo "[bootstrap] clone $repo_id -> $repo_path"
    git clone "$repo_remote" "$abs_path"
  fi

  if [[ "$SKIP_FETCH" -eq 0 ]]; then
    echo "[bootstrap] fetch $repo_id"
    git -C "$abs_path" fetch --all --tags --prune
  fi

  if [[ "$ALLOW_DIRTY" -eq 0 ]] && [[ -n "$(git -C "$abs_path" status --porcelain)" ]]; then
    echo "[bootstrap] dirty repo detected at $repo_path; commit/stash or pass --allow-dirty" >&2
    exit 2
  fi

  echo "[bootstrap] checkout $repo_id @ $repo_commit"
  git -C "$abs_path" checkout "$repo_commit"
done < <(
  python3 - "$LOCK_FILE" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)

for repo in data["repos"]:
    print(f"{repo['id']}\t{repo['path']}\t{repo['remote']}\t{repo['commit']}")
PY
)

if command -v vcs >/dev/null 2>&1; then
  echo "[bootstrap] vcstool detected. Import external ROS2 deps with:"
  echo "  vcs import < workspace/ros2_external.repos"
else
  echo "[bootstrap] tip: install vcstool to import workspace/ros2_external.repos"
fi

echo "[bootstrap] workspace is aligned to lock file."
