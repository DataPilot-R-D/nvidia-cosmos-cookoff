from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from enum import IntEnum
from typing import Any


class TimelineEventType(IntEnum):
    BLINDSPOT = 0
    RISK_ASSESSMENT = 1
    TASK_STATUS = 2
    OPERATOR_ALERT = 3
    TASK_REQUEST = 4
    SYSTEM_STATUS = 5


class SeverityLevel(IntEnum):
    LOW = 0
    MEDIUM = 1
    HIGH = 2
    CRITICAL = 3


_TASK_STATUS_LABELS = {
    0: "QUEUED",
    1: "APPROVED",
    2: "DISPATCHED",
    3: "ACTIVE",
    4: "PAUSED",
    5: "COMPLETED",
    6: "FAILED",
    7: "CANCELED",
    8: "TIMED_OUT",
}
_INACTIVE_TASK_STATUS = {"COMPLETED", "FAILED", "CANCELED", "TIMED_OUT"}


@dataclass(frozen=True, slots=True)
class TimelineEvent:
    event_id: str
    event_type: TimelineEventType
    severity: SeverityLevel
    timestamp_s: float
    title: str
    description: str
    details: dict[str, Any] = field(default_factory=dict)
    related_task_id: str = ""
    zone_id: str = ""


@dataclass(slots=True)
class SystemStatus:
    timestamp_s: float
    total_events: int
    active_incidents: int
    active_tasks: int
    system_health: str
    latest_severity: SeverityLevel


class Timeline:
    def __init__(self, max_events: int = 500) -> None:
        self.max_events = max(1, int(max_events))
        self._events: list[TimelineEvent] = []

    def add_event(self, event: TimelineEvent) -> None:
        self._events.append(event)
        if len(self._events) > self.max_events:
            self._events = self._events[-self.max_events :]

    def get_events(
        self,
        limit: int = 50,
        event_type: TimelineEventType | None = None,
        min_severity: SeverityLevel | None = None,
        since_s: float | None = None,
    ) -> list[TimelineEvent]:
        filtered = self._events

        if event_type is not None:
            filtered = [event for event in filtered if event.event_type == event_type]

        if min_severity is not None:
            filtered = [event for event in filtered if event.severity >= min_severity]

        if since_s is not None:
            filtered = [event for event in filtered if event.timestamp_s >= since_s]

        if limit <= 0:
            return []

        return list(filtered[-limit:])

    def get_status(self) -> SystemStatus:
        now_s = time.time()
        recent_high = [
            event
            for event in self._events
            if event.timestamp_s >= (now_s - 60.0) and event.severity >= SeverityLevel.HIGH
        ]

        task_latest_state: dict[str, str] = {}
        for event in self._events:
            if event.event_type != TimelineEventType.TASK_STATUS:
                continue
            task_id = event.related_task_id or str(event.details.get("task_id", ""))
            if not task_id:
                continue
            status_label = str(event.details.get("status_label", "")).upper()
            if not status_label:
                status_value = int(event.details.get("status", -1))
                status_label = _TASK_STATUS_LABELS.get(status_value, "UNKNOWN")
            task_latest_state[task_id] = status_label

        active_tasks = sum(1 for status in task_latest_state.values() if status not in _INACTIVE_TASK_STATUS)

        latest_severity = self._events[-1].severity if self._events else SeverityLevel.LOW

        if any(event.severity >= SeverityLevel.CRITICAL for event in recent_high):
            system_health = "critical"
        elif recent_high:
            system_health = "degraded"
        else:
            system_health = "nominal"

        return SystemStatus(
            timestamp_s=now_s,
            total_events=len(self._events),
            active_incidents=len(recent_high),
            active_tasks=active_tasks,
            system_health=system_health,
            latest_severity=latest_severity,
        )

    def clear(self) -> None:
        self._events.clear()

    def to_json(self, limit: int = 50) -> str:
        events = [event_to_dict(event) for event in self.get_events(limit=limit)]
        status = system_status_to_dict(self.get_status())
        return json.dumps({"timeline": events, "status": status}, sort_keys=True)


