import math

import pytest

from sras_robot_task_planner.planner_core import (
    PlannerCommand,
    PlannerConfig,
    PlannerEngine,
    PlannerEvent,
    TaskLifecycleState,
)


class FakeClock:
    def __init__(self, start: float = 0.0) -> None:
        self.now = start

    def tick(self, delta: float) -> None:
        self.now += delta

    def __call__(self) -> float:
        return self.now


def _new_engine(clock: FakeClock, **overrides) -> PlannerEngine:
    config = PlannerConfig(
        dedup_window_s=60.0,
        incident_ttl_s=600.0,
        queue_max_size=100,
        require_map=False,
        require_nav_ready=False,
        auto_approve_max_severity=0.55,
        langgraph_enabled=False,
        cosmos_enabled=False,
    )
    for key, value in overrides.items():
        setattr(config, key, value)
    return PlannerEngine(config=config, now_fn=clock)


def _event(
    incident_key: str,
    event_type: str = "blindspot",
    severity: str | float = "medium",
    confidence: float = 0.8,
    asset_criticality: float = 0.5,
    has_signal_conflict: bool = False,
) -> PlannerEvent:
    return PlannerEvent(
        incident_key=incident_key,
        event_type=event_type,
        severity=severity,
        confidence=confidence,
        asset_criticality=asset_criticality,
        has_signal_conflict=has_signal_conflict,
        details={"poi_id": f"poi-{incident_key}"},
    )


def test_deduplicates_same_incident_within_window() -> None:
    clock = FakeClock(10.0)
    engine = _new_engine(clock)
    first = _event("incident-a")

    assert engine.ingest_event(first) is True
    assert engine.ingest_event(first) is False
    assert engine.get_stats()["deduplicated_events"] == 1


def test_priority_prefers_higher_risk_event() -> None:
    clock = FakeClock(10.0)
    engine = _new_engine(clock, auto_approve_max_severity=1.0, max_active_tasks=2)
    low = _event("low", severity="low", confidence=0.95, asset_criticality=0.2)
    high = _event("high", severity="critical", confidence=0.7, asset_criticality=0.9)

    engine.ingest_event(low)
    engine.ingest_event(high)

    first = engine.tick()
    second = engine.tick()

    assert first[0].incident_key == "high"
    assert second[0].incident_key == "low"
    assert first[0].priority > second[0].priority


def test_map_gate_blocks_dispatch_until_fresh_map() -> None:
    clock = FakeClock(100.0)
    engine = _new_engine(
        clock,
        require_map=True,
        map_stale_timeout_s=3.0,
        auto_approve_max_severity=1.0,
    )
    engine.ingest_event(_event("gate-1", severity="high"))

    blocked = engine.tick()
    assert blocked == []
    assert engine.pop_alerts()

    engine.update_map_metadata(width=100, height=100, resolution=0.05, stamp_s=clock())
    dispatched = engine.tick()

    assert len(dispatched) == 1
    assert dispatched[0].state == TaskLifecycleState.DISPATCHED


def test_requires_hitl_approval_above_threshold_and_supports_transitions() -> None:
    clock = FakeClock(100.0)
    engine = _new_engine(clock, auto_approve_max_severity=0.45)
    engine.ingest_event(_event("incident-hitl", severity="critical", confidence=0.8))

    assert engine.tick() == []
    waiting = engine.get_tasks(TaskLifecycleState.PENDING_APPROVAL)
    assert len(waiting) == 1
    task_id = waiting[0].task_id

    accepted, msg, approved_task = engine.apply_command(task_id, PlannerCommand.APPROVE)
    assert accepted is True
    assert "approved" in msg.lower()
    assert approved_task is not None
    assert approved_task.state == TaskLifecycleState.DISPATCHED

    accepted, _, paused_task = engine.apply_command(task_id, PlannerCommand.PAUSE)
    assert accepted is True
    assert paused_task is not None
    assert paused_task.state == TaskLifecycleState.PAUSED

    accepted, _, resumed_task = engine.apply_command(task_id, PlannerCommand.RESUME)
    assert accepted is True
    assert resumed_task is not None
    assert resumed_task.state == TaskLifecycleState.DISPATCHED

    accepted, _, canceled_task = engine.apply_command(task_id, PlannerCommand.CANCEL)
    assert accepted is True
    assert canceled_task is not None
    assert canceled_task.state == TaskLifecycleState.CANCELED


def test_deep_mode_failure_falls_back_to_deterministic() -> None:
    class FailingDeepClient:
        def plan(self, event, timeout_s):  # noqa: ANN001
            raise RuntimeError("cosmos unavailable")

    clock = FakeClock(300.0)
    engine = _new_engine(
        clock,
        langgraph_enabled=True,
        cosmos_enabled=True,
        deep_conf_threshold=0.8,
        deep_timeout_s=0.1,
        max_reentries=0,
    )
    engine.set_deep_planner_client(FailingDeepClient())
    engine.ingest_event(_event("incident-deep", severity="medium", confidence=0.2))

    tasks = engine.tick()
    assert len(tasks) == 1
    assert tasks[0].route == "deterministic_fallback"

    stats = engine.get_stats()
    assert stats["deep_attempts"] == 1
    assert stats["deep_fallbacks"] == 1
    assert math.isclose(stats["deep_success_rate"], 0.0)


