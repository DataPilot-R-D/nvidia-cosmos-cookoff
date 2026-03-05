"""Track B BLOB extraction and JPEG validity checks."""

from __future__ import annotations

from src.benchmarks.agent_validation.blob_validation import (
    assert_all_exported_frames_are_valid_jpeg,
    run_query_script_stats,
)


def test_query_script_stats_reports_expected_counts():
    output = run_query_script_stats()
    assert "Total detections: 20" in output
    assert "Detections with camera frame: 20" in output


def test_export_frames_produces_20_valid_jpegs(tmp_path):
    exported = assert_all_exported_frames_are_valid_jpeg(export_dir=tmp_path)
    assert len(exported) == 20
