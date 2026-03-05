"""Stronger multimodal evidence matrix tests (A/B + conflict + decoys)."""

from __future__ import annotations

from pathlib import Path

from tests.conftest import integration, requires_cosmos
from src.benchmarks.agent_validation.multimodal_matrix import (
    MultimodalEvidenceRunner,
    build_multimodal_cases,
    score_object_sets,
)


def test_score_object_sets_basic():
    score = score_object_sets(
        predicted={"wall", "beam", "sign"},
        expected={"wall", "beam", "column"},
    )
    assert score["tp"] == 2
    assert score["fp"] == 1
    assert score["fn"] == 1
    assert 0.0 <= score["precision"] <= 1.0
    assert 0.0 <= score["recall"] <= 1.0
    assert 0.0 <= score["f1"] <= 1.0


def test_build_multimodal_cases_has_decoys(tmp_path: Path):
    cases = build_multimodal_cases(output_dir=tmp_path, max_cases=3, decoy_count=2)
    assert len(cases) == 3
    for case in cases:
        assert case.frame_path.is_file()
        assert len(case.oracle_objects) > 0
        assert len(case.decoy_objects) == 2
        assert set(case.decoy_objects).isdisjoint(set(case.oracle_objects))
        assert set(case.oracle_objects).issubset(set(case.candidate_objects))


@requires_cosmos
@integration
def test_multimodal_evidence_matrix_report_shape(cosmos_client, tmp_path: Path):
    runner = MultimodalEvidenceRunner(cosmos_client=cosmos_client, work_dir=tmp_path)
    report = runner.run_evidence_matrix(max_cases=2)

    assert report["case_count"] == 2
    assert "avg_f1_image_enriched" in report
    assert "avg_f1_metadata_only" in report
    assert "f1_lift_image_minus_metadata" in report
    assert "conflict_detection_rate" in report
    assert "thresholds" in report
    assert "threshold_results" in report
    assert len(report["per_case"]) == 2