def test_deep_mode_reentry_succeeds_within_limit() -> None:
    class FlakyDeepClient:
        def __init__(self) -> None:
            self.calls = 0

        def plan(self, event, timeout_s):  # noqa: ANN001
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("transient timeout")
            return {
                "task_type": "INSPECT_POI",
                "priority": 0.9,
                "payload": {"source": "deep"},
            }

    clock = FakeClock(310.0)
    deep_client = FlakyDeepClient()
    engine = _new_engine(
        clock,
        langgraph_enabled=True,
        cosmos_enabled=True,
        deep_conf_threshold=0.8,
        deep_timeout_s=0.1,
        max_reentries=2,
        auto_approve_max_severity=1.0,
    )
    engine.set_deep_planner_client(deep_client)
    engine.ingest_event(_event("incident-reentry-ok", severity="medium", confidence=0.2))

    tasks = engine.tick()
    assert len(tasks) == 1
    assert tasks[0].route == "deep"
    assert deep_client.calls == 2

    stats = engine.get_stats()
    assert stats["deep_attempts"] == 2
    assert stats["deep_reentry_attempts"] == 1
    assert stats["deep_successes"] == 1


def test_deep_mode_reentry_exhaustion_falls_back() -> None:
    class AlwaysFailingDeepClient:
        def __init__(self) -> None:
            self.calls = 0

        def plan(self, event, timeout_s):  # noqa: ANN001
            self.calls += 1
            raise RuntimeError("deep unavailable")

    clock = FakeClock(320.0)
    deep_client = AlwaysFailingDeepClient()
    engine = _new_engine(
        clock,
        langgraph_enabled=True,
        cosmos_enabled=True,
        deep_conf_threshold=0.8,
        deep_timeout_s=0.1,
        max_reentries=1,
        auto_approve_max_severity=1.0,
    )
    engine.set_deep_planner_client(deep_client)
    engine.ingest_event(_event("incident-reentry-fallback", severity="medium", confidence=0.2))

    tasks = engine.tick()
    assert len(tasks) == 1
    assert tasks[0].route == "deterministic_fallback"
    assert deep_client.calls == 2

    stats = engine.get_stats()
    assert stats["deep_attempts"] == 2
    assert stats["deep_reentry_attempts"] == 1
    assert stats["deep_fallbacks"] == 1


def test_deep_mode_accepts_string_priority_without_crash() -> None:
    class DeepClientWithStringPriority:
        def plan(self, event, timeout_s):  # noqa: ANN001
            return {
                "task_type": "INSPECT_BLINDSPOT",
                "priority": "medium",
                "payload": {"source": "deep"},
            }

    clock = FakeClock(400.0)
    engine = _new_engine(
        clock,
        langgraph_enabled=True,
        cosmos_enabled=True,
        deep_conf_threshold=0.8,
        deep_timeout_s=0.1,
        auto_approve_max_severity=1.0,
    )
    engine.set_deep_planner_client(DeepClientWithStringPriority())
    engine.ingest_event(_event("incident-deep-priority", severity="medium", confidence=0.2))

    tasks = engine.tick()
    assert len(tasks) == 1
    assert tasks[0].route == "deep"
    assert 0.0 <= tasks[0].priority <= 1.0


def test_deep_mode_unknown_priority_uses_scored_fallback() -> None:
    class DeepClientWithUnknownPriority:
        def plan(self, event, timeout_s):  # noqa: ANN001
            return {
                "task_type": "INSPECT_BLINDSPOT",
                "priority": "urgent",
                "payload": {"source": "deep"},
            }

    clock = FakeClock(500.0)
    event = _event(
        "incident-deep-unknown-priority",
        severity="critical",
        confidence=0.9,
        asset_criticality=1.0,
    )

    expected_engine = _new_engine(clock, auto_approve_max_severity=1.0)
    expected_engine.ingest_event(event)
    expected_priority = expected_engine.tick()[0].priority

    engine = _new_engine(
        clock,
        langgraph_enabled=True,
        cosmos_enabled=True,
        deep_conf_threshold=0.8,
        deep_timeout_s=0.1,
        auto_approve_max_severity=1.0,
    )
    engine.set_deep_planner_client(DeepClientWithUnknownPriority())
    engine.ingest_event(event)

    tasks = engine.tick()
    assert len(tasks) == 1
    assert tasks[0].route == "deep"
    assert tasks[0].priority == pytest.approx(expected_priority)
