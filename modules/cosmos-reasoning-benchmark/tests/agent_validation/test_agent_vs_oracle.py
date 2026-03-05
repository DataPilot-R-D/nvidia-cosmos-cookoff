"""Agent-vs-oracle comparisons for deterministic validation checks."""

from __future__ import annotations

import json

from tests.conftest import integration, requires_cosmos
from src.benchmarks.agent_validation.agent_runner import (
    AgentValidationRunner,
    compare_numeric_fields,
)
from src.benchmarks.agent_validation.oracle_track_a import (
    compute_spatial_extremes,
    find_co_located_pairs,
    find_cross_timestamp_relabel_candidates,
    group_object_names_by_timestamp,
    load_track_a_rows,
    summarize_track_a,
)
from src.benchmarks.agent_validation.oracle_track_b import (
    compute_object_persistence,
    find_largest_scene_cluster,
    load_track_b_rows,
    summarize_track_b,
    validate_timestamp_frame_hash_consistency,
)


def test_compare_numeric_fields_respects_tolerance():
    actual = {"distance": 2.54453279, "row_count": 9}
    expected = {"distance": 2.54453280, "row_count": 9}
    mismatches = compare_numeric_fields(actual=actual, expected=expected, abs_tol=1e-6)
    assert mismatches == []


class _FakeCosmosClient:
    def __init__(self, responses: list[dict]):
        self._responses = list(responses)

    def chat(self, messages, temperature=0.0, max_tokens=None):
        assert messages
        assert isinstance(messages[0]["content"], str)
        response = self._responses.pop(0)
        return json.dumps(response)


def test_runner_track_a_group_by_timestamp_parses_strict_json():
    expected = {
        "1771345677.1569738": [
            "wall",
            "electrical outlet",
            "control panel",
            "label",
            "pipe",
        ],
        "1771345682.5338242": [
            "electrical box",
            "white brick wall",
            "horizontal beam",
            "wall-mounted sign",
        ],
    }
    runner = AgentValidationRunner(cosmos_client=_FakeCosmosClient([expected]))
    assert runner.query_track_a_group_by_timestamp() == expected


def test_runner_track_a_spatial_extremes_requires_numeric_fields():
    response = {
        "nearest": {"id": 5, "object_name": "pipe", "distance_3d": 2.5445327951742187},
        "farthest": {
            "id": 8,
            "object_name": "horizontal beam",
            "distance_3d": 12.369205110581952,
        },
    }
    runner = AgentValidationRunner(cosmos_client=_FakeCosmosClient([response]))
    assert runner.query_track_a_spatial_extremes() == response


def test_runner_track_a_colocated_pairs_parses_strict_json():
    response = {
        "pairs": [
            {
                "timestamp": 1771345677.1569738,
                "left_id": 2,
                "left_object_name": "electrical outlet",
                "right_id": 3,
                "right_object_name": "control panel",
            },
            {
                "timestamp": 1771345682.5338242,
                "left_id": 6,
                "left_object_name": "electrical box",
                "right_id": 9,
                "right_object_name": "wall-mounted sign",
            },
        ]
    }
    runner = AgentValidationRunner(cosmos_client=_FakeCosmosClient([response]))
    assert runner.query_track_a_colocated_pairs() == response


def test_runner_track_a_relabel_candidates_parses_strict_json():
    response = {
        "candidates": [
            {
                "source_id": 2,
                "target_id": 6,
                "object_distance_3d": 1.0496592384102403,
                "bbox_iou": 0.1203576341127923,
            },
            {
                "source_id": 3,
                "target_id": 6,
                "object_distance_3d": 1.0496592384102403,
                "bbox_iou": 0.1203576341127923,
            },
        ]
    }
    runner = AgentValidationRunner(cosmos_client=_FakeCosmosClient([response]))
    assert runner.query_track_a_relabel_candidates() == response


def test_runner_track_b_timestamp_hash_consistency_parses_strict_json():
    expected = validate_timestamp_frame_hash_consistency(load_track_b_rows())
    response = {
        "each_timestamp_single_hash": expected["each_timestamp_single_hash"],
        "unique_frame_hashes": expected["unique_frame_hashes"],
        "hash_group_row_counts": expected["hash_group_row_counts"],
    }
    runner = AgentValidationRunner(cosmos_client=_FakeCosmosClient([response]))
    assert runner.query_track_b_timestamp_hash_consistency() == response


def test_runner_track_b_largest_scene_cluster_parses_strict_json():
    expected = find_largest_scene_cluster(load_track_b_rows())
    response = {
        "timestamp": expected["timestamp"],
        "size": expected["size"],
        "object_names": expected["object_names"],
    }
    runner = AgentValidationRunner(cosmos_client=_FakeCosmosClient([response]))
    assert runner.query_track_b_largest_scene_cluster() == response


