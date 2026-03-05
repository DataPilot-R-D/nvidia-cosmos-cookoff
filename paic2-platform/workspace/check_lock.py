#!/usr/bin/env python3
from __future__ import annotations

import configparser
import json
import pathlib
import subprocess
import sys
from typing import Any


REQUIRED_REPO_KEYS = {
    "id",
    "path",
    "remote",
    "default_branch",
    "commit",
    "domain",
    "criticality",
}


def _load_lock(lock_path: pathlib.Path) -> dict[str, Any]:
    try:
        return json.loads(lock_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"lock file is not valid JSON-compatible YAML: {exc}") from exc


def _check_schema(data: dict[str, Any]) -> None:
    if "schema_version" not in data:
        raise SystemExit("missing schema_version")
    if "repos" not in data or not isinstance(data["repos"], list):
        raise SystemExit("missing repos list")

    seen_ids: set[str] = set()
    seen_paths: set[str] = set()
    for repo in data["repos"]:
        missing = REQUIRED_REPO_KEYS - set(repo.keys())
        if missing:
            raise SystemExit(f"repo entry missing keys: {sorted(missing)}")
        if repo["id"] in seen_ids:
            raise SystemExit(f"duplicate repo id: {repo['id']}")
        if repo["path"] in seen_paths:
            raise SystemExit(f"duplicate repo path: {repo['path']}")
        seen_ids.add(repo["id"])
        seen_paths.add(repo["path"])


def _check_gitmodules(root: pathlib.Path, data: dict[str, Any]) -> None:
    gitmodules = root / ".gitmodules"
    if not gitmodules.exists():
        raise SystemExit("missing .gitmodules")

    config = configparser.ConfigParser()
    config.read(gitmodules, encoding="utf-8")

    by_path = {repo["path"]: repo for repo in data["repos"]}
    for section in config.sections():
        if not section.startswith('submodule "'):
            continue
        path = config.get(section, "path", fallback="")
        url = config.get(section, "url", fallback="")
        if path not in by_path:
            raise SystemExit(f".gitmodules path missing in lock: {path}")
        lock_repo = by_path[path]
        if lock_repo["remote"] != url:
            raise SystemExit(f"remote mismatch for {path}: lock={lock_repo['remote']} gitmodules={url}")


def _check_local_heads(root: pathlib.Path, data: dict[str, Any]) -> None:
    mismatches = []
    for repo in data["repos"]:
        repo_path = root / repo["path"]
        if not (repo_path / ".git").exists():
            continue
        head = subprocess.check_output(
            ["git", "-C", str(repo_path), "rev-parse", "HEAD"], text=True
        ).strip()
        if head != repo["commit"]:
            mismatches.append((repo["id"], repo["commit"], head))

    if mismatches:
        lines = ["local HEAD does not match lock:"]
        for repo_id, expected, actual in mismatches:
            lines.append(f"  - {repo_id}: expected {expected}, got {actual}")
        raise SystemExit("\n".join(lines))


def main() -> int:
    root = pathlib.Path(__file__).resolve().parent.parent
    lock_file = root / "workspace" / "lock.yaml"
    if not lock_file.exists():
        raise SystemExit(f"missing lock file: {lock_file}")

    data = _load_lock(lock_file)
    _check_schema(data)
    _check_gitmodules(root, data)
    _check_local_heads(root, data)

    print("lock validation passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
