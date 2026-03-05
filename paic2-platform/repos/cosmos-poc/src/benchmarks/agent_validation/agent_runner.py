"""Agent harness for Issue #28 agent-vs-oracle validation queries."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
from typing import Any, Callable

from src.benchmarks.agent_validation.oracle_track_a import load_track_a_rows
from src.benchmarks.agent_validation.oracle_track_b import load_track_b_rows
from src.benchmarks.agent_validation.response_contract import (
    ResponseContractError,
    parse_strict_json_object,
    validate_required_numeric_fields,
)
from src.connectors.cosmos_client import CosmosClient


def compare_numeric_fields(
    actual: dict[str, Any],
    expected: dict[str, Any],
    abs_tol: float,
) -> list[str]:
    """Return mismatch messages for expected numeric fields."""

    mismatches: list[str] = []
    for key, expected_value in expected.items():
        if isinstance(expected_value, bool) or not isinstance(expected_value, (int, float)):
            continue

        actual_value = actual.get(key)
        if isinstance(actual_value, bool) or not isinstance(actual_value, (int, float)):
            mismatches.append(
                f"{key}: expected numeric value {expected_value!r}, got {actual_value!r}"
            )
            continue

        if not math.isclose(float(actual_value), float(expected_value), abs_tol=abs_tol):
            mismatches.append(f"{key}: expected {expected_value}, got {actual_value}")

    return mismatches


def _ensure_numeric(value: Any, key: str) -> None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ResponseContractError(f"Field '{key}' must be numeric, got {type(value).__name__}")


def _ensure_text(value: Any, key: str) -> None:
    if not isinstance(value, str):
        raise ResponseContractError(f"Field '{key}' must be text, got {type(value).__name__}")


def _ensure_list(value: Any, key: str) -> list[Any]:
    if not isinstance(value, list):
        raise ResponseContractError(f"Field '{key}' must be a list, got {type(value).__name__}")
    return value


def _ensure_object(value: Any, key: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ResponseContractError(f"Field '{key}' must be an object, got {type(value).__name__}")
    return value


@dataclass
class AgentValidationRunner:
    """Run deterministic prompts against Cosmos and parse strict JSON outputs."""

    cosmos_client: CosmosClient
    max_tokens: int = 1200

    # ------------------------------------------------------------------
    # Track A (CSV) queries
    # ------------------------------------------------------------------
    def query_track_a_summary(self) -> dict[str, Any]:
        """Ask the agent to compute Track A summary metrics from provided rows."""

        rows = load_track_a_rows()
        rows_payload = [
            {
                "id": row.id,
                "timestamp": row.timestamp,
                "object_name": row.object_name,
                "confidence": row.confidence,
                "bbox_x_min": row.bbox_x_min,
                "bbox_y_min": row.bbox_y_min,
                "bbox_x_max": row.bbox_x_max,
                "bbox_y_max": row.bbox_y_max,
            }
            for row in rows
        ]

        prompt = (
            "You are given detections JSON records.\n"
            "Compute this summary:\n"
            "- row_count\n"
            "- timestamp_min\n"
            "- timestamp_max\n"
            "- confidence_min\n"
            "- confidence_max\n"
            "- invalid_bbox_count (bbox_x_min >= bbox_x_max OR bbox_y_min >= bbox_y_max)\n\n"
            "Return ONLY a strict JSON object with exactly those keys.\n"
            "Keep numeric values as numbers, not strings.\n\n"
            f"detections = {json.dumps(rows_payload, separators=(',', ':'))}"
        )

        payload = self._ask_json(prompt)
        validate_required_numeric_fields(
            payload=payload,
            required_keys={
                "row_count",
                "timestamp_min",
                "timestamp_max",
                "confidence_min",
                "confidence_max",
                "invalid_bbox_count",
            },
            numeric_keys={
                "row_count",
                "timestamp_min",
                "timestamp_max",
                "confidence_min",
                "confidence_max",
                "invalid_bbox_count",
            },
        )
        return payload

    def query_track_a_group_by_timestamp(self) -> dict[str, Any]:
        """Ask the agent for timestamp -> object_name list mapping."""

        rows_payload = [
            {
                "id": row.id,
                "timestamp": row.timestamp,
                "object_name": row.object_name,
            }
            for row in load_track_a_rows()
        ]

        prompt = (
            "You are given detections JSON records.\n"
            "Return a strict JSON object mapping timestamp string -> ordered object_name list.\n"
            "Keep timestamps as object keys (strings), values as string arrays.\n\n"
            f"detections = {json.dumps(rows_payload, separators=(',', ':'))}"
        )
        payload = self._ask_json(prompt)
        for key, value in payload.items():
            _ensure_text(key, "timestamp_key")
            object_names = _ensure_list(value, f"{key}")
            for index, object_name in enumerate(object_names):
                _ensure_text(object_name, f"{key}[{index}]")
        return payload

    def query_track_a_spatial_extremes(self) -> dict[str, Any]:
        """Ask the agent for nearest/farthest robot->object distances."""

        rows_payload = [
            {
                "id": row.id,
                "object_name": row.object_name,
                "robot_x": row.robot_x,
                "robot_y": row.robot_y,
                "robot_z": row.robot_z,
                "object_x": row.object_x,
                "object_y": row.object_y,
                "object_z": row.object_z,
            }
            for row in load_track_a_rows()
        ]

        prompt = (
            "You are given detections JSON records.\n"
            "Compute Euclidean 3D distance between robot and object for each row.\n"
            "Return ONLY strict JSON:\n"
            '{"nearest":{"id":0,"object_name":"","distance_3d":0.0},'
            '"farthest":{"id":0,"object_name":"","distance_3d":0.0}}\n\n'
            f"detections = {json.dumps(rows_payload, separators=(',', ':'))}"
        )
        payload = self._ask_json(prompt)
        for key in ("nearest", "farthest"):
            node = _ensure_object(payload.get(key), key)
            validate_required_numeric_fields(
                payload=node,
                required_keys={"id", "distance_3d"},
                numeric_keys={"id", "distance_3d"},
            )
            _ensure_text(node.get("object_name"), f"{key}.object_name")
        return payload

    def query_track_a_colocated_pairs(self) -> dict[str, Any]:
        """Ask the agent for co-located row pairs."""

        rows_payload = [
            {
                "id": row.id,
                "timestamp": row.timestamp,
                "object_name": row.object_name,
                "object_x": row.object_x,
                "object_y": row.object_y,
                "object_z": row.object_z,
                "bbox_x_min": row.bbox_x_min,
                "bbox_y_min": row.bbox_y_min,
                "bbox_x_max": row.bbox_x_max,
                "bbox_y_max": row.bbox_y_max,
            }
            for row in load_track_a_rows()
        ]

        prompt = (
            "You are given detections JSON records.\n"
            "Find co-located pairs: same timestamp, identical object 3D position, identical bbox.\n"
            "Return ONLY strict JSON:\n"
            '{"pairs":[{"timestamp":0.0,"left_id":0,"left_object_name":"",'
            '"right_id":0,"right_object_name":""}]}\n\n'
            f"detections = {json.dumps(rows_payload, separators=(',', ':'))}"
        )
        payload = self._ask_json(prompt)
        pairs = _ensure_list(payload.get("pairs"), "pairs")
        for index, pair in enumerate(pairs):
            item = _ensure_object(pair, f"pairs[{index}]")
            validate_required_numeric_fields(
                payload=item,
                required_keys={"timestamp", "left_id", "right_id"},
                numeric_keys={"timestamp", "left_id", "right_id"},
            )
            _ensure_text(item.get("left_object_name"), f"pairs[{index}].left_object_name")
            _ensure_text(item.get("right_object_name"), f"pairs[{index}].right_object_name")
        return payload

    def query_track_a_relabel_candidates(self) -> dict[str, Any]:
        """Ask the agent for cross-timestamp relabel candidates and evidence."""

        rows_payload = [
            {
                "id": row.id,
                "timestamp": row.timestamp,
                "object_name": row.object_name,
                "object_x": row.object_x,
                "object_y": row.object_y,
                "object_z": row.object_z,
                "bbox_x_min": row.bbox_x_min,
                "bbox_y_min": row.bbox_y_min,
                "bbox_x_max": row.bbox_x_max,
                "bbox_y_max": row.bbox_y_max,
            }
            for row in load_track_a_rows()
        ]

        prompt = (
            "You are given detections JSON records.\n"
            "Filter rows matching electrical|outlet|panel|box.\n"
            "Across increasing timestamp, detect relabel candidates with rules:\n"
            "- object 3D distance <= 1.1\n"
            "- bbox IoU >= 0.10 using inclusive pixel area (x2-x1+1, y2-y1+1)\n"
            "Return ONLY strict JSON:\n"
            '{"candidates":[{"source_id":0,"target_id":0,'
            '"object_distance_3d":0.0,"bbox_iou":0.0}]}\n\n'
            f"detections = {json.dumps(rows_payload, separators=(',', ':'))}"
        )
        payload = self._ask_json(prompt)
        candidates = _ensure_list(payload.get("candidates"), "candidates")
        for index, candidate in enumerate(candidates):
            item = _ensure_object(candidate, f"candidates[{index}]")
            validate_required_numeric_fields(
                payload=item,
                required_keys={"source_id", "target_id", "object_distance_3d", "bbox_iou"},
                numeric_keys={"source_id", "target_id", "object_distance_3d", "bbox_iou"},
            )
        return payload

    # ------------------------------------------------------------------
    # Track B (SQLite + BLOB hash derived) queries
    # ------------------------------------------------------------------
    def query_track_b_summary(self) -> dict[str, Any]:
        """Ask the agent to compute Track B summary metrics from provided rows."""

        rows = load_track_b_rows()
        rows_payload = [
            {
                "id": row.id,
                "timestamp": row.timestamp,
                "object_name": row.object_name,
                "blob_len": len(row.camera_frame_jpeg) if row.camera_frame_jpeg else 0,
                "has_blob": bool(row.camera_frame_jpeg),
            }
            for row in rows
        ]

        prompt = (
            "You are given object detection records extracted from SQLite.\n"
            "Compute this summary:\n"
            "- row_count\n"
            "- distinct_object_names\n"
            "- distinct_timestamps\n"
            "- timestamp_min\n"
            "- timestamp_max\n"
            "- rows_with_blob\n"
            "- blob_len_min (across rows where has_blob=true)\n"
            "- blob_len_max (across rows where has_blob=true)\n\n"
            "Return ONLY a strict JSON object with exactly those keys.\n"
            "Keep numeric values as numbers, not strings.\n\n"
            f"rows = {json.dumps(rows_payload, separators=(',', ':'))}"
        )

        payload = self._ask_json(prompt)
        validate_required_numeric_fields(
            payload=payload,
            required_keys={
                "row_count",
                "distinct_object_names",
                "distinct_timestamps",
                "timestamp_min",
                "timestamp_max",
                "rows_with_blob",
                "blob_len_min",
                "blob_len_max",
            },
            numeric_keys={
                "row_count",
                "distinct_object_names",
                "distinct_timestamps",
                "timestamp_min",
                "timestamp_max",
                "rows_with_blob",
                "blob_len_min",
                "blob_len_max",
            },
        )
        return payload

    def query_track_b_timestamp_hash_consistency(self) -> dict[str, Any]:
        """Ask the agent to validate timestamp->frame-hash consistency."""

        rows_payload = self._track_b_rows_with_hashes()
        prompt = (
            "You are given detection rows with timestamp and frame_hash.\n"
            "Return strict JSON:\n"
            '{"each_timestamp_single_hash":true,"unique_frame_hashes":0,'
            '"hash_group_row_counts":[0]}\n'
            "Rules:\n"
            "- each_timestamp_single_hash is true iff each timestamp has one unique hash\n"
            "- unique_frame_hashes is number of distinct frame_hash values\n"
            "- hash_group_row_counts is sorted ascending counts per frame_hash group\n\n"
            f"rows = {json.dumps(rows_payload, separators=(',', ':'))}"
        )
        payload = self._ask_json(prompt)
        if not isinstance(payload.get("each_timestamp_single_hash"), bool):
            raise ResponseContractError(
                "Field 'each_timestamp_single_hash' must be boolean"
            )
        validate_required_numeric_fields(
            payload=payload,
            required_keys={"unique_frame_hashes"},
            numeric_keys={"unique_frame_hashes"},
        )
        counts = _ensure_list(payload.get("hash_group_row_counts"), "hash_group_row_counts")
        for index, count in enumerate(counts):
            _ensure_numeric(count, f"hash_group_row_counts[{index}]")
        return payload

    def query_track_b_largest_scene_cluster(self) -> dict[str, Any]:
        """Ask the agent for the largest scene cluster from frame hashes."""

        rows_payload = self._track_b_rows_with_hashes()
        prompt = (
            "You are given detection rows with timestamp, object_name, frame_hash.\n"
            "Define a scene cluster as rows sharing the same frame_hash.\n"
            "Return the largest cluster as strict JSON:\n"
            '{"timestamp":0.0,"size":0,"object_names":[""]}\n\n'
            f"rows = {json.dumps(rows_payload, separators=(',', ':'))}"
        )
        payload = self._ask_json(prompt)
        validate_required_numeric_fields(
            payload=payload,
            required_keys={"timestamp", "size"},
            numeric_keys={"timestamp", "size"},
        )
        object_names = _ensure_list(payload.get("object_names"), "object_names")
        for index, object_name in enumerate(object_names):
            _ensure_text(object_name, f"object_names[{index}]")
        return payload

    def query_track_b_object_persistence(self) -> dict[str, Any]:
        """Ask the agent for object_name -> distinct timestamp count mapping."""

        rows_payload = [
            {
                "timestamp": row.timestamp,
                "object_name": row.object_name,
            }
            for row in load_track_b_rows()
        ]
        prompt = (
            "You are given detection rows with object_name and timestamp.\n"
            "Return a strict JSON object mapping each object_name to the number of distinct timestamps.\n"
            "Values must be numeric.\n\n"
            f"rows = {json.dumps(rows_payload, separators=(',', ':'))}"
        )
        payload = self._ask_json(prompt)
        for key, value in payload.items():
            _ensure_text(key, "object_name")
            _ensure_numeric(value, f"persistence.{key}")
        return payload

    def run_repeated(
        self,
        fn: Callable[[], dict[str, Any]],
        runs: int = 3,
    ) -> list[dict[str, Any]]:
        """Execute a query function multiple times to inspect stability."""

        return [fn() for _ in range(runs)]

    def run_matrix_once(self) -> dict[str, dict[str, Any]]:
        """Run all agent validation queries once."""

        return {
            "track_a_summary": self.query_track_a_summary(),
            "track_a_group_by_timestamp": self.query_track_a_group_by_timestamp(),
            "track_a_spatial_extremes": self.query_track_a_spatial_extremes(),
            "track_a_colocated_pairs": self.query_track_a_colocated_pairs(),
            "track_a_relabel_candidates": self.query_track_a_relabel_candidates(),
            "track_b_summary": self.query_track_b_summary(),
            "track_b_timestamp_hash_consistency": self.query_track_b_timestamp_hash_consistency(),
            "track_b_largest_scene_cluster": self.query_track_b_largest_scene_cluster(),
            "track_b_object_persistence": self.query_track_b_object_persistence(),
        }

    def _track_b_rows_with_hashes(self) -> list[dict[str, Any]]:
        rows_payload = []
        for row in load_track_b_rows():
            blob = row.camera_frame_jpeg or b""
            rows_payload.append(
                {
                    "id": row.id,
                    "timestamp": row.timestamp,
                    "object_name": row.object_name,
                    "frame_hash": hashlib.sha256(blob).hexdigest(),
                }
            )
        return rows_payload

    def _ask_json(self, prompt: str) -> dict[str, Any]:
        raw = self.cosmos_client.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=self.max_tokens,
        )
        return parse_strict_json_object(raw)
