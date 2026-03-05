"""Multimodal (image + structured data) validation tests."""

from __future__ import annotations

from pathlib import Path

from tests.conftest import integration, requires_cosmos
from src.benchmarks.agent_validation.multimodal_enrichment import (
    AgentMultimodalValidationRunner,
    build_scene_enrichment_prompt,
    export_timestamp_frame,
    get_track_b_scene_case,
)
from src.benchmarks.agent_validation.oracle_track_b import find_largest_scene_cluster, load_track_b_rows


def test_get_track_b_scene_case_matches_largest_cluster():
    case = get_track_b_scene_case()
    expected = find_largest_scene_cluster(load_track_b_rows())
    assert case["timestamp"] == expected["timestamp"]
    assert case["object_names"] == expected["object_names"]
    assert case["size"] == expected["size"]


def test_export_timestamp_frame_creates_jpeg_file(tmp_path):
    case = get_track_b_scene_case()
    frame_path = export_timestamp_frame(case["timestamp"], output_dir=tmp_path)
    assert frame_path.is_file()
    assert frame_path.suffix == ".jpg"
    assert frame_path.stat().st_size > 0


def test_build_scene_enrichment_prompt_contains_candidates():
    case = get_track_b_scene_case()
    prompt = build_scene_enrichment_prompt(case)
    assert "candidate_object_names" in prompt
    assert "visible_objects" in prompt
    assert "MUST equal" in prompt
    assert str(case["timestamp"]) in prompt
    for object_name in case["object_names"]:
        assert object_name in prompt


@requires_cosmos
@integration
def test_multimodal_scene_enrichment_matches_oracle_subset(cosmos_client, tmp_path: Path):
    runner = AgentMultimodalValidationRunner(cosmos_client=cosmos_client, work_dir=tmp_path)
    result = runner.query_largest_scene_with_image_enrichment()

    case = get_track_b_scene_case()
    expected_objects = set(case["object_names"])
    predicted_objects = set(result["visible_objects"])

    assert result["timestamp"] == case["timestamp"]
    assert predicted_objects.issubset(expected_objects)
    assert len(predicted_objects.intersection(expected_objects)) >= 4
