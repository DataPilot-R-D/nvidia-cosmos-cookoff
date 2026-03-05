import sqlite3

from sras_robot_task_planner.planner_core import PlannerConfig, PlannerEngine, PlannerEvent
from sras_robot_task_planner.planner_journal import SQLitePlannerJournal


def test_sqlite_journal_persists_events_tasks_transitions_and_alerts(tmp_path) -> None:
    db_path = tmp_path / "planner_journal.db"
    journal = SQLitePlannerJournal(str(db_path))
    engine = PlannerEngine(
        config=PlannerConfig(
            require_map=False,
            require_nav_ready=False,
            auto_approve_max_severity=0.4,
        ),
        now_fn=lambda: 100.0,
    )
    engine.set_journal(journal)

    event = PlannerEvent(
        incident_key="incident-journal-1",
        event_type="risk_assessment",
        severity="critical",
        confidence=0.9,
        asset_criticality=0.8,
    )

    assert engine.ingest_event(event) is True
    assert engine.tick() == []

    waiting = engine.get_tasks()
    assert len(waiting) == 1
    task_id = waiting[0].task_id

    accepted, _, _ = engine.apply_command(task_id, "approve")
    assert accepted is True
    assert engine.update_task_status(task_id, "completed") is True

    # Flush/close journal connection before reading with a separate sqlite handle.
    journal.close()

    conn = sqlite3.connect(str(db_path))
    try:
        event_count = conn.execute("SELECT COUNT(*) FROM planner_events").fetchone()[0]
        task_count = conn.execute("SELECT COUNT(*) FROM planner_tasks").fetchone()[0]
        transition_count = conn.execute("SELECT COUNT(*) FROM planner_transitions").fetchone()[0]
        alert_count = conn.execute("SELECT COUNT(*) FROM planner_alerts").fetchone()[0]
    finally:
        conn.close()

    assert event_count >= 1
    assert task_count >= 1
    assert transition_count >= 2
    assert alert_count >= 1
