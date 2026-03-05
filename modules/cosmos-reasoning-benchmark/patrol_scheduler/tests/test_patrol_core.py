from sras_patrol_scheduler.patrol_core import (
    DEFAULT_WAREHOUSE_ROUTE,
    PatrolSchedule,
    PatrolState,
    create_patrol_task,
    json_to_patrol_state,
    patrol_state_to_json,
    should_dispatch,
)


def _make_state(
    interval_s: float = 120.0,
    last_dispatched_s: float = 0.0,
    is_paused: bool = False,
) -> PatrolState:
    schedule = PatrolSchedule(route=DEFAULT_WAREHOUSE_ROUTE, interval_s=interval_s)
    return PatrolState(
        schedule=schedule,
        last_dispatched_s=last_dispatched_s,
        patrol_count=0,
        is_paused=is_paused,
    )


def test_should_dispatch_when_ready_and_elapsed() -> None:
    state = _make_state(interval_s=120.0, last_dispatched_s=0.0)
    assert should_dispatch(state, now_s=121.0, nav_ready=True)


def test_should_not_dispatch_when_paused() -> None:
    state = _make_state(interval_s=120.0, last_dispatched_s=0.0, is_paused=True)
    assert not should_dispatch(state, now_s=121.0, nav_ready=True)


def test_should_not_dispatch_when_nav_not_ready() -> None:
    state = _make_state(interval_s=120.0, last_dispatched_s=0.0)
    assert not should_dispatch(state, now_s=121.0, nav_ready=False)


def test_should_not_dispatch_when_interval_not_elapsed() -> None:
    state = _make_state(interval_s=120.0, last_dispatched_s=100.0)
    assert not should_dispatch(state, now_s=150.0, nav_ready=True)


def test_create_patrol_task_fields() -> None:
    state = _make_state(interval_s=120.0, last_dispatched_s=0.0)
    task = create_patrol_task(state, now_s=500.0)

    assert isinstance(task["task_id"], str)
    assert task["task_type"] == 2
    assert task["priority"] == 2
    assert task["source_event_id"] == "patrol_scheduler"
    assert task["timeout_s"] == 300.0
    assert task["auto_approved"] is True
    assert len(task["waypoints"]) == 6
    assert task["waypoints"][0] == {"x": 2.0, "y": 2.0, "z": 0.45}


def test_create_patrol_task_increments_count() -> None:
    state = _make_state(interval_s=120.0, last_dispatched_s=0.0)
    create_patrol_task(state, now_s=250.0)

    assert state.patrol_count == 1
    assert state.last_dispatched_s == 250.0


def test_default_warehouse_route_has_6_waypoints() -> None:
    assert len(DEFAULT_WAREHOUSE_ROUTE.waypoints) == 6


def test_patrol_state_json_roundtrip() -> None:
    state = _make_state(interval_s=90.0, last_dispatched_s=40.0)
    state.patrol_count = 3
    state.is_paused = True

    encoded = patrol_state_to_json(state)
    decoded = json_to_patrol_state(encoded)

    assert decoded.schedule.route.route_id == state.schedule.route.route_id
    assert decoded.schedule.route.waypoints == state.schedule.route.waypoints
    assert decoded.schedule.route.description == state.schedule.route.description
    assert decoded.schedule.route.loop == state.schedule.route.loop
    assert decoded.schedule.interval_s == state.schedule.interval_s
    assert decoded.schedule.priority == state.schedule.priority
    assert decoded.schedule.auto_approved == state.schedule.auto_approved
    assert decoded.schedule.timeout_s == state.schedule.timeout_s
    assert decoded.last_dispatched_s == state.last_dispatched_s
    assert decoded.patrol_count == state.patrol_count
    assert decoded.is_paused == state.is_paused
