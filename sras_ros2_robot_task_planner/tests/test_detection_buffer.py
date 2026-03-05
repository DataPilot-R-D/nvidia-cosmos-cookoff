"""Tests for detection_buffer — TDD RED phase."""

import pytest

from sras_robot_task_planner.detection_buffer import (
    DetectedObject,
    DetectionBuffer,
    SceneChange,
    SceneSnapshot,
    SceneSummary,
)


class FakeClock:
    def __init__(self, start: float = 0.0) -> None:
        self.now = start

    def advance(self, delta: float) -> None:
        self.now += delta

    def __call__(self) -> float:
        return self.now


def _obj(
    class_name: str = "person",
    x: float = 1.0,
    y: float = 2.0,
    z: float = 0.0,
    score: float = 0.9,
    reprojection_error_px: float = 5.0,
    timestamp_s: float = 100.0,
) -> DetectedObject:
    return DetectedObject(
        class_name=class_name,
        x=x,
        y=y,
        z=z,
        score=score,
        reprojection_error_px=reprojection_error_px,
        timestamp_s=timestamp_s,
    )


def _snapshot(
    detections: tuple[DetectedObject, ...],
    timestamp_s: float = 100.0,
    frame_id: str = "map",
) -> SceneSnapshot:
    return SceneSnapshot(
        timestamp_s=timestamp_s,
        frame_id=frame_id,
        detections=detections,
    )


class TestDetectedObjectIsFrozen:
    def test_cannot_mutate(self) -> None:
        obj = _obj()
        with pytest.raises(AttributeError):
            obj.x = 99.0  # type: ignore[misc]


class TestSceneSnapshotIsFrozen:
    def test_cannot_mutate(self) -> None:
        snap = _snapshot(())
        with pytest.raises(AttributeError):
            snap.frame_id = "odom"  # type: ignore[misc]


class TestDetectionBufferIngest:
    def test_single_snapshot(self) -> None:
        clock = FakeClock(100.0)
        buf = DetectionBuffer(window_s=10.0, now_fn=clock)
        snap = _snapshot((_obj(),), timestamp_s=100.0)
        buf.ingest(snap)
        summary = buf.get_summary()
        assert summary.snapshot_count == 1
        assert summary.class_counts == {"person": 1}

    def test_old_snapshots_expire(self) -> None:
        clock = FakeClock(100.0)
        buf = DetectionBuffer(window_s=5.0, now_fn=clock)
        buf.ingest(_snapshot((_obj(),), timestamp_s=100.0))
        clock.advance(6.0)
        buf.ingest(_snapshot((), timestamp_s=106.0))
        summary = buf.get_summary()
        assert summary.snapshot_count == 1
        assert summary.class_counts == {}

    def test_multiple_classes(self) -> None:
        clock = FakeClock(100.0)
        buf = DetectionBuffer(window_s=10.0, now_fn=clock)
        snap = _snapshot((
            _obj(class_name="person", x=1.0),
            _obj(class_name="person", x=2.0),
            _obj(class_name="backpack", x=3.0),
        ), timestamp_s=100.0)
        buf.ingest(snap)
        summary = buf.get_summary()
        assert summary.class_counts == {"person": 2, "backpack": 1}


