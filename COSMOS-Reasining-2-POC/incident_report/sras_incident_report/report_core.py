from __future__ import annotations

import json
import time
import uuid
from dataclasses import asdict, dataclass, field
from enum import IntEnum
from typing import Any


class IncidentPhase(IntEnum):
    TRIGGER = 0
    ASSESSMENT = 1
    RESPONSE = 2
    RESOLUTION = 3


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
_FAILED_STATES = {"FAILED", "CANCELED", "TIMED_OUT"}


@dataclass(frozen=True, slots=True)
class ReportSection:
    phase: IncidentPhase
    title: str
    summary: str
    events: list[dict[str, Any]]
    timestamp_start_s: float
    timestamp_end_s: float


@dataclass(slots=True)
class IncidentReport:
    report_id: str
    incident_id: str
    generated_at_s: float
    duration_s: float
    trigger_summary: str
    peak_severity: int
    peak_severity_name: str
    zones_affected: list[str]
    tasks_dispatched: int
    tasks_completed: int
    tasks_failed: int
    outcome: str
    sections: list[ReportSection] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    raw_event_count: int = 0


def classify_phase(event_type: int) -> IncidentPhase:
    if int(event_type) in (TimelineEventType.BLINDSPOT, TimelineEventType.RISK_ASSESSMENT):
        return IncidentPhase.TRIGGER
    if int(event_type) == TimelineEventType.OPERATOR_ALERT:
        return IncidentPhase.ASSESSMENT
    if int(event_type) == TimelineEventType.TASK_REQUEST:
        return IncidentPhase.RESPONSE
    return IncidentPhase.RESOLUTION


def _as_float(raw: Any, default: float = 0.0) -> float:
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _as_int(raw: Any, default: int = 0) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _event_timestamp(event: dict[str, Any]) -> float:
    return _as_float(event.get("timestamp_s"), 0.0)


def _severity_name(level: int) -> str:
    try:
        return SeverityLevel(level).name
    except ValueError:
        return "LOW"


def _task_status_label(event: dict[str, Any]) -> str:
    details = event.get("details", {})
    if not isinstance(details, dict):
        details = {}

    status_label = str(details.get("status_label", "")).upper()
    if status_label:
        return status_label

    status_value = _as_int(details.get("status"), -1)
    if status_value in _TASK_STATUS_LABELS:
        return _TASK_STATUS_LABELS[status_value]

    event_status = _as_int(event.get("status"), -1)
    return _TASK_STATUS_LABELS.get(event_status, "UNKNOWN")


def _task_id(event: dict[str, Any]) -> str:
    raw = event.get("related_task_id")
    if raw:
        return str(raw)

    details = event.get("details", {})
    if isinstance(details, dict) and details.get("task_id"):
        return str(details["task_id"])

    if event.get("task_id"):
        return str(event["task_id"])

    return ""


def _build_sections(events: list[dict[str, Any]]) -> list[ReportSection]:
    phase_events: dict[IncidentPhase, list[dict[str, Any]]] = {
        IncidentPhase.TRIGGER: [],
        IncidentPhase.ASSESSMENT: [],
        IncidentPhase.RESPONSE: [],
        IncidentPhase.RESOLUTION: [],
    }

    for event in events:
        phase = classify_phase(_as_int(event.get("event_type"), TimelineEventType.SYSTEM_STATUS))
        phase_events[phase].append(event)

    sections: list[ReportSection] = []
    phase_titles = {
        IncidentPhase.TRIGGER: "Trigger",
        IncidentPhase.ASSESSMENT: "Assessment",
        IncidentPhase.RESPONSE: "Response",
        IncidentPhase.RESOLUTION: "Resolution",
    }

    for phase in IncidentPhase:
        grouped = phase_events[phase]
        if not grouped:
            continue

        timestamps = [_event_timestamp(event) for event in grouped]
        max_severity = max(_as_int(event.get("severity"), 0) for event in grouped)
        summary = (
            f"{len(grouped)} events, peak severity {_severity_name(max_severity)}, "
            f"from {min(timestamps):.2f}s to {max(timestamps):.2f}s"
        )

        sections.append(
            ReportSection(
                phase=phase,
                title=phase_titles[phase],
                summary=summary,
                events=grouped,
                timestamp_start_s=min(timestamps),
                timestamp_end_s=max(timestamps),
            )
        )

    return sections


def _determine_outcome(
    events: list[dict[str, Any]],
    tasks_completed: int,
    tasks_failed: int,
    task_total: int,
) -> str:
    has_escalation = any(
        _as_int(event.get("event_type"), -1) == TimelineEventType.OPERATOR_ALERT
        and _as_int(event.get("severity"), 0) >= SeverityLevel.CRITICAL
        and bool((event.get("details") or {}).get("requires_action", False))
        for event in events
    )
    if has_escalation:
        return "escalated"

    if task_total > 0 and tasks_completed == task_total:
        return "resolved"

    if tasks_completed > 0:
        return "partial"

    if task_total > 0 and tasks_failed == task_total:
        return "unresolved"

    return "unresolved"


def _build_recommendations(
    outcome: str,
    peak_severity: int,
    tasks_failed: int,
    tasks_completed: int,
) -> list[str]:
    recommendations: list[str] = []

    if outcome == "escalated":
        recommendations.append("Escalate to incident commander with full timeline and operator notes.")
    elif outcome == "resolved":
        recommendations.append("Close incident and archive evidence with post-incident review notes.")
    elif outcome == "partial":
        recommendations.append("Schedule follow-up tasks for unresolved risk factors.")
    else:
        recommendations.append("Re-open incident workflow and re-dispatch response resources.")

    if peak_severity >= SeverityLevel.CRITICAL:
        recommendations.append("Review critical alert thresholds and run readiness drills for affected zones.")
    elif peak_severity >= SeverityLevel.HIGH:
        recommendations.append("Audit detection confidence and tune alert routing for faster triage.")

    if tasks_failed > 0:
        recommendations.append("Analyze failed task executions and address robot or environment blockers.")

    if tasks_completed == 0:
        recommendations.append("Add operator playbook guidance for early task dispatch decisions.")

    return recommendations


