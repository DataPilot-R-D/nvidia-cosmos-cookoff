"""Helpers for Track B frame extraction and JPEG validation."""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys

from PIL import Image

from src.benchmarks.agent_validation.foundation import COSMOS2_DIR, PROJECT_ROOT

QUERY_SCRIPT = PROJECT_ROOT / "scripts" / "query_object_database.py"
TRACK_B_DB_PATH = COSMOS2_DIR / "objects.db"


def _run_query_script(args: list[str]) -> subprocess.CompletedProcess[str]:
    command = [sys.executable, str(QUERY_SCRIPT), "--db", str(TRACK_B_DB_PATH), *args]
    result = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            "query_object_database.py failed "
            f"(exit={result.returncode}) stdout={result.stdout!r} stderr={result.stderr!r}"
        )
    return result


def run_query_script_stats() -> str:
    """Execute --stats and return stdout."""

    return _run_query_script(["--stats"]).stdout


def _is_valid_jpeg(path: Path) -> bool:
    try:
        with Image.open(path) as image:
            image.verify()
        with Image.open(path) as image:
            image.load()
    except Exception:
        return False
    return True


def assert_all_exported_frames_are_valid_jpeg(export_dir: Path) -> list[Path]:
    """Export frames and return validated JPEG paths."""

    _run_query_script(["--export-frames", str(export_dir)])
    exported = sorted(export_dir.glob("*.jpg"))
    if len(exported) != 20:
        raise AssertionError(f"Expected 20 exported JPEGs, got {len(exported)}")

    invalid = [path for path in exported if not _is_valid_jpeg(path)]
    if invalid:
        names = ", ".join(path.name for path in invalid)
        raise AssertionError(f"Invalid JPEG files: {names}")

    return exported