class TestChangeDetection:
    def test_new_class_detected(self) -> None:
        clock = FakeClock(100.0)
        buf = DetectionBuffer(window_s=10.0, now_fn=clock)
        buf.ingest(_snapshot((), timestamp_s=100.0))
        clock.advance(1.0)
        buf.ingest(_snapshot((_obj(class_name="person"),), timestamp_s=101.0))
        changes = buf.detect_changes()
        assert any(c.change_type == "new_class" and c.class_name == "person" for c in changes)

    def test_class_disappeared(self) -> None:
        clock = FakeClock(100.0)
        buf = DetectionBuffer(
            window_s=10.0,
            now_fn=clock,
        )
        for t in range(3):
            buf.ingest(_snapshot(
                (_obj(class_name="person"),),
                timestamp_s=100.0 + t,
            ))
            clock.advance(1.0)

        # Establish previous state
        buf.detect_changes()

        # Now 2 frames without person
        for t in range(2):
            buf.ingest(_snapshot((), timestamp_s=103.0 + t))
            clock.advance(1.0)

        changes = buf.detect_changes()
        assert any(
            c.change_type == "class_disappeared" and c.class_name == "person"
            for c in changes
        )

    def test_count_changed(self) -> None:
        clock = FakeClock(100.0)
        buf = DetectionBuffer(window_s=10.0, now_fn=clock)
        # 2 frames with 1 person
        for t in range(2):
            buf.ingest(_snapshot(
                (_obj(class_name="person"),),
                timestamp_s=100.0 + t,
            ))
            clock.advance(1.0)

        # Establish previous state with count=1
        buf.detect_changes()

        # 2 frames with 2 persons
        for t in range(2):
            buf.ingest(_snapshot((
                _obj(class_name="person", x=1.0),
                _obj(class_name="person", x=3.0),
            ), timestamp_s=102.0 + t))
            clock.advance(1.0)

        changes = buf.detect_changes()
        assert any(
            c.change_type == "count_changed" and c.class_name == "person"
            for c in changes
        )

    def test_position_shift(self) -> None:
        clock = FakeClock(100.0)
        buf = DetectionBuffer(
            window_s=10.0,
            position_shift_threshold_m=1.0,
            now_fn=clock,
        )
        buf.ingest(_snapshot(
            (_obj(class_name="person", x=0.0, y=0.0),),
            timestamp_s=100.0,
        ))
        # Establish previous centroid at (0, 0)
        buf.detect_changes()

        clock.advance(1.0)
        buf.ingest(_snapshot(
            (_obj(class_name="person", x=5.0, y=5.0),),
            timestamp_s=101.0,
        ))
        changes = buf.detect_changes()
        assert any(
            c.change_type == "position_shift" and c.class_name == "person"
            for c in changes
        )

    def test_sustained_presence(self) -> None:
        clock = FakeClock(100.0)
        buf = DetectionBuffer(
            window_s=10.0,
            sustained_presence_min_frames=3,
            now_fn=clock,
        )
        for t in range(3):
            buf.ingest(_snapshot(
                (_obj(class_name="person"),),
                timestamp_s=100.0 + t,
            ))
            clock.advance(1.0)

        changes = buf.detect_changes()
        assert any(
            c.change_type == "sustained_presence" and c.class_name == "person"
            for c in changes
        )

    def test_sustained_presence_fires_once(self) -> None:
        clock = FakeClock(100.0)
        buf = DetectionBuffer(
            window_s=10.0,
            sustained_presence_min_frames=2,
            now_fn=clock,
        )
        for t in range(4):
            buf.ingest(_snapshot(
                (_obj(class_name="person"),),
                timestamp_s=100.0 + t,
            ))
            clock.advance(1.0)

        changes1 = buf.detect_changes()
        sustained_count = sum(
            1 for c in changes1
            if c.change_type == "sustained_presence" and c.class_name == "person"
        )
        assert sustained_count == 1

        # Second call should not re-fire sustained_presence for same class
        clock.advance(1.0)
        buf.ingest(_snapshot(
            (_obj(class_name="person"),),
            timestamp_s=105.0,
        ))
        changes2 = buf.detect_changes()
        sustained_again = [
            c for c in changes2
            if c.change_type == "sustained_presence" and c.class_name == "person"
        ]
        assert len(sustained_again) == 0

    def test_no_changes_on_stable_scene(self) -> None:
        clock = FakeClock(100.0)
        buf = DetectionBuffer(window_s=10.0, now_fn=clock)
        for t in range(5):
            buf.ingest(_snapshot(
                (_obj(class_name="person", x=1.0, y=2.0),),
                timestamp_s=100.0 + t,
            ))
            clock.advance(1.0)
        # After initial sustained_presence fires, clear it
        buf.detect_changes()

        clock.advance(1.0)
        buf.ingest(_snapshot(
            (_obj(class_name="person", x=1.0, y=2.0),),
            timestamp_s=106.0,
        ))
        changes = buf.detect_changes()
        assert len(changes) == 0

    def test_has_meaningful_changes(self) -> None:
        clock = FakeClock(100.0)
        buf = DetectionBuffer(window_s=10.0, now_fn=clock)
        buf.ingest(_snapshot((), timestamp_s=100.0))
        assert buf.has_meaningful_changes() is False

        clock.advance(1.0)
        buf.ingest(_snapshot((_obj(class_name="person"),), timestamp_s=101.0))
        assert buf.has_meaningful_changes() is True