def _to_timestamp_s(raw_timestamp: Any, fallback: float | None = None) -> float:
    if isinstance(raw_timestamp, (int, float)):
        return float(raw_timestamp)

    if isinstance(raw_timestamp, str):
        try:
            return float(raw_timestamp)
        except ValueError:
            pass

    if isinstance(raw_timestamp, dict):
        sec = raw_timestamp.get("sec", raw_timestamp.get("secs", 0))
        nanosec = raw_timestamp.get("nanosec", raw_timestamp.get("nsecs", 0))
        try:
            return float(sec) + float(nanosec) / 1_000_000_000.0
        except (TypeError, ValueError):
            pass

    return time.time() if fallback is None else fallback


def _safe_severity(value: Any) -> SeverityLevel:
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        numeric = 0

    if numeric <= 0:
        return SeverityLevel.LOW
    if numeric == 1:
        return SeverityLevel.MEDIUM
    if numeric == 2:
        return SeverityLevel.HIGH
    return SeverityLevel.CRITICAL


def _first_present(data: dict[str, Any], keys: list[str], default: Any = "") -> Any:
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
    return default


def blindspot_to_event(data: dict) -> TimelineEvent:
    event_id = str(_first_present(data, ["event_id"], "blindspot_unknown"))
    zone_id = str(_first_present(data, ["zone_id"], ""))
    severity = _safe_severity(_first_present(data, ["severity"], 0))
    event_type_name = str(_first_present(data, ["event_type"], "blindspot_detected"))
    description = str(_first_present(data, ["description"], "Blindspot activity detected."))
    source_cameras = _first_present(data, ["source_cameras", "camera_id"], [])
    if isinstance(source_cameras, str):
        source_cameras = [source_cameras]
    affected_assets = _first_present(data, ["affected_assets", "affected_asset_ids"], [])
    if isinstance(affected_assets, str):
        affected_assets = [affected_assets]

    timestamp_s = _to_timestamp_s(_first_present(data, ["timestamp_detected", "timestamp_s"], None))
    title = f"Blindspot: {event_type_name}"

    return TimelineEvent(
        event_id=event_id,
        event_type=TimelineEventType.BLINDSPOT,
        severity=severity,
        timestamp_s=timestamp_s,
        title=title,
        description=description,
        details={
            "event_type": event_type_name,
            "source_cameras": list(source_cameras),
            "affected_assets": list(affected_assets),
            "confidence": _first_present(data, ["confidence"], None),
            "duration_s": _first_present(data, ["duration_s"], None),
        },
        zone_id=zone_id,
    )


def risk_to_event(data: dict) -> TimelineEvent:
    event_id = str(_first_present(data, ["assessment_id", "event_id"], "risk_unknown"))
    zone_id = str(_first_present(data, ["zone_id"], ""))
    severity = _safe_severity(_first_present(data, ["risk_level", "severity"], 0))
    timestamp_s = _to_timestamp_s(_first_present(data, ["timestamp_assessed", "timestamp_s"], None))
    risk_score = float(_first_present(data, ["risk_score", "confidence"], 0.0))
    risk_factors = _first_present(data, ["risk_factors"], [])
    if isinstance(risk_factors, str):
        risk_factors = [risk_factors]
    evidence = _first_present(data, ["evidence", "source_detections"], [])
    if isinstance(evidence, str):
        evidence = [evidence]

    description = str(_first_present(data, ["description"], "Risk assessment update."))
    title = f"Risk Assessment: {severity.name}"

    return TimelineEvent(
        event_id=event_id,
        event_type=TimelineEventType.RISK_ASSESSMENT,
        severity=severity,
        timestamp_s=timestamp_s,
        title=title,
        description=description,
        details={
            "risk_score": risk_score,
            "risk_factors": list(risk_factors),
            "recommended_action": str(_first_present(data, ["recommended_action"], "")),
            "evidence": list(evidence),
        },
        zone_id=zone_id,
    )


