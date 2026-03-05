"""Deterministic oracle computations for Track B SQLite + BLOB samples."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import hashlib
from pathlib import Path
import sqlite3
from typing import Any

from src.benchmarks.agent_validation.foundation import COSMOS2_DIR

TRACK_B_DB_PATH = COSMOS2_DIR / "objects.db"


@dataclass(frozen=True)
class TrackBRow:
    """Normalized row model for Track B database records."""

    id: int
    timestamp: float
    object_name: str
    camera_frame_jpeg: bytes | None


def load_track_b_rows(db_path: Path = TRACK_B_DB_PATH) -> list[TrackBRow]:
    """Load Track B detections needed for deterministic oracle checks."""

    with sqlite3.connect(db_path) as connection:
        cursor = connection.execute(
            """
            SELECT id, timestamp, object_name, camera_frame_jpeg
            FROM detections
            ORDER BY id
            """
        )
        return [
            TrackBRow(
                id=int(row[0]),
                timestamp=float(row[1]),
                object_name=str(row[2]),
                camera_frame_jpeg=row[3],
            )
            for row in cursor.fetchall()
        ]


def summarize_track_b(rows: list[TrackBRow]) -> dict[str, Any]:
    """Return deterministic summary metrics for Track B rows."""

    timestamps = [row.timestamp for row in rows]
    object_names = {row.object_name for row in rows}
    blobs = [row.camera_frame_jpeg for row in rows if row.camera_frame_jpeg is not None]
    blob_lengths = [len(blob) for blob in blobs]

    return {
        "row_count": len(rows),
        "distinct_object_names": len(object_names),
        "distinct_timestamps": len({row.timestamp for row in rows}),
        "timestamp_min": min(timestamps),
        "timestamp_max": max(timestamps),
        "rows_with_blob": len(blobs),
        "blob_len_min": min(blob_lengths),
        "blob_len_max": max(blob_lengths),
    }


def _frame_hash(blob: bytes | None) -> str:
    if blob is None:
        return ""
    return hashlib.sha256(blob).hexdigest()


def _group_rows_by_frame_hash(rows: list[TrackBRow]) -> dict[str, list[TrackBRow]]:
    groups: dict[str, list[TrackBRow]] = defaultdict(list)
    for row in rows:
        groups[_frame_hash(row.camera_frame_jpeg)].append(row)
    return groups


def validate_timestamp_frame_hash_consistency(
    rows: list[TrackBRow],
) -> dict[str, Any]:
    """Validate timestamp->hash uniqueness and hash-cluster row counts."""

    hashes_by_timestamp: dict[float, set[str]] = defaultdict(set)
    for row in rows:
        hashes_by_timestamp[row.timestamp].add(_frame_hash(row.camera_frame_jpeg))

    hash_groups = _group_rows_by_frame_hash(rows)
    return {
        "each_timestamp_single_hash": all(
            len(unique_hashes) == 1 for unique_hashes in hashes_by_timestamp.values()
        ),
        "unique_frame_hashes": len(hash_groups),
        "hash_group_row_counts": sorted(len(group_rows) for group_rows in hash_groups.values()),
    }


def find_largest_scene_cluster(rows: list[TrackBRow]) -> dict[str, Any]:
    """Return the largest same-frame cluster with timestamp and object list."""

    hash_groups = _group_rows_by_frame_hash(rows)
    ordered_groups = sorted(
        hash_groups.values(),
        key=lambda group_rows: (
            -len(group_rows),
            min(row.timestamp for row in group_rows),
        ),
    )
    largest = ordered_groups[0]
    return {
        "timestamp": largest[0].timestamp,
        "size": len(largest),
        "object_names": [row.object_name for row in largest],
    }


def compute_object_persistence(rows: list[TrackBRow]) -> dict[str, int]:
    """Return object_name -> number of distinct timestamps present."""

    timestamps_by_name: dict[str, set[float]] = defaultdict(set)
    for row in rows:
        timestamps_by_name[row.object_name].add(row.timestamp)

    return {
        object_name: len(unique_timestamps)
        for object_name, unique_timestamps in timestamps_by_name.items()
    }