class TestGetSummary:
    def test_summary_fields(self) -> None:
        clock = FakeClock(100.0)
        buf = DetectionBuffer(window_s=10.0, now_fn=clock)
        buf.ingest(_snapshot(
            (_obj(class_name="person", x=1.0, y=2.0),),
            timestamp_s=100.0,
        ))
        clock.advance(1.0)
        buf.ingest(_snapshot(
            (_obj(class_name="person", x=1.5, y=2.5),),
            timestamp_s=101.0,
        ))

        summary = buf.get_summary()
        assert isinstance(summary, SceneSummary)
        assert summary.class_counts == {"person": 1}
        assert "person" in summary.class_positions
        assert summary.snapshot_count == 2
        assert summary.latest_timestamp_s == 101.0
        assert summary.buffer_duration_s == pytest.approx(1.0)

    def test_empty_buffer_summary(self) -> None:
        clock = FakeClock(100.0)
        buf = DetectionBuffer(window_s=10.0, now_fn=clock)
        summary = buf.get_summary()
        assert summary.snapshot_count == 0
        assert summary.class_counts == {}
        assert summary.latest_timestamp_s == 0.0


class TestParseDetectionMsg:
    def test_parses_valid_payload(self) -> None:
        payload = {
            "header": {"stamp": {"sec": 100, "nanosec": 500000000}, "frame_id": "map"},
            "detections": [
                {
                    "class_name": "person",
                    "position": {"x": 1.0, "y": 2.0, "z": 0.0},
                    "score": 0.85,
                    "reprojection_error_px": 4.5,
                },
                {
                    "class_name": "backpack",
                    "position": {"x": 3.0, "y": 4.0, "z": 0.0},
                    "score": 0.72,
                    "reprojection_error_px": 8.1,
                },
            ],
        }
        snap = DetectionBuffer.parse_detection_msg(payload)
        assert snap.frame_id == "map"
        assert snap.timestamp_s == pytest.approx(100.5)
        assert len(snap.detections) == 2
        assert snap.detections[0].class_name == "person"
        assert snap.detections[1].class_name == "backpack"

    def test_parses_empty_detections(self) -> None:
        payload = {
            "header": {"stamp": {"sec": 50, "nanosec": 0}, "frame_id": "odom"},
            "detections": [],
        }
        snap = DetectionBuffer.parse_detection_msg(payload)
        assert snap.frame_id == "odom"
        assert len(snap.detections) == 0

    def test_parses_live_wire_format(self) -> None:
        """Matches the actual multicam_triangulator JSON output."""
        payload = {
            "timestamp": {"sec": 100, "nanosec": 500000000},
            "frame_id": "map",
            "detections": [
                {
                    "class": "person",
                    "position": {"x": 1.0, "y": 2.0, "z": 0.0},
                    "score": 0.85,
                    "reprojection_error_px": 4.5,
                },
            ],
        }
        snap = DetectionBuffer.parse_detection_msg(payload)
        assert snap is not None
        assert snap.frame_id == "map"
        assert snap.timestamp_s == pytest.approx(100.5)
        assert len(snap.detections) == 1
        assert snap.detections[0].class_name == "person"
        assert snap.detections[0].x == 1.0

    def test_returns_none_for_invalid_payload(self) -> None:
        assert DetectionBuffer.parse_detection_msg({}) is None
        assert DetectionBuffer.parse_detection_msg({"detections": "bad"}) is None