def test_runner_track_b_object_persistence_parses_strict_json():
    expected = compute_object_persistence(load_track_b_rows())
    runner = AgentValidationRunner(cosmos_client=_FakeCosmosClient([expected]))
    assert runner.query_track_b_object_persistence() == expected


@requires_cosmos
@integration
def test_agent_track_a_summary_matches_oracle(cosmos_client):
    runner = AgentValidationRunner(cosmos_client=cosmos_client)
    actual = runner.query_track_a_summary()
    expected = summarize_track_a(load_track_a_rows())
    mismatches = compare_numeric_fields(actual=actual, expected=expected, abs_tol=1e-6)
    assert mismatches == []


@requires_cosmos
@integration
def test_agent_track_b_summary_matches_oracle(cosmos_client):
    runner = AgentValidationRunner(cosmos_client=cosmos_client)
    actual = runner.query_track_b_summary()
    expected = summarize_track_b(load_track_b_rows())
    mismatches = compare_numeric_fields(actual=actual, expected=expected, abs_tol=1e-6)
    assert mismatches == []


@requires_cosmos
@integration
def test_agent_track_a_group_by_timestamp_matches_oracle(cosmos_client):
    runner = AgentValidationRunner(cosmos_client=cosmos_client)
    actual = runner.query_track_a_group_by_timestamp()
    expected = {
        str(timestamp): object_names
        for timestamp, object_names in group_object_names_by_timestamp(load_track_a_rows()).items()
    }
    assert actual == expected


@requires_cosmos
@integration
def test_agent_track_a_spatial_extremes_matches_oracle(cosmos_client):
    runner = AgentValidationRunner(cosmos_client=cosmos_client)
    actual = runner.query_track_a_spatial_extremes()
    expected = compute_spatial_extremes(load_track_a_rows())
    near_mismatch = compare_numeric_fields(actual["nearest"], expected["nearest"], abs_tol=1e-6)
    far_mismatch = compare_numeric_fields(actual["farthest"], expected["farthest"], abs_tol=1e-6)
    assert near_mismatch == []
    assert far_mismatch == []


@requires_cosmos
@integration
def test_agent_track_a_colocated_pairs_matches_oracle(cosmos_client):
    runner = AgentValidationRunner(cosmos_client=cosmos_client)
    actual = runner.query_track_a_colocated_pairs()
    expected = {"pairs": find_co_located_pairs(load_track_a_rows())}
    assert actual == expected


@requires_cosmos
@integration
def test_agent_track_a_relabel_candidates_matches_oracle(cosmos_client):
    runner = AgentValidationRunner(cosmos_client=cosmos_client)
    actual = runner.query_track_a_relabel_candidates()
    expected = {"candidates": find_cross_timestamp_relabel_candidates(load_track_a_rows())}
    assert len(actual["candidates"]) == len(expected["candidates"])
    for index in range(len(expected["candidates"])):
        mismatch = compare_numeric_fields(
            actual=actual["candidates"][index],
            expected=expected["candidates"][index],
            abs_tol=1e-6,
        )
        assert mismatch == []


@requires_cosmos
@integration
def test_agent_track_b_timestamp_hash_consistency_matches_oracle(cosmos_client):
    runner = AgentValidationRunner(cosmos_client=cosmos_client)
    actual = runner.query_track_b_timestamp_hash_consistency()
    expected = validate_timestamp_frame_hash_consistency(load_track_b_rows())
    mismatch = compare_numeric_fields(actual=actual, expected=expected, abs_tol=1e-6)
    assert mismatch == []
    assert actual["hash_group_row_counts"] == expected["hash_group_row_counts"]


@requires_cosmos
@integration
def test_agent_track_b_largest_scene_cluster_matches_oracle(cosmos_client):
    runner = AgentValidationRunner(cosmos_client=cosmos_client)
    actual = runner.query_track_b_largest_scene_cluster()
    expected = find_largest_scene_cluster(load_track_b_rows())
    mismatch = compare_numeric_fields(actual=actual, expected=expected, abs_tol=1e-6)
    assert mismatch == []
    assert actual["object_names"] == expected["object_names"]


@requires_cosmos
@integration
def test_agent_track_b_object_persistence_matches_oracle(cosmos_client):
    runner = AgentValidationRunner(cosmos_client=cosmos_client)
    actual = runner.query_track_b_object_persistence()
    expected = compute_object_persistence(load_track_b_rows())
    assert actual == expected
