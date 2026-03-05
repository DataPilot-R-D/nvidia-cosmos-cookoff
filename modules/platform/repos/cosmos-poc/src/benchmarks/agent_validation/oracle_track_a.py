"""Deterministic oracle computations for Track A CSV samples."""

from __future__ import annotations

import csv
import math
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from src.benchmarks.agent_validation.foundation import COSMOS2_DIR

TRACK_A_CSV_PATH = COSMOS2_DIR / "message.csv"
RELABEL_NAME_PATTERN = r"electrical|outlet|panel|box"


@dataclass(frozen=True)
class TrackARow:
    """Normalized row model for Track A CSV records."""

    id: int
    timestamp: float
    object_name: str
    object_description: str
    robot_x: float
    robot_y: float
    robot_z: float
    object_x: float
    object_y: float
    object_z: float
    confidence: float
    bbox_x_min: int
    bbox_y_min: int
    bbox_x_max: int
    bbox_y_max: int
    frame_id: str


def _parse_row(raw: dict[str, str]) -> TrackARow:
    return TrackARow(
        id=int(raw["id"]),
        timestamp=float(raw["timestamp"]),
        object_name=raw["object_name"],
        object_description=raw["object_description"],
        robot_x=float(raw["robot_x"]),
        robot_y=float(raw["robot_y"]),
        robot_z=float(raw["robot_z"]),
        object_x=float(raw["object_x"]),
        object_y=float(raw["object_y"]),
        object_z=float(raw["object_z"]),
        confidence=float(raw["confidence"]),
        bbox_x_min=int(raw["bbox_x_min"]),
        bbox_y_min=int(raw["bbox_y_min"]),
        bbox_x_max=int(raw["bbox_x_max"]),
        bbox_y_max=int(raw["bbox_y_max"]),
        frame_id=raw["frame_id"],
    )


def load_track_a_rows(csv_path: Path = TRACK_A_CSV_PATH) -> list[TrackARow]:
    """Load and normalize Track A CSV rows into typed records."""

    with csv_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return [_parse_row(row) for row in reader]


def summarize_track_a(rows: list[TrackARow]) -> dict[str, Any]:
    """Return deterministic summary metrics for Track A rows."""

    timestamps = [row.timestamp for row in rows]
    confidences = [row.confidence for row in rows]
    invalid_bbox_count = sum(
        1
        for row in rows
        if not (
            row.bbox_x_min < row.bbox_x_max and row.bbox_y_min < row.bbox_y_max
        )
    )

    return {
        "row_count": len(rows),
        "timestamp_min": min(timestamps),
        "timestamp_max": max(timestamps),
        "confidence_min": min(confidences),
        "confidence_max": max(confidences),
        "invalid_bbox_count": invalid_bbox_count,
    }


def group_object_names_by_timestamp(rows: list[TrackARow]) -> dict[float, list[str]]:
    """Return timestamp -> ordered list of object names."""

    grouped: dict[float, list[str]] = {}
    for row in rows:
        grouped.setdefault(row.timestamp, []).append(row.object_name)
    return grouped


def distance_3d(row: TrackARow) -> float:
    """Euclidean distance between robot and object positions."""

    return math.dist(
        (row.robot_x, row.robot_y, row.robot_z),
        (row.object_x, row.object_y, row.object_z),
    )


def compute_spatial_extremes(rows: list[TrackARow]) -> dict[str, dict[str, Any]]:
    """Return nearest and farthest detection by robot->object distance."""

    nearest = min(rows, key=distance_3d)
    farthest = max(rows, key=distance_3d)

    return {
        "nearest": {
            "id": nearest.id,
            "object_name": nearest.object_name,
            "distance_3d": distance_3d(nearest),
        },
        "farthest": {
            "id": farthest.id,
            "object_name": farthest.object_name,
            "distance_3d": distance_3d(farthest),
        },
    }


def find_co_located_pairs(rows: list[TrackARow]) -> list[dict[str, Any]]:
    """Find rows that share timestamp, 3D position, and identical bounding box."""

    pairs: list[dict[str, Any]] = []
    for left_index in range(len(rows)):
        for right_index in range(left_index + 1, len(rows)):
            left = rows[left_index]
            right = rows[right_index]
            same_position = (
                left.object_x == right.object_x
                and left.object_y == right.object_y
                and left.object_z == right.object_z
            )
            same_bbox = (
                left.bbox_x_min == right.bbox_x_min
                and left.bbox_y_min == right.bbox_y_min
                and left.bbox_x_max == right.bbox_x_max
                and left.bbox_y_max == right.bbox_y_max
            )
            if left.timestamp == right.timestamp and same_position and same_bbox:
                pairs.append(
                    {
                        "timestamp": left.timestamp,
                        "left_id": left.id,
                        "left_object_name": left.object_name,
                        "right_id": right.id,
                        "right_object_name": right.object_name,
                    }
                )
    return pairs


def bbox_iou_inclusive_pixels(left: TrackARow, right: TrackARow) -> float:
    """Compute IoU using inclusive-pixel area (x2-x1+1, y2-y1+1)."""

    left_x1, left_y1 = left.bbox_x_min, left.bbox_y_min
    left_x2, left_y2 = left.bbox_x_max, left.bbox_y_max
    right_x1, right_y1 = right.bbox_x_min, right.bbox_y_min
    right_x2, right_y2 = right.bbox_x_max, right.bbox_y_max

    inter_x1 = max(left_x1, right_x1)
    inter_y1 = max(left_y1, right_y1)
    inter_x2 = min(left_x2, right_x2)
    inter_y2 = min(left_y2, right_y2)

    inter_w = max(0.0, inter_x2 - inter_x1 + 1.0)
    inter_h = max(0.0, inter_y2 - inter_y1 + 1.0)
    inter_area = inter_w * inter_h

    left_area = max(0.0, left_x2 - left_x1 + 1.0) * max(0.0, left_y2 - left_y1 + 1.0)
    right_area = max(0.0, right_x2 - right_x1 + 1.0) * max(
        0.0, right_y2 - right_y1 + 1.0
    )
    union_area = left_area + right_area - inter_area
    return inter_area / union_area if union_area else 0.0


def find_cross_timestamp_relabel_candidates(
    rows: list[TrackARow],
    object_name_pattern: str = RELABEL_NAME_PATTERN,
    max_object_distance_3d: float = 1.1,
    min_bbox_iou: float = 0.10,
) -> list[dict[str, Any]]:
    """Find likely relabel candidates across timestamps with evidence metrics."""

    name_pattern = re.compile(object_name_pattern, re.IGNORECASE)
    filtered = [row for row in rows if name_pattern.search(row.object_name)]

    candidates: list[dict[str, Any]] = []
    for source in filtered:
        for target in filtered:
            if source.timestamp >= target.timestamp:
                continue

            object_distance = math.dist(
                (source.object_x, source.object_y, source.object_z),
                (target.object_x, target.object_y, target.object_z),
            )
            iou = bbox_iou_inclusive_pixels(source, target)
            if object_distance <= max_object_distance_3d and iou >= min_bbox_iou:
                candidates.append(
                    {
                        "source_id": source.id,
                        "source_object_name": source.object_name,
                        "source_timestamp": source.timestamp,
                        "target_id": target.id,
                        "target_object_name": target.object_name,
                        "target_timestamp": target.timestamp,
                        "object_distance_3d": object_distance,
                        "bbox_iou": iou,
                    }
                )

    return candidates

