import math

import pytest

from sras_robot_task_planner.planner_core import (
    PlannerCommand,
    PlannerConfig,
    PlannerEngine,
    PlannerEvent,
    TaskLifecycleState,
)
from sras_robot_task_planner.robot_registry import (
    RobotReadiness,
    RobotRegistry,
    RobotType,
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


# --- Executor status mapping tests (Step 1) ---


def test_executor_uppercase_active_maps_to_in_progress() -> None:
    clock = FakeClock(100.0)
    engine = _new_engine(clock, auto_approve_max_severity=1.0)
    engine.ingest_event(_event("exec-active", severity="high"))
    tasks = engine.tick()
    assert len(tasks) == 1
    task_id = tasks[0].task_id

    assert engine.update_task_status(task_id, "ACTIVE") is True
    task = engine.get_tasks()[0]
    assert task.state == TaskLifecycleState.IN_PROGRESS


def test_executor_uppercase_succeeded_maps_to_completed() -> None:
    clock = FakeClock(100.0)
    engine = _new_engine(clock, auto_approve_max_severity=1.0)
    engine.ingest_event(_event("exec-succeeded", severity="high"))
    tasks = engine.tick()
    task_id = tasks[0].task_id

    assert engine.update_task_status(task_id, "SUCCEEDED") is True
    task = engine.get_tasks()[0]
    assert task.state == TaskLifecycleState.COMPLETED


def test_executor_queued_maps_to_dispatched() -> None:
    clock = FakeClock(100.0)
    engine = _new_engine(clock, auto_approve_max_severity=1.0)
    engine.ingest_event(_event("exec-queued", severity="high"))
    tasks = engine.tick()
    task_id = tasks[0].task_id

    assert engine.update_task_status(task_id, "queued") is True
    task = engine.get_tasks()[0]
    assert task.state == TaskLifecycleState.DISPATCHED


def test_executor_blocked_maps_to_dispatched() -> None:
    clock = FakeClock(100.0)
    engine = _new_engine(clock, auto_approve_max_severity=1.0)
    engine.ingest_event(_event("exec-blocked", severity="high"))
    tasks = engine.tick()
    task_id = tasks[0].task_id

    assert engine.update_task_status(task_id, "BLOCKED") is True
    task = engine.get_tasks()[0]
    assert task.state == TaskLifecycleState.DISPATCHED


# --- Intruder event type + goal propagation tests (Step 5) ---


def test_intruder_detected_event_maps_to_investigate_alert() -> None:
    clock = FakeClock(100.0)
    engine = _new_engine(clock, auto_approve_max_severity=1.0)
    engine.ingest_event(_event("intruder-1", event_type="intruder_detected", severity="high"))
    tasks = engine.tick()
    assert len(tasks) == 1
    assert tasks[0].task_type == "INVESTIGATE_ALERT"


def test_intruder_event_type_maps_to_investigate_alert() -> None:
    clock = FakeClock(100.0)
    engine = _new_engine(clock, auto_approve_max_severity=1.0)
    engine.ingest_event(_event("intruder-2", event_type="intruder", severity="high"))
    tasks = engine.tick()
    assert len(tasks) == 1
    assert tasks[0].task_type == "INVESTIGATE_ALERT"


def test_detection_alert_event_type_maps_to_investigate_alert() -> None:
    clock = FakeClock(100.0)
    engine = _new_engine(clock, auto_approve_max_severity=1.0)
    engine.ingest_event(_event("intruder-3", event_type="detection_alert", severity="high"))
    tasks = engine.tick()
    assert len(tasks) == 1
    assert tasks[0].task_type == "INVESTIGATE_ALERT"


def test_goal_propagated_from_event_details() -> None:
    clock = FakeClock(100.0)
    engine = _new_engine(clock, auto_approve_max_severity=1.0)
    goal = {"x": -0.63, "y": 5.67, "z": 0.0, "yaw": 1.23, "frame_id": "map"}
    event = PlannerEvent(
        incident_key="goal-test",
        event_type="intruder_detected",
        severity="high",
        confidence=0.9,
        details={"goal": goal, "source": "triangulated_detections"},
    )
    engine.ingest_event(event)
    tasks = engine.tick()
    assert len(tasks) == 1
    assert tasks[0].goal is not None
    assert tasks[0].goal["x"] == -0.63
    assert tasks[0].goal["yaw"] == 1.23
    assert tasks[0].goal["frame_id"] == "map"


def test_goal_is_none_when_not_in_details() -> None:
    clock = FakeClock(100.0)
    engine = _new_engine(clock, auto_approve_max_severity=1.0)
    event = PlannerEvent(
        incident_key="no-goal-test",
        event_type="blindspot",
        severity="high",
        confidence=0.9,
        details={"poi_id": "poi-1"},
    )
    engine.ingest_event(event)
    tasks = engine.tick()
    assert len(tasks) == 1
    assert tasks[0].goal is None


# --- Multi-robot tests ---


def _new_multi_engine(clock: FakeClock, **overrides) -> tuple[PlannerEngine, RobotRegistry]:
    config = PlannerConfig(
        dedup_window_s=60.0,
        incident_ttl_s=600.0,
        queue_max_size=100,
        require_map=False,
        require_nav_ready=False,
        auto_approve_max_severity=1.0,
        langgraph_enabled=False,
        cosmos_enabled=False,
        multi_robot_enabled=True,
        max_active_tasks_per_robot=1,
        cosmos_assignment_enabled=False,
    )
    for key, value in overrides.items():
        setattr(config, key, value)

    registry = RobotRegistry(now_fn=clock)
    engine = PlannerEngine(config=config, now_fn=clock)
    engine.set_robot_registry(registry)
    return engine, registry


def test_multi_robot_deterministic_assigns_dog_pursue_humanoid_block() -> None:
    clock = FakeClock(100.0)
    engine, registry = _new_multi_engine(clock)
    registry.register_robot("robot0", RobotType.QUADRUPED)
    registry.register_robot("robot1", RobotType.HUMANOID)
    registry.update_readiness("robot1", RobotReadiness.READY, nav2_ready=True)

    engine.ingest_event(_event("intruder-1", event_type="intruder_detected", severity="high"))
    tasks = engine.tick()

    assert len(tasks) == 2
    task_map = {t.robot_id: t for t in tasks}
    assert "robot0" in task_map
    assert "robot1" in task_map
    assert task_map["robot0"].task_type == "PURSUE_THIEF"
    assert task_map["robot1"].task_type == "BLOCK_EXIT"
    assert task_map["robot0"].route == "multi_robot"
    assert task_map["robot1"].route == "multi_robot"


def test_multi_robot_per_robot_capacity_limits() -> None:
    clock = FakeClock(100.0)
    engine, registry = _new_multi_engine(clock, max_active_tasks_per_robot=1)
    registry.register_robot("robot0", RobotType.QUADRUPED)
    registry.register_robot("robot1", RobotType.HUMANOID)
    registry.update_readiness("robot1", RobotReadiness.READY, nav2_ready=True)

    engine.ingest_event(_event("intruder-1", event_type="intruder_detected", severity="high"))
    first_tick = engine.tick()
    assert len(first_tick) == 2

    clock.tick(61.0)
    engine.ingest_event(_event("intruder-2", event_type="intruder_detected", severity="high"))
    second_tick = engine.tick()
    assert len(second_tick) == 0


def test_multi_robot_degraded_humanoid_excluded() -> None:
    clock = FakeClock(100.0)
    engine, registry = _new_multi_engine(clock)
    registry.register_robot("robot0", RobotType.QUADRUPED)
    registry.register_robot("robot1", RobotType.HUMANOID)
    # robot1 stays DEGRADED (nav2_ready=False)

    engine.ingest_event(_event("intruder-1", event_type="intruder_detected", severity="high"))
    tasks = engine.tick()

    assert len(tasks) == 1
    assert tasks[0].robot_id == "robot0"
    assert tasks[0].task_type == "PURSUE_THIEF"


def test_multi_robot_cosmos_assignment_used_when_enabled() -> None:
    from sras_robot_task_planner.cosmos_assignment_reasoner import (
        AssignmentPlan,
        RobotAssignment,
    )

    class FakeAssignmentClient:
        def __init__(self) -> None:
            self.called = False

        def assign(self, event_summary, robot_states, timeout_s):  # noqa: ANN001
            self.called = True
            return AssignmentPlan(
                assignments=(
                    RobotAssignment(
                        robot_id="robot0",
                        task_type="PURSUE_THIEF",
                        priority=0.95,
                        reasoning="Cosmos chose pursuit",
                        payload={"target_x": 1.0},
                    ),
                    RobotAssignment(
                        robot_id="robot1",
                        task_type="GUARD_ASSET",
                        priority=0.8,
                        reasoning="Cosmos chose guard",
                        payload={"asset_id": "mona-lisa"},
                    ),
                ),
                raw_response="test",
            )

    clock = FakeClock(100.0)
    engine, registry = _new_multi_engine(clock, cosmos_assignment_enabled=True)
    registry.register_robot("robot0", RobotType.QUADRUPED)
    registry.register_robot("robot1", RobotType.HUMANOID)
    registry.update_readiness("robot1", RobotReadiness.READY, nav2_ready=True)

    client = FakeAssignmentClient()
    engine.set_assignment_client(client)

    engine.ingest_event(_event("intruder-1", event_type="intruder_detected", severity="high"))
    tasks = engine.tick()

    assert client.called is True
    assert len(tasks) == 2
    task_map = {t.robot_id: t for t in tasks}
    assert task_map["robot0"].task_type == "PURSUE_THIEF"
    assert task_map["robot1"].task_type == "GUARD_ASSET"

    stats = engine.get_stats()
    assert stats["cosmos_assignment_attempts"] == 1
    assert stats["cosmos_assignment_successes"] == 1


def test_multi_robot_cosmos_fallback_to_deterministic() -> None:
    class FailingAssignmentClient:
        def assign(self, event_summary, robot_states, timeout_s):  # noqa: ANN001
            raise RuntimeError("cosmos down")

    clock = FakeClock(100.0)
    engine, registry = _new_multi_engine(clock, cosmos_assignment_enabled=True)
    registry.register_robot("robot0", RobotType.QUADRUPED)
    registry.register_robot("robot1", RobotType.HUMANOID)
    registry.update_readiness("robot1", RobotReadiness.READY, nav2_ready=True)
    engine.set_assignment_client(FailingAssignmentClient())

    engine.ingest_event(_event("intruder-1", event_type="intruder_detected", severity="high"))
    tasks = engine.tick()

    assert len(tasks) == 2
    task_map = {t.robot_id: t for t in tasks}
    assert task_map["robot0"].task_type == "PURSUE_THIEF"
    assert task_map["robot1"].task_type == "BLOCK_EXIT"

    stats = engine.get_stats()
    assert stats["cosmos_assignment_attempts"] == 1
    assert stats["cosmos_assignment_fallbacks"] == 1


def test_multi_robot_task_completion_clears_registry() -> None:
    clock = FakeClock(100.0)
    engine, registry = _new_multi_engine(clock)
    registry.register_robot("robot0", RobotType.QUADRUPED)

    engine.ingest_event(_event("intruder-1", event_type="intruder_detected", severity="high"))
    tasks = engine.tick()
    assert len(tasks) == 1
    task_id = tasks[0].task_id

    robot_state = registry.get_robot("robot0")
    assert robot_state is not None
    assert robot_state.readiness == RobotReadiness.BUSY

    engine.update_task_status(task_id, "SUCCEEDED")

    robot_state = registry.get_robot("robot0")
    assert robot_state is not None
    assert robot_state.readiness == RobotReadiness.READY
    assert robot_state.active_task_id is None


def test_multi_robot_single_robot_mode_unchanged_when_disabled() -> None:
    clock = FakeClock(100.0)
    engine = _new_engine(clock, auto_approve_max_severity=1.0)
    engine.ingest_event(_event("test-1", severity="high"))
    tasks = engine.tick()
    assert len(tasks) == 1
    assert tasks[0].robot_id is None
    assert tasks[0].route == "deterministic"


def test_multi_robot_new_task_types_mapped() -> None:
    clock = FakeClock(100.0)
    engine = _new_engine(clock, auto_approve_max_severity=1.0, max_active_tasks=5)

    engine.ingest_event(_event("pursue-1", event_type="pursue_thief", severity="high"))
    tasks = engine.tick()
    assert tasks[0].task_type == "PURSUE_THIEF"

    clock.tick(61.0)
    engine.ingest_event(_event("block-1", event_type="block_exit", severity="high"))
    tasks = engine.tick()
    assert tasks[0].task_type == "BLOCK_EXIT"

    clock.tick(61.0)
    engine.ingest_event(_event("guard-1", event_type="guard_asset", severity="high"))
    tasks = engine.tick()
    assert tasks[0].task_type == "GUARD_ASSET"


def test_multi_robot_non_intruder_event_keeps_original_task_type() -> None:
    clock = FakeClock(100.0)
    engine, registry = _new_multi_engine(clock)
    registry.register_robot("robot0", RobotType.QUADRUPED)
    registry.register_robot("robot1", RobotType.HUMANOID)
    registry.update_readiness("robot1", RobotReadiness.READY, nav2_ready=True)

    engine.ingest_event(_event("blindspot-1", event_type="blindspot", severity="medium"))
    tasks = engine.tick()

    assert len(tasks) == 2
    for task in tasks:
        assert task.task_type == "INSPECT_BLINDSPOT"
