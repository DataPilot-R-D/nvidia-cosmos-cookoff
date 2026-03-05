from __future__ import annotations

import json
import random
from dataclasses import dataclass, field
from enum import IntEnum
from typing import TypeVar


class OcclusionType(IntEnum):
    OBJECT_MOVED = 0
    LAYOUT_SHIFT = 1
    CAMERA_BLOCKED = 2
    LIGHTING_CHANGE = 3
    NEW_OBSTACLE = 4


@dataclass(frozen=True, slots=True)
class OcclusionEvent:
    event_id: str
    occlusion_type: OcclusionType
    zone_id: str
    camera_id: str
    severity: int
    description: str
    start_time_s: float
    duration_s: float
    affected_area_pct: float


@dataclass(slots=True)
class ScenarioConfig:
    scenario_id: str
    zone_ids: list[str]
    camera_ids: list[str]
    event_interval_s: float = 5.0
    max_concurrent_occlusions: int = 3
    severity_weights: dict[int, float] = field(default_factory=lambda: {0: 0.3, 1: 0.3, 2: 0.25, 3: 0.15})
    occlusion_type_weights: dict[OcclusionType, float] = field(
        default_factory=lambda: {
            OcclusionType.OBJECT_MOVED: 0.25,
            OcclusionType.LAYOUT_SHIFT: 0.2,
            OcclusionType.CAMERA_BLOCKED: 0.25,
            OcclusionType.LIGHTING_CHANGE: 0.15,
            OcclusionType.NEW_OBSTACLE: 0.15,
        }
    )


DEFAULT_SCENARIO = ScenarioConfig(
    scenario_id="default_dynamic_blindspot",
    zone_ids=["zone_a", "zone_b", "zone_c", "zone_d", "zone_e"],
    camera_ids=["cam_north", "cam_south", "cam_east", "cam_west"],
)


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _seconds_to_time_dict(seconds: float) -> dict[str, int]:
    sec = int(seconds)
    nanosec = int((seconds - sec) * 1_000_000_000)
    return {"sec": sec, "nanosec": nanosec}


T = TypeVar("T")


def _weighted_choice(rng: random.Random, weighted_items: dict[T, float]) -> T:
    if not weighted_items:
        raise ValueError("weighted_items cannot be empty")

    items = list(weighted_items.items())
    values = [item[0] for item in items]
    weights = [max(0.0, float(item[1])) for item in items]
    if sum(weights) <= 0.0:
        weights = [1.0] * len(values)
    return rng.choices(values, weights=weights, k=1)[0]