def generate_report(incident_id: str, events: list[dict[str, Any]], report_id: str = "") -> IncidentReport:
    sorted_events = sorted(events, key=_event_timestamp)
    generated_at_s = time.time()

    if not sorted_events:
        return IncidentReport(
            report_id=report_id or str(uuid.uuid4()),
            incident_id=incident_id,
            generated_at_s=generated_at_s,
            duration_s=0.0,
            trigger_summary="No trigger events available.",
            peak_severity=int(SeverityLevel.LOW),
            peak_severity_name=SeverityLevel.LOW.name,
            zones_affected=[],
            tasks_dispatched=0,
            tasks_completed=0,
            tasks_failed=0,
            outcome="unresolved",
            sections=[],
            recommendations=["No events captured; validate telemetry pipeline for incident reporting."],
            raw_event_count=0,
        )

    trigger_event = next(
        (
            event
            for event in sorted_events
            if _as_int(event.get("event_type"), -1)
            in (TimelineEventType.BLINDSPOT, TimelineEventType.RISK_ASSESSMENT)
        ),
        sorted_events[0],
    )
    trigger_summary = (
        f"{str(trigger_event.get('title', '')).strip()}: "
        f"{str(trigger_event.get('description', '')).strip()}"
    ).strip(": ")

    peak_severity = max(_as_int(event.get("severity"), 0) for event in sorted_events)

    zones_affected = sorted(
        {
            str(event.get("zone_id", "")).strip()
            for event in sorted_events
            if str(event.get("zone_id", "")).strip()
        }
    )

    task_latest_state: dict[str, tuple[float, str]] = {}
    for event in sorted_events:
        if _as_int(event.get("event_type"), -1) != TimelineEventType.TASK_STATUS:
            continue
        task_id = _task_id(event)
        if not task_id:
            continue

        label = _task_status_label(event)
        ts = _event_timestamp(event)
        previous = task_latest_state.get(task_id)
        if previous is None or ts >= previous[0]:
            task_latest_state[task_id] = (ts, label)

    tasks_dispatched = sum(1 for _, status in task_latest_state.values() if status in {"DISPATCHED", "ACTIVE", "PAUSED", "COMPLETED", *list(_FAILED_STATES)})
    tasks_completed = sum(1 for _, status in task_latest_state.values() if status == "COMPLETED")
    tasks_failed = sum(1 for _, status in task_latest_state.values() if status in _FAILED_STATES)

    outcome = _determine_outcome(
        events=sorted_events,
        tasks_completed=tasks_completed,
        tasks_failed=tasks_failed,
        task_total=len(task_latest_state),
    )

    duration_s = _event_timestamp(sorted_events[-1]) - _event_timestamp(sorted_events[0])

    sections = _build_sections(sorted_events)
    recommendations = _build_recommendations(
        outcome=outcome,
        peak_severity=peak_severity,
        tasks_failed=tasks_failed,
        tasks_completed=tasks_completed,
    )

    return IncidentReport(
        report_id=report_id or str(uuid.uuid4()),
        incident_id=incident_id,
        generated_at_s=generated_at_s,
        duration_s=max(0.0, duration_s),
        trigger_summary=trigger_summary,
        peak_severity=peak_severity,
        peak_severity_name=_severity_name(peak_severity),
        zones_affected=zones_affected,
        tasks_dispatched=tasks_dispatched,
        tasks_completed=tasks_completed,
        tasks_failed=tasks_failed,
        outcome=outcome,
        sections=sections,
        recommendations=recommendations,
        raw_event_count=len(sorted_events),
    )


def report_to_json(report: IncidentReport) -> str:
    payload = asdict(report)
    payload["sections"] = [
        {
            **asdict(section),
            "phase": int(section.phase),
            "phase_name": section.phase.name,
        }
        for section in report.sections
    ]
    return json.dumps(payload, sort_keys=True)


def report_to_markdown(report: IncidentReport) -> str:
    lines = [
        f"# Incident Summary Report: {report.incident_id}",
        "",
        f"- Report ID: {report.report_id}",
        f"- Generated At: {report.generated_at_s:.3f}",
        f"- Duration: {report.duration_s:.2f}s",
        f"- Outcome: {report.outcome}",
        f"- Peak Severity: {report.peak_severity_name}",
        f"- Zones Affected: {', '.join(report.zones_affected) if report.zones_affected else 'n/a'}",
        f"- Tasks Dispatched: {report.tasks_dispatched}",
        f"- Tasks Completed: {report.tasks_completed}",
        f"- Tasks Failed: {report.tasks_failed}",
        "",
        "## Trigger Summary",
        report.trigger_summary or "n/a",
        "",
        "## Sections",
    ]

    for section in report.sections:
        lines.extend(
            [
                f"### {section.title}",
                f"- Phase: {section.phase.name}",
                f"- Time Range: {section.timestamp_start_s:.2f}s - {section.timestamp_end_s:.2f}s",
                f"- Summary: {section.summary}",
                f"- Event Count: {len(section.events)}",
                "",
            ]
        )

    lines.append("## Recommendations")
    for recommendation in report.recommendations:
        lines.append(f"- {recommendation}")

    return "\n".join(lines)
