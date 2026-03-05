from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass
from enum import IntEnum


class EventPhase(IntEnum):
    NORMAL = 0
    OCCLUDE = 1
    WINDOW_OPEN = 2
    DISPATCH = 3


@dataclass
class ScriptedEvent:
    phase: EventPhase
    camera_id: str
    zone_id: str
    severity: int
    confidence: float
    description: str
    affected_asset_ids: list[str]
    duration_s: float


@dataclass
class DemoScript:
    events: list[tuple[float, ScriptedEvent]]
    loop: bool = True


PHASE_NAMES: dict[EventPhase, str] = {
    EventPhase.NORMAL: "normal",
    EventPhase.OCCLUDE: "occlude",
    EventPhase.WINDOW_OPEN: "window_open",
    EventPhase.DISPATCH: "dispatch",
}


DEFAULT_DEMO_SCRIPT = DemoScript(
    events=[
        (
            0.0,
            ScriptedEvent(
                phase=EventPhase.NORMAL,
                camera_id="cam3",
                zone_id="shelf_zone",
                severity=0,
                confidence=0.0,
                description="All cameras clear — normal operation",
                affected_asset_ids=[],
                duration_s=0.0,
            ),
        ),
        (
            10.0,
            ScriptedEvent(
                phase=EventPhase.OCCLUDE,
                camera_id="cam3",
                zone_id="shelf_zone",
                severity=2,
                confidence=0.92,
                description="Forklift occluding cam3 shelf zone view",
                affected_asset_ids=["forklift_01"],
                duration_s=8.0,
            ),
        ),
        (
            18.0,
            ScriptedEvent(
                phase=EventPhase.WINDOW_OPEN,
                camera_id="cam3",
                zone_id="shelf_zone",
                severity=1,
                confidence=0.65,
                description="Cam3 partially recovered — reduced visibility",
                affected_asset_ids=["forklift_01"],
                duration_s=6.0,
            ),
        ),
        (
            24.0,
            ScriptedEvent(
                phase=EventPhase.DISPATCH,
                camera_id="cam3",
                zone_id="shelf_zone",
                severity=0,
                confidence=0.3,
                description="Robot dispatched to investigate — blindspot resolving",
                affected_asset_ids=[],
                duration_s=10.0,
            ),
        ),
    ],
    loop=True,
)


def _seconds_to_time_dict(seconds: float) -> dict[str, int]:
    sec = int(seconds)
    nanosec = int((seconds - sec) * 1_000_000_000)
    return {"sec": sec, "nanosec": nanosec}


def _script_total_duration(script: DemoScript) -> float:
    if not script.events:
        return 0.0
    last_delay, last_event = script.events[-1]
    return max(0.0, float(last_delay) + float(last_event.duration_s))


def create_blindspot_event(event: ScriptedEvent, now_s: float) -> dict:
    timestamp = _seconds_to_time_dict(float(now_s))
    return {
        "header": {
            "stamp": timestamp,
            "frame_id": event.camera_id,
        },
        "event_id": str(uuid.uuid4()),
        "camera_id": event.camera_id,
        "zone_id": event.zone_id,
        "severity": int(event.severity),
        "confidence": max(0.0, min(1.0, float(event.confidence))),
        "description": event.description,
        "affected_asset_ids": list(event.affected_asset_ids),
        "timestamp_detected": timestamp,
        "duration_s": max(0.0, float(event.duration_s)),
    }


def get_current_phase(elapsed_s: float, script: DemoScript) -> tuple[EventPhase, ScriptedEvent | None]:
    if not script.events:
        return (EventPhase.NORMAL, None)

    elapsed = max(0.0, float(elapsed_s))
    total_duration = _script_total_duration(script)

    if script.loop and total_duration > 0.0:
        elapsed = elapsed % total_duration

    selected_event: ScriptedEvent | None = None
    selected_phase = EventPhase.NORMAL
    for delay_s, scripted_event in script.events:
        if elapsed >= float(delay_s):
            selected_event = scripted_event
            selected_phase = scripted_event.phase
        else:
            break

    if selected_event is None:
        first_event = script.events[0][1]
        return (first_event.phase, first_event)

    return (selected_phase, selected_event)


def script_to_json(script: DemoScript) -> str:
    payload = {
        "loop": bool(script.loop),
        "events": [
            {
                "delay_s": float(delay_s),
                "event": {
                    **asdict(event),
                    "phase": int(event.phase),
                },
            }
            for delay_s, event in script.events
        ],
    }
    return json.dumps(payload, sort_keys=True)


def create_manual_event(
    camera_id: str,
    zone_id: str,
    severity: int,
    description: str,
    affected_assets: list[str],
    duration_s: float,
) -> ScriptedEvent:
    return ScriptedEvent(
        phase=EventPhase.OCCLUDE,
        camera_id=camera_id,
        zone_id=zone_id,
        severity=int(severity),
        confidence=1.0,
        description=description,
        affected_asset_ids=list(affected_assets),
        duration_s=max(0.0, float(duration_s)),
    )