class DynamicBlindspotGenerator:
    def __init__(self, config: ScenarioConfig, seed: int | None = None):
        self.config = config
        self._rng = random.Random(seed)
        self._events: list[OcclusionEvent] = []
        self._event_counter = 0

    def generate_event(self, current_time_s: float) -> OcclusionEvent:
        occlusion_type = _weighted_choice(self._rng, self.config.occlusion_type_weights)
        severity = int(_weighted_choice(self._rng, self.config.severity_weights))

        zone_id = self._rng.choice(self.config.zone_ids)
        camera_id = self._rng.choice(self.config.camera_ids)

        duration_s = self._pick_duration_s(occlusion_type=occlusion_type, severity=severity)
        affected_area_pct = self._pick_affected_area_pct(occlusion_type=occlusion_type, severity=severity)

        self._event_counter += 1
        event = OcclusionEvent(
            event_id=f"occ_{self._event_counter:06d}",
            occlusion_type=occlusion_type,
            zone_id=zone_id,
            camera_id=camera_id,
            severity=severity,
            description=self._describe_event(occlusion_type, zone_id, camera_id, severity, affected_area_pct),
            start_time_s=float(current_time_s),
            duration_s=duration_s,
            affected_area_pct=affected_area_pct,
        )
        self._events.append(event)
        return event

    def generate_sequence(self, start_s: float, count: int) -> list[OcclusionEvent]:
        events: list[OcclusionEvent] = []
        for idx in range(max(0, int(count))):
            event_time = float(start_s) + idx * float(self.config.event_interval_s)
            events.append(self.generate_event(current_time_s=event_time))
        return events

    def active_occlusions(self, current_time_s: float) -> list[OcclusionEvent]:
        now = float(current_time_s)
        return [
            event
            for event in self._events
            if event.start_time_s <= now < (event.start_time_s + event.duration_s)
        ]

    def compute_coverage_impact(self, occlusions: list[OcclusionEvent]) -> dict[str, float]:
        impact = {zone_id: 0.0 for zone_id in self.config.zone_ids}
        for occlusion in occlusions:
            if occlusion.zone_id not in impact:
                impact[occlusion.zone_id] = 0.0
            impact[occlusion.zone_id] += float(occlusion.affected_area_pct)

        for zone_id in list(impact.keys()):
            impact[zone_id] = _clamp(impact[zone_id], 0.0, 100.0)
        return impact

    def reset(self) -> None:
        self._events.clear()
        self._event_counter = 0

    def _pick_duration_s(self, occlusion_type: OcclusionType, severity: int) -> float:
        duration_bands = {
            0: (4.0, 8.0),
            1: (6.0, 12.0),
            2: (10.0, 18.0),
            3: (15.0, 30.0),
        }
        low, high = duration_bands.get(int(severity), (5.0, 12.0))

        if occlusion_type == OcclusionType.LIGHTING_CHANGE:
            high *= 0.75
        elif occlusion_type == OcclusionType.LAYOUT_SHIFT:
            high *= 1.15

        return round(self._rng.uniform(low, high), 3)

    def _pick_affected_area_pct(self, occlusion_type: OcclusionType, severity: int) -> float:
        area_bands = {
            0: (5.0, 25.0),
            1: (15.0, 45.0),
            2: (35.0, 70.0),
            3: (60.0, 95.0),
        }
        low, high = area_bands.get(int(severity), (10.0, 40.0))

        if occlusion_type == OcclusionType.CAMERA_BLOCKED:
            low = max(low, 55.0)
            high = min(100.0, high + 10.0)
        elif occlusion_type == OcclusionType.LIGHTING_CHANGE:
            low *= 0.7
            high *= 0.8

        return round(_clamp(self._rng.uniform(low, high), 0.0, 100.0), 3)

    def _describe_event(
        self,
        occlusion_type: OcclusionType,
        zone_id: str,
        camera_id: str,
        severity: int,
        affected_area_pct: float,
    ) -> str:
        type_descriptions = {
            OcclusionType.OBJECT_MOVED: "object moved into view",
            OcclusionType.LAYOUT_SHIFT: "layout shift changed sightline",
            OcclusionType.CAMERA_BLOCKED: "camera lens partially blocked",
            OcclusionType.LIGHTING_CHANGE: "lighting change reduced contrast",
            OcclusionType.NEW_OBSTACLE: "new obstacle introduced",
        }
        text = type_descriptions.get(occlusion_type, "visibility change")
        return (
            f"{text} for {camera_id} in {zone_id} "
            f"(severity={severity}, affected_area_pct={affected_area_pct:.1f})"
        )


def occlusion_to_blindspot_event(occlusion: OcclusionEvent) -> dict:
    timestamp = _seconds_to_time_dict(float(occlusion.start_time_s))
    return {
        "header": {
            "stamp": timestamp,
            "frame_id": occlusion.camera_id,
        },
        "event_id": occlusion.event_id,
        "camera_id": occlusion.camera_id,
        "zone_id": occlusion.zone_id,
        "severity": int(_clamp(occlusion.severity, 0, 3)),
        "confidence": float(_clamp(occlusion.affected_area_pct / 100.0, 0.0, 1.0)),
        "description": occlusion.description,
        "affected_asset_ids": [],
        "timestamp_detected": timestamp,
        "duration_s": max(0.0, float(occlusion.duration_s)),
    }


def occlusion_to_dict(occlusion: OcclusionEvent) -> dict:
    return {
        "event_id": occlusion.event_id,
        "occlusion_type": int(occlusion.occlusion_type),
        "occlusion_type_name": occlusion.occlusion_type.name,
        "zone_id": occlusion.zone_id,
        "camera_id": occlusion.camera_id,
        "severity": int(occlusion.severity),
        "description": occlusion.description,
        "start_time_s": float(occlusion.start_time_s),
        "duration_s": float(occlusion.duration_s),
        "affected_area_pct": float(occlusion.affected_area_pct),
    }


def coverage_impact_to_json(impact: dict[str, float]) -> str:
    clean_impact = {str(zone_id): float(_clamp(value, 0.0, 100.0)) for zone_id, value in impact.items()}
    return json.dumps(clean_impact, sort_keys=True)
