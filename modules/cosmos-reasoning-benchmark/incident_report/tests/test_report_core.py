import json

from sras_incident_report.report_core import (
    IncidentPhase,
    TimelineEventType,
    classify_phase,
    generate_report,
    report_to_json,
    report_to_markdown,
)


def _event(
    event_type: int,
    severity: int,
    timestamp_s: float,
    title: str,
    description: str,
    details: dict | None = None,
    related_task_id: str = "",
    zone_id: str = "",
) -> dict:
    return {
        "event_type": event_type,
        "severity": severity,
        "timestamp_s": timestamp_s,
        "title": title,
        "description": description,
        "details": details or {},
        "related_task_id": related_task_id,
        "zone_id": zone_id,
    }


def test_classify_phase_blindspot() -> None:
    assert classify_phase(TimelineEventType.BLINDSPOT) == IncidentPhase.TRIGGER


def test_classify_phase_task_status() -> None:
    assert classify_phase(TimelineEventType.TASK_STATUS) == IncidentPhase.RESOLUTION


def test_generate_report_basic() -> None:
    events = [
        _event(
            event_type=TimelineEventType.BLINDSPOT,
            severity=2,
            timestamp_s=100.0,
            title="Blindspot",
            description="Movement detected",
            zone_id="zone_a",
        ),
        _event(
            event_type=TimelineEventType.TASK_REQUEST,
            severity=1,
            timestamp_s=120.0,
            title="Dispatch",
            description="Dispatch robot",
            related_task_id="task_1",
            zone_id="zone_a",
        ),
        _event(
            event_type=TimelineEventType.TASK_STATUS,
            severity=1,
            timestamp_s=180.0,
            title="Task complete",
            description="Done",
            details={"status": 5, "status_label": "COMPLETED", "task_id": "task_1"},
            related_task_id="task_1",
            zone_id="zone_a",
        ),
    ]

    report = generate_report("zone_a", events)

    assert report.outcome == "resolved"
    assert report.tasks_completed == 1
    assert report.tasks_failed == 0
    assert report.duration_s == 80.0


def test_generate_report_failed_outcome() -> None:
    events = [
        _event(TimelineEventType.BLINDSPOT, 2, 10.0, "Blindspot", "Trigger", zone_id="zone_b"),
        _event(
            TimelineEventType.TASK_STATUS,
            3,
            25.0,
            "Task failed",
            "Failure",
            details={"status": 6, "status_label": "FAILED", "task_id": "task_2"},
            related_task_id="task_2",
            zone_id="zone_b",
        ),
    ]

    report = generate_report("zone_b", events)
    assert report.outcome == "unresolved"


def test_generate_report_partial_outcome() -> None:
    events = [
        _event(TimelineEventType.BLINDSPOT, 2, 1.0, "Blindspot", "Trigger", zone_id="zone_c"),
        _event(
            TimelineEventType.TASK_STATUS,
            1,
            10.0,
            "Task done",
            "Done",
            details={"status": 5, "status_label": "COMPLETED", "task_id": "task_ok"},
            related_task_id="task_ok",
            zone_id="zone_c",
        ),
        _event(
            TimelineEventType.TASK_STATUS,
            3,
            20.0,
            "Task failed",
            "Failed",
            details={"status": 6, "status_label": "FAILED", "task_id": "task_bad"},
            related_task_id="task_bad",
            zone_id="zone_c",
        ),
    ]

    report = generate_report("zone_c", events)
    assert report.outcome == "partial"


def test_generate_report_escalated() -> None:
    events = [
        _event(TimelineEventType.BLINDSPOT, 2, 1.0, "Blindspot", "Trigger", zone_id="zone_d"),
        _event(
            TimelineEventType.OPERATOR_ALERT,
            3,
            2.0,
            "Immediate action",
            "Escalate",
            details={"requires_action": True},
            zone_id="zone_d",
        ),
        _event(
            TimelineEventType.TASK_STATUS,
            3,
            8.0,
            "Task failed",
            "Failed",
            details={"status": 6, "status_label": "FAILED", "task_id": "task_x"},
            related_task_id="task_x",
            zone_id="zone_d",
        ),
    ]

    report = generate_report("zone_d", events)
    assert report.outcome == "escalated"


def test_peak_severity_extraction() -> None:
    events = [
        _event(TimelineEventType.BLINDSPOT, 1, 1.0, "B", "b"),
        _event(TimelineEventType.RISK_ASSESSMENT, 3, 2.0, "R", "r"),
    ]

    report = generate_report("incident_peak", events)
    assert report.peak_severity == 3
    assert report.peak_severity_name == "CRITICAL"


def test_zones_affected_extraction() -> None:
    events = [
        _event(TimelineEventType.BLINDSPOT, 2, 1.0, "B", "b", zone_id="zone_1"),
        _event(TimelineEventType.RISK_ASSESSMENT, 2, 2.0, "R", "r", zone_id="zone_2"),
        _event(TimelineEventType.OPERATOR_ALERT, 1, 3.0, "A", "a", zone_id="zone_1"),
    ]

    report = generate_report("incident_zones", events)
    assert report.zones_affected == ["zone_1", "zone_2"]


def test_report_to_json_roundtrip() -> None:
    events = [
        _event(TimelineEventType.BLINDSPOT, 2, 1.0, "Blindspot", "Trigger", zone_id="zone_json"),
        _event(
            TimelineEventType.TASK_STATUS,
            1,
            3.0,
            "Task complete",
            "Done",
            details={"status": 5, "status_label": "COMPLETED", "task_id": "task_json"},
            related_task_id="task_json",
            zone_id="zone_json",
        ),
    ]

    report = generate_report("zone_json", events)
    payload = json.loads(report_to_json(report))

    assert payload["incident_id"] == "zone_json"
    assert payload["outcome"] == "resolved"
    assert payload["sections"]


def test_report_to_markdown_contains_sections() -> None:
    events = [
        _event(TimelineEventType.BLINDSPOT, 2, 1.0, "Blindspot", "Trigger", zone_id="zone_md"),
        _event(TimelineEventType.OPERATOR_ALERT, 1, 2.0, "Alert", "Assess", zone_id="zone_md"),
        _event(TimelineEventType.TASK_REQUEST, 1, 3.0, "Request", "Respond", zone_id="zone_md"),
        _event(
            TimelineEventType.TASK_STATUS,
            1,
            4.0,
            "Done",
            "Resolve",
            details={"status": 5, "status_label": "COMPLETED", "task_id": "task_md"},
            related_task_id="task_md",
            zone_id="zone_md",
        ),
    ]

    report = generate_report("zone_md", events)
    markdown = report_to_markdown(report)

    assert "## Sections" in markdown
    assert "### Trigger" in markdown
    assert "### Assessment" in markdown
    assert "### Response" in markdown
    assert "### Resolution" in markdown
