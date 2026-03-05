from uuid import UUID

from sras_event_injector.injector_core import (
    DEFAULT_DEMO_SCRIPT,
    DemoScript,
    EventPhase,
    ScriptedEvent,
    create_blindspot_event,
    create_manual_event,
    get_current_phase,
)


def test_default_demo_script_has_4_events() -> None:
    assert len(DEFAULT_DEMO_SCRIPT.events) == 4


def test_get_current_phase_normal_at_start() -> None:
    phase, event = get_current_phase(elapsed_s=0.0, script=DEFAULT_DEMO_SCRIPT)
    assert phase == EventPhase.NORMAL
    assert event is not None
    assert event.camera_id == "cam3"


def test_get_current_phase_occlude() -> None:
    phase, event = get_current_phase(elapsed_s=10.0, script=DEFAULT_DEMO_SCRIPT)
    assert phase == EventPhase.OCCLUDE
    assert event is not None
    assert event.severity == 2


def test_get_current_phase_window_open() -> None:
    phase, event = get_current_phase(elapsed_s=18.0, script=DEFAULT_DEMO_SCRIPT)
    assert phase == EventPhase.WINDOW_OPEN
    assert event is not None
    assert event.severity == 1


def test_get_current_phase_dispatch() -> None:
    phase, event = get_current_phase(elapsed_s=24.0, script=DEFAULT_DEMO_SCRIPT)
    assert phase == EventPhase.DISPATCH
    assert event is not None
    assert event.duration_s == 10.0


def test_get_current_phase_loops() -> None:
    looping_script = DemoScript(events=DEFAULT_DEMO_SCRIPT.events, loop=True)
    phase, event = get_current_phase(elapsed_s=35.0, script=looping_script)

    assert phase == EventPhase.NORMAL
    assert event is not None
    assert event.phase == EventPhase.NORMAL


def test_create_blindspot_event_fields() -> None:
    scripted = ScriptedEvent(
        phase=EventPhase.OCCLUDE,
        camera_id="cam9",
        zone_id="dock",
        severity=3,
        confidence=0.95,
        description="Occlusion event",
        affected_asset_ids=["forklift_09"],
        duration_s=4.5,
    )

    event = create_blindspot_event(scripted, now_s=123.25)

    assert event["camera_id"] == "cam9"
    assert event["zone_id"] == "dock"
    assert event["severity"] == 3
    assert event["confidence"] == 0.95
    assert event["description"] == "Occlusion event"
    assert event["affected_asset_ids"] == ["forklift_09"]
    assert event["duration_s"] == 4.5
    assert event["timestamp_detected"] == {"sec": 123, "nanosec": 250000000}
    UUID(event["event_id"])


def test_create_manual_event() -> None:
    event = create_manual_event(
        camera_id="cam3",
        zone_id="shelf_zone",
        severity=2,
        description="manual",
        affected_assets=["forklift_01"],
        duration_s=8.0,
    )

    assert event.phase == EventPhase.OCCLUDE
    assert event.camera_id == "cam3"
    assert event.zone_id == "shelf_zone"
    assert event.severity == 2
    assert event.description == "manual"
    assert event.affected_asset_ids == ["forklift_01"]
    assert event.duration_s == 8.0
