"""Smoke tests for the agent validation CLI runner."""

from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys


PROJECT_ROOT = Path(__file__).resolve().parents[2]
RUNNER = PROJECT_ROOT / "scripts" / "run_agent_validation.py"


def test_runner_help():
    result = subprocess.run(
        [sys.executable, str(RUNNER), "--help"],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    assert "--output-dir" in result.stdout
    assert "--skip-agent" in result.stdout


def test_runner_oracle_only_outputs_json_files(tmp_path):
    result = subprocess.run(
        [
            sys.executable,
            str(RUNNER),
            "--output-dir",
            str(tmp_path),
            "--skip-agent",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0

    summary_file = tmp_path / "summary.json"
    track_a_file = tmp_path / "oracle_track_a.json"
    track_b_file = tmp_path / "oracle_track_b.json"
    v2_v3_metrics_file = tmp_path / "v2_v3_metrics.json"

    assert summary_file.is_file()
    assert track_a_file.is_file()
    assert track_b_file.is_file()
    assert v2_v3_metrics_file.is_file()

    summary = json.loads(summary_file.read_text(encoding="utf-8"))
    assert summary["oracle"]["track_a_summary"]["row_count"] == 9
    assert summary["oracle"]["track_b_summary"]["row_count"] == 20
    assert summary["v2_vs_v3"]["aggregate"]["v2_avg_calls_per_frame"] == 5.0
    assert summary["v2_vs_v3"]["aggregate"]["v3_avg_calls_per_frame"] < 5.0
    assert summary["oracle"]["track_a_group_by_timestamp"]["1771345677.1569738"] == [
        "wall",
        "electrical outlet",
        "control panel",
        "label",
        "pipe",
    ]
    assert summary["oracle"]["track_b_timestamp_hash_consistency"]["unique_frame_hashes"] == 6


def test_runner_help_includes_multimodal_flags():
    result = subprocess.run(
        [sys.executable, str(RUNNER), "--help"],
        check=False,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    assert "--include-multimodal" in result.stdout
    assert "--multimodal-cases" in result.stdout
