"""Deterministic oracle validation tests for Track B SQLite samples."""

from __future__ import annotations

from src.benchmarks.agent_validation.oracle_track_b import (
    compute_object_persistence,
    find_largest_scene_cluster,
    load_track_b_rows,
    summarize_track_b,
    validate_timestamp_frame_hash_consistency,
)


def test_track_b_summary_matches_expected_values():
    rows = load_track_b_rows()
    summary = summarize_track_b(rows)

    assert summary == {
        "row_count": 20,
        "distinct_object_names": 16,
        "distinct_timestamps": 6,
        "timestamp_min": 1771429579.3890905,
        "timestamp_max": 1771429616.2139637,
        "rows_with_blob": 20,
        "blob_len_min": 33107,
        "blob_len_max": 38168,
    }


def test_track_b_timestamp_to_frame_consistency():
    rows = load_track_b_rows()
    stats = validate_timestamp_frame_hash_consistency(rows)

    assert stats["each_timestamp_single_hash"] is True
    assert stats["unique_frame_hashes"] == 6
    assert stats["hash_group_row_counts"] == [1, 1, 2, 5, 5, 6]


def test_track_b_largest_scene_cluster():
    rows = load_track_b_rows()
    cluster = find_largest_scene_cluster(rows)

    assert cluster["timestamp"] == 1771429598.6261687
    assert cluster["size"] == 6
    assert cluster["object_names"] == [
        "wall",
        "structural beam",
        "horizontal bar",
        "vertical beam",
        "bracket",
        "support column",
    ]


def test_track_b_object_persistence_counts():
    rows = load_track_b_rows()
    persistence = compute_object_persistence(rows)

    assert persistence["storage rack"] == 4
    assert persistence["purple boxes"] == 2
    for object_name, count in persistence.items():
        if object_name not in {"storage rack", "purple boxes"}:
            assert count == 1