def task_status_to_event(data: dict) -> TimelineEvent:
    status_value = int(_first_present(data, ["status"], 0))
    status_label = str(_first_present(data, ["status_label"], _TASK_STATUS_LABELS.get(status_value, "UNKNOWN")))
    severity = _safe_severity(
        _first_present(
            data,
            ["severity"],
            3 if status_label in {"FAILED", "TIMED_OUT"} else (2 if status_label == "PAUSED" else 1),
        )
    )

    task_id = str(_first_present(data, ["task_id"], ""))
    timestamp_s = _to_timestamp_s(_first_present(data, ["timestamp_updated", "timestamp_s"], None))

    progress_pct = float(_first_present(data, ["progress_pct"], 0.0))
    status_message = str(_first_present(data, ["status_message"], ""))

    return TimelineEvent(
        event_id=f"task_status:{task_id}:{int(timestamp_s * 1000)}",
        event_type=TimelineEventType.TASK_STATUS,
        severity=severity,
        timestamp_s=timestamp_s,
        title=f"Task {task_id} {status_label}",
        description=status_message or f"Task {task_id} is now {status_label}.",
        details={
            "task_id": task_id,
            "status": status_value,
            "status_label": status_label,
            "progress_pct": progress_pct,
            "current_pose": _first_present(data, ["current_pose"], {}),
        },
        related_task_id=task_id,
    )


def alert_to_event(data: dict) -> TimelineEvent:
    alert_id = str(_first_present(data, ["alert_id", "event_id"], "alert_unknown"))
    severity = _safe_severity(_first_present(data, ["severity"], 1))
    timestamp_s = _to_timestamp_s(_first_present(data, ["timestamp_created", "timestamp_s"], None))

    return TimelineEvent(
        event_id=alert_id,
        event_type=TimelineEventType.OPERATOR_ALERT,
        severity=severity,
        timestamp_s=timestamp_s,
        title=str(_first_present(data, ["title"], "Operator Alert")),
        description=str(_first_present(data, ["message", "description"], "")),
        details={
            "source_node": str(_first_present(data, ["source_node"], "")),
            "requires_action": bool(_first_present(data, ["requires_action"], False)),
        },
        related_task_id=str(_first_present(data, ["related_task_id"], "")),
    )


def task_request_to_event(data: dict) -> TimelineEvent:
    task_id = str(_first_present(data, ["task_id"], "task_unknown"))
    priority = _safe_severity(_first_present(data, ["priority"], 1))
    timestamp_s = _to_timestamp_s(_first_present(data, ["timestamp_created", "timestamp_s", "header_stamp"], None))

    parameters = _first_present(data, ["parameters", "waypoints"], [])
    if isinstance(parameters, str):
        parameters = [parameters]

    zone_id = str(_first_present(data, ["zone_id"], ""))

    return TimelineEvent(
        event_id=f"task_request:{task_id}",
        event_type=TimelineEventType.TASK_REQUEST,
        severity=priority,
        timestamp_s=timestamp_s,
        title=f"Task Request: {task_id}",
        description=str(_first_present(data, ["description"], "Task requested.")),
        details={
            "task_type": _first_present(data, ["task_type"], None),
            "priority": int(priority),
            "parameters": list(parameters),
            "timeout_s": float(_first_present(data, ["timeout_s"], 0.0)),
            "source_event_id": str(_first_present(data, ["source_event_id"], "")),
            "auto_approved": bool(_first_present(data, ["auto_approved"], False)),
        },
        related_task_id=task_id,
        zone_id=zone_id,
    )


def event_to_dict(event: TimelineEvent) -> dict:
    payload = asdict(event)
    payload["event_type"] = int(event.event_type)
    payload["event_type_name"] = event.event_type.name
    payload["severity"] = int(event.severity)
    payload["severity_name"] = event.severity.name
    return payload


def system_status_to_dict(status: SystemStatus) -> dict:
    payload = asdict(status)
    payload["latest_severity"] = int(status.latest_severity)
    payload["latest_severity_name"] = status.latest_severity.name
    return payload
