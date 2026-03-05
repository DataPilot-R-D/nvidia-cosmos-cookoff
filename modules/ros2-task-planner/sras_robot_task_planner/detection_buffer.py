"""Rolling-window detection buffer with scene state tracking and change detection.

No ROS imports — transport-agnostic module for unit testing.
"""

from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any, Callable


@dataclass(frozen=True)
class DetectedObject:
    class_name: str
    x: float
    y: float
    z: float
    score: float
    reprojection_error_px: float
    timestamp_s: float


@dataclass(frozen=True)
class SceneSnapshot:
    timestamp_s: float
    frame_id: str
    detections: tuple[DetectedObject, ...]


@dataclass(frozen=True)
class SceneChange:
    change_type: str
    class_name: str
    details: dict[str, Any]
    timestamp_s: float


@dataclass(frozen=True)
class SceneSummary:
    class_counts: dict[str, int]
    class_positions: dict[str, dict[str, float]]
    changes: tuple[SceneChange, ...]
    buffer_duration_s: float
    snapshot_count: int
    latest_timestamp_s: float


class DetectionBuffer:
    """Rolling window buffer over triangulated detection snapshots."""

    def __init__(
        self,
        window_s: float = 10.0,
        position_shift_threshold_m: float = 1.5,
        sustained_presence_min_frames: int = 3,
        now_fn: Callable[[], float] | None = None,
    ) -> None:
        self._window_s = max(1.0, window_s)
        self._position_shift_threshold_m = position_shift_threshold_m
        self._sustained_presence_min_frames = max(1, sustained_presence_min_frames)
        self._now = now_fn or time.time
        self._snapshots: list[SceneSnapshot] = []
        self._sustained_fired: set[str] = set()
        self._prev_class_counts: dict[str, int] = {}
        self._prev_class_centroids: dict[str, tuple[float, float]] = {}

    def ingest(self, snapshot: SceneSnapshot) -> None:
        """Add a snapshot to the buffer and expire old entries."""
        self._snapshots.append(snapshot)
        self._expire()

    def detect_changes(self) -> list[SceneChange]:
        """Compare current state vs previous, return detected changes."""
        self._expire()
        if not self._snapshots:
            return []

        now_ts = self._snapshots[-1].timestamp_s
        curr_counts = self._current_class_counts()
        curr_centroids = self._current_class_centroids()
        changes: list[SceneChange] = []

        # new_class
        for cls in curr_counts:
            if cls not in self._prev_class_counts:
                changes.append(SceneChange(
                    change_type="new_class",
                    class_name=cls,
                    details={"count": curr_counts[cls]},
                    timestamp_s=now_ts,
                ))

        # class_disappeared — was in 3+ snapshots previously, absent from latest 2+
        for cls in self._prev_class_counts:
            if cls not in curr_counts:
                presence = self._class_presence_count(cls)
                absent_tail = self._class_absent_tail_count(cls)
                if presence >= 3 and absent_tail >= 2:
                    changes.append(SceneChange(
                        change_type="class_disappeared",
                        class_name=cls,
                        details={"last_count": self._prev_class_counts[cls]},
                        timestamp_s=now_ts,
                    ))

        # count_changed — stable across 2+ frames
        for cls in curr_counts:
            if cls in self._prev_class_counts and curr_counts[cls] != self._prev_class_counts[cls]:
                if self._count_stable_frames(cls, curr_counts[cls]) >= 2:
                    changes.append(SceneChange(
                        change_type="count_changed",
                        class_name=cls,
                        details={
                            "old_count": self._prev_class_counts[cls],
                            "new_count": curr_counts[cls],
                        },
                        timestamp_s=now_ts,
                    ))

        # position_shift
        for cls in curr_centroids:
            if cls in self._prev_class_centroids:
                ox, oy = self._prev_class_centroids[cls]
                nx, ny = curr_centroids[cls]
                dist = math.sqrt((nx - ox) ** 2 + (ny - oy) ** 2)
                if dist > self._position_shift_threshold_m:
                    changes.append(SceneChange(
                        change_type="position_shift",
                        class_name=cls,
                        details={"distance_m": round(dist, 3)},
                        timestamp_s=now_ts,
                    ))

        # sustained_presence — fires once
        for cls in curr_counts:
            if cls not in self._sustained_fired:
                consecutive = self._consecutive_presence_count(cls)
                if consecutive >= self._sustained_presence_min_frames:
                    changes.append(SceneChange(
                        change_type="sustained_presence",
                        class_name=cls,
                        details={"consecutive_frames": consecutive},
                        timestamp_s=now_ts,
                    ))
                    self._sustained_fired.add(cls)

        self._prev_class_counts = dict(curr_counts)
        self._prev_class_centroids = dict(curr_centroids)
        return changes

    def has_meaningful_changes(self) -> bool:
        """Peek whether detect_changes() *would* be non-empty, without consuming state."""
        self._expire()
        if not self._snapshots:
            return False

        curr_counts = self._current_class_counts()
        curr_centroids = self._current_class_centroids()

        # new_class
        for cls in curr_counts:
            if cls not in self._prev_class_counts:
                return True

        # class_disappeared
        for cls in self._prev_class_counts:
            if cls not in curr_counts:
                presence = self._class_presence_count(cls)
                absent_tail = self._class_absent_tail_count(cls)
                if presence >= 3 and absent_tail >= 2:
                    return True

        # count_changed
        for cls in curr_counts:
            if cls in self._prev_class_counts and curr_counts[cls] != self._prev_class_counts[cls]:
                if self._count_stable_frames(cls, curr_counts[cls]) >= 2:
                    return True

        # position_shift
        for cls in curr_centroids:
            if cls in self._prev_class_centroids:
                ox, oy = self._prev_class_centroids[cls]
                nx, ny = curr_centroids[cls]
                dist = math.sqrt((nx - ox) ** 2 + (ny - oy) ** 2)
                if dist > self._position_shift_threshold_m:
                    return True

        # sustained_presence
        for cls in curr_counts:
            if cls not in self._sustained_fired:
                consecutive = self._consecutive_presence_count(cls)
                if consecutive >= self._sustained_presence_min_frames:
                    return True

        return False

    def get_summary(self) -> SceneSummary:
        """Return an aggregated summary for Cosmos prompt building."""
        self._expire()
        if not self._snapshots:
            return SceneSummary(
                class_counts={},
                class_positions={},
                changes=(),
                buffer_duration_s=0.0,
                snapshot_count=0,
                latest_timestamp_s=0.0,
            )

        counts = self._current_class_counts()
        centroids = self._current_class_centroids()
        positions = {
            cls: {"x": round(xy[0], 3), "y": round(xy[1], 3)}
            for cls, xy in centroids.items()
        }
        earliest = self._snapshots[0].timestamp_s
        latest = self._snapshots[-1].timestamp_s

        return SceneSummary(
            class_counts=counts,
            class_positions=positions,
            changes=(),
            buffer_duration_s=latest - earliest,
            snapshot_count=len(self._snapshots),
            latest_timestamp_s=latest,
        )

    @staticmethod
    def parse_detection_msg(payload: dict[str, Any]) -> SceneSnapshot | None:
        """Parse a ``/triangulated/detections_json`` message payload.

        Supports both the live wire format from multicam_triangulator::

            {"timestamp": {"sec": .., "nanosec": ..}, "frame_id": "map",
             "detections": [{"class": "person", ...}]}

        and the ROS-style header format::

            {"header": {"stamp": {"sec": .., "nanosec": ..}, "frame_id": "map"},
             "detections": [{"class_name": "person", ...}]}
        """
        raw_detections = payload.get("detections")
        if not isinstance(raw_detections, list):
            return None

        # Parse timestamp and frame_id from either format
        header = payload.get("header")
        timestamp_obj = payload.get("timestamp")
        if isinstance(header, dict):
            stamp = header.get("stamp", {})
            sec = float(stamp.get("sec", 0))
            nsec = float(stamp.get("nanosec", 0))
            frame_id = str(header.get("frame_id", "map"))
        elif isinstance(timestamp_obj, dict):
            sec = float(timestamp_obj.get("sec", 0))
            nsec = float(timestamp_obj.get("nanosec", 0))
            frame_id = str(payload.get("frame_id", "map"))
        else:
            return None

        timestamp_s = sec + nsec / 1_000_000_000.0

        detections: list[DetectedObject] = []
        for det in raw_detections:
            if not isinstance(det, dict):
                continue
            pos = det.get("position", {})
            class_name = str(det.get("class") or det.get("class_name") or "unknown")
            detections.append(DetectedObject(
                class_name=class_name,
                x=float(pos.get("x", 0.0)),
                y=float(pos.get("y", 0.0)),
                z=float(pos.get("z", 0.0)),
                score=float(det.get("score", 0.0)),
                reprojection_error_px=float(det.get("reprojection_error_px", 0.0)),
                timestamp_s=timestamp_s,
            ))

        return SceneSnapshot(
            timestamp_s=timestamp_s,
            frame_id=frame_id,
            detections=tuple(detections),
        )

    # --- private helpers ---

    def _expire(self) -> None:
        # Use latest snapshot timestamp as reference (works with sim time).
        # Fall back to wall clock only when buffer is empty.
        if self._snapshots:
            now = self._snapshots[-1].timestamp_s
        else:
            now = self._now()
        cutoff = now - self._window_s
        self._snapshots = [s for s in self._snapshots if s.timestamp_s >= cutoff]

    def _current_class_counts(self) -> dict[str, int]:
        """Counts from the latest snapshot only."""
        if not self._snapshots:
            return {}
        latest = self._snapshots[-1]
        counts: dict[str, int] = {}
        for det in latest.detections:
            counts[det.class_name] = counts.get(det.class_name, 0) + 1
        return counts

    def _current_class_centroids(self) -> dict[str, tuple[float, float]]:
        """Centroid per class from the latest snapshot."""
        if not self._snapshots:
            return {}
        latest = self._snapshots[-1]
        sums: dict[str, list[float]] = {}
        for det in latest.detections:
            if det.class_name not in sums:
                sums[det.class_name] = [0.0, 0.0, 0]
            sums[det.class_name][0] += det.x
            sums[det.class_name][1] += det.y
            sums[det.class_name][2] += 1
        return {
            cls: (vals[0] / vals[2], vals[1] / vals[2])
            for cls, vals in sums.items()
            if vals[2] > 0
        }

    def _class_presence_count(self, class_name: str) -> int:
        """How many snapshots in the buffer contain this class."""
        return sum(
            1 for snap in self._snapshots
            if any(d.class_name == class_name for d in snap.detections)
        )

    def _class_absent_tail_count(self, class_name: str) -> int:
        """How many of the most recent snapshots are missing this class."""
        count = 0
        for snap in reversed(self._snapshots):
            if any(d.class_name == class_name for d in snap.detections):
                break
            count += 1
        return count

    def _count_stable_frames(self, class_name: str, target_count: int) -> int:
        """How many of the most recent snapshots have exactly target_count instances."""
        count = 0
        for snap in reversed(self._snapshots):
            n = sum(1 for d in snap.detections if d.class_name == class_name)
            if n == target_count:
                count += 1
            else:
                break
        return count

    def _consecutive_presence_count(self, class_name: str) -> int:
        """How many consecutive latest snapshots contain this class."""
        count = 0
        for snap in reversed(self._snapshots):
            if any(d.class_name == class_name for d in snap.detections):
                count += 1
            else:
                break
        return count
