#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="$ROOT_DIR/workspace/lock.yaml"

if [[ ! -f "$LOCK_FILE" ]]; then
  echo "[update_lock] missing lock file: $LOCK_FILE" >&2
  exit 1
fi

python3 - "$ROOT_DIR" "$LOCK_FILE" <<'PY'
import datetime as dt
import json
import pathlib
import subprocess
import sys

root = pathlib.Path(sys.argv[1])
lock_file = pathlib.Path(sys.argv[2])

with lock_file.open("r", encoding="utf-8") as f:
    data = json.load(f)

for repo in data.get("repos", []):
    path = root / repo["path"]
    if not (path / ".git").exists():
        raise SystemExit(f"[update_lock] missing git repo: {path}")

    commit = subprocess.check_output(
        ["git", "-C", str(path), "rev-parse", "HEAD"], text=True
    ).strip()
    branch = subprocess.check_output(
        ["git", "-C", str(path), "rev-parse", "--abbrev-ref", "HEAD"], text=True
    ).strip()

    repo["commit"] = commit
    repo["default_branch"] = branch

data["generated_at_utc"] = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()

with lock_file.open("w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY

echo "[update_lock] updated $LOCK_FILE"
