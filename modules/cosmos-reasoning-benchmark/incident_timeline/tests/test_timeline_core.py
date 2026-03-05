import json
import time

from sras_incident_timeline.timeline_core import (
    SeverityLevel,
    Timeline,
    TimelineEvent,
    TimelineEventType,
    blindspot_to_event,
    task_status_to_event,
)


def _event(
    event_id: str,
    event_type: TimelineEventType = TimelineEventType.BLINDSPOT,
    severity: SeverityLevel = SeverityLevel.LOW,
    timestamp_s: float | None = None,
) -> TimelineEvent:
    return TimelineEvent(
        event_id=event_id,
        event_type=event_type,
        severity=severity,
        timestamp_s=time.time() if timestamp_s is None else timestamp_s,
        title="event",
        description="desc",
    )


def test_add_event_and_retrieve() -> None:
    timeline = Timeline(max_events=10)
    timeline.add_event(_event("e1"))
    events = timeline.get_events(limit=5)

    assert len(events) == 1
    assert events[0].event_id == "e1"


def test_max_events_trimming() -> None:
    timeline = Timeline(max_events=2)
    timeline.add_event(_event("e1"))
    timeline.add_event(_event("e2"))
    timeline.add_event(_event("e3"))

    events = timeline.get_events(limit=10)
    assert [event.event_id for event in events] == ["e2", "e3"]


def test_filter_by_event_type() -> None:
    timeline = Timeline(max_events=10)
    timeline.add_event(_event("b1", TimelineEventType.BLINDSPOT))
    timeline.add_event(_event("r1", TimelineEventType.RISK_ASSESSMENT))

    events = timeline.get_events(limit=10, event_type=TimelineEventType.RISK_ASSESSMENT)
    assert len(events) == 1
    assert events[0].event_id == "r1"


def test_filter_by_severity() -> None:
    timeline = Timeline(max_events=10)
    timeline.add_event(_event("low", severity=SeverityLevel.LOW))
    timeline.add_event(_event("high", severity=SeverityLevel.HIGH))

    events = timeline.get_events(limit=10, min_severity=SeverityLevel.HIGH)
    assert len(events) == 1
    assert events[0].event_id == "high"


def test_filter_by_since() -> None:
    timeline = Timeline(max_events=10)
    t0 = time.time()
    timeline.add_event(_event("old", timestamp_s=t0 - 100))
    timeline.add_event(_event("new", timestamp_s=t0 + 1))

    events = timeline.get_events(limit=10, since_s=t0)
    assert len(events) == 1
    assert events[0].event_id == "new"


def test_system_status_nominal() -> None:
    timeline = Timeline(max_events=10)
    timeline.add_event(_event("e1", severity=SeverityLevel.MEDIUM))

    status = timeline.get_status()
    assert status.system_health == "nominal"
    assert status.active_incidents == 0


def test_system_status_degraded() -> None:
    timeline = Timeline(max_events=10)
    timeline.add_event(_event("e1", severity=SeverityLevel.HIGH, timestamp_s=time.time()))

    status = timeline.get_status()
    assert status.system_health == "degraded"
    assert status.active_incidents == 1


def test_blindspot_to_event() -> None:
    event = blindspot_to_event(
        {
            "event_id": "blind-1",
            "zone_id": "zone-a",
            "severity": 3,
            "event_type": "camera_blocked",
            "description": "Camera is blocked.",
            "source_cameras": ["cam_1"],
            "affected_assets": ["rack_1"],
            "timestamp_detected": 123.0,
        }
    )

    assert event.event_id == "blind-1"
    assert event.event_type == TimelineEventType.BLINDSPOT
    assert event.severity == SeverityLevel.CRITICAL
    assert event.zone_id == "zone-a"


def test_task_status_to_event() -> None:
    event = task_status_to_event(
        {
            "task_id": "task-1",
            "status": 3,
            "progress_pct": 42.0,
            "status_message": "Investigating shelf.",
            "timestamp_updated": 234.0,
        }
    )

    assert event.event_type == TimelineEventType.TASK_STATUS
    assert event.related_task_id == "task-1"
    assert event.details["status_label"] == "ACTIVE"
    assert event.details["progress_pct"] == 42.0


def test_timeline_to_json() -> None:
    timeline = Timeline(max_events=10)
    timeline.add_event(_event("e1", severity=SeverityLevel.HIGH))

    payload = json.loads(timeline.to_json(limit=10))
    assert "timeline" in payload
    assert "status" in payload
    assert payload["timeline"][0]["event_id"] == "e1"
