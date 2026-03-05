"""Deterministic oracle validation tests for Track A CSV samples."""

from __future__ import annotations

import math

from src.benchmarks.agent_validation.oracle_track_a import (
    compute_spatial_extremes,
    find_co_located_pairs,
    find_cross_timestamp_relabel_candidates,
    group_object_names_by_timestamp,
    load_track_a_rows,
    summarize_track_a,
)


def test_track_a_summary_matches_expected_values():
    rows = load_track_a_rows()
    summary = summarize_track_a(rows)

    assert summary["row_count"] == 9
    assert summary["timestamp_min"] == 1771345677.1569738
    assert summary["timestamp_max"] == 1771345682.5338242
    assert summary["confidence_min"] == 0.5
    assert summary["confidence_max"] == 0.5
    assert summary["invalid_bbox_count"] == 0


def test_track_a_group_by_timestamp_matches_expected_lists():
    rows = load_track_a_rows()
    grouped = group_object_names_by_timestamp(rows)

    assert grouped == {
        1771345677.1569738: [
            "wall",
            "electrical outlet",
            "control panel",
            "label",
            "pipe",
        ],
        1771345682.5338242: [
            "electrical box",
            "white brick wall",
            "horizontal beam",
            "wall-mounted sign",
        ],
    }


def test_track_a_spatial_nearest_and_farthest():
    rows = load_track_a_rows()
    extremes = compute_spatial_extremes(rows)

    nearest = extremes["nearest"]
    farthest = extremes["farthest"]

    assert nearest["id"] == 5
    assert nearest["object_name"] == "pipe"
    assert math.isclose(nearest["distance_3d"], 2.5445327951742187, abs_tol=1e-6)

    assert farthest["id"] == 8
    assert farthest["object_name"] == "horizontal beam"
    assert math.isclose(farthest["distance_3d"], 12.369205110581952, abs_tol=1e-6)


def test_track_a_colocation_pairs_match_expected_rows():
    rows = load_track_a_rows()
    pairs = find_co_located_pairs(rows)

    normalized_pairs = {(pair["left_id"], pair["right_id"]) for pair in pairs}
    assert normalized_pairs == {(2, 3), (6, 9)}


def test_track_a_cross_timestamp_relabel_candidates():
    rows = load_track_a_rows()
    candidates = find_cross_timestamp_relabel_candidates(rows)

    assert {(item["source_id"], item["target_id"]) for item in candidates} == {(2, 6), (3, 6)}
    for item in candidates:
        assert math.isclose(item["object_distance_3d"], 1.0496592384102403, abs_tol=1e-6)
        assert math.isclose(item["bbox_iou"], 0.1203576341127923, abs_tol=1e-6)
