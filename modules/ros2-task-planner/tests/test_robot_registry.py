import pytest

from sras_robot_task_planner.robot_registry import (
    DEFAULT_CAPABILITIES,
    RobotCapabilities,
    RobotPosition,
    RobotReadiness,
    RobotRegistry,
    RobotState,
    RobotType,
)


class FakeClock:
    def __init__(self, start: float = 0.0) -> None:
        self.now = start

    def tick(self, delta: float) -> None:
        self.now += delta

    def __call__(self) -> float:
        return self.now


def _registry(clock: FakeClock, **kwargs) -> RobotRegistry:
    return RobotRegistry(now_fn=clock, **kwargs)


# --- Frozen dataclass immutability ---


class TestFrozenDataclasses:
    def test_robot_capabilities_is_frozen(self) -> None:
        caps = RobotCapabilities(can_pursue=True)
        with pytest.raises(AttributeError):
            caps.can_pursue = False  # type: ignore[misc]

    def test_robot_position_is_frozen(self) -> None:
        pos = RobotPosition(x=1.0, y=2.0)
        with pytest.raises(AttributeError):
            pos.x = 3.0  # type: ignore[misc]

    def test_robot_state_is_frozen(self) -> None:
        state = RobotState(
            robot_id="r0",
            robot_type=RobotType.QUADRUPED,
            capabilities=RobotCapabilities(),
            readiness=RobotReadiness.READY,
            position=RobotPosition(),
        )
        with pytest.raises(AttributeError):
            state.readiness = RobotReadiness.BUSY  # type: ignore[misc]


# --- Registration ---


class TestRegistration:
    def test_register_robot_with_defaults(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        state = reg.register_robot("robot0", RobotType.QUADRUPED)

        assert state.robot_id == "robot0"
        assert state.robot_type == RobotType.QUADRUPED
        assert state.capabilities.can_pursue is True
        assert state.capabilities.max_speed_mps == 3.5
        assert state.readiness == RobotReadiness.READY
        assert state.last_heartbeat_s == 100.0

    def test_register_humanoid_starts_degraded_when_nav2_not_ready(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        state = reg.register_robot("robot1", RobotType.HUMANOID)

        assert state.readiness == RobotReadiness.DEGRADED
        assert state.capabilities.nav2_ready is False
        assert state.capabilities.can_block_exit is True

    def test_register_with_custom_capabilities(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        custom = RobotCapabilities(
            can_pursue=True,
            can_block_exit=True,
            max_speed_mps=5.0,
            nav2_ready=True,
        )
        state = reg.register_robot("robot2", RobotType.QUADRUPED, capabilities=custom)

        assert state.capabilities.max_speed_mps == 5.0
        assert state.capabilities.can_block_exit is True
        assert state.readiness == RobotReadiness.READY

    def test_get_robot_returns_none_for_unknown(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        assert reg.get_robot("nonexistent") is None


# --- Position updates ---


class TestPositionUpdates:
    def test_update_position_creates_new_state(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        reg.register_robot("robot0", RobotType.QUADRUPED)

        clock.tick(1.0)
        updated = reg.update_position("robot0", x=1.5, y=2.5, yaw=0.5)

        assert updated is not None
        assert updated.position.x == 1.5
        assert updated.position.y == 2.5
        assert updated.position.yaw == 0.5
        assert updated.position.timestamp_s == 101.0
        assert updated.last_heartbeat_s == 101.0

    def test_update_position_unknown_robot_returns_none(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        assert reg.update_position("ghost", 0, 0, 0) is None


# --- Readiness updates ---


class TestReadinessUpdates:
    def test_update_readiness(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        reg.register_robot("robot1", RobotType.HUMANOID)

        updated = reg.update_readiness(
            "robot1",
            RobotReadiness.READY,
            nav2_ready=True,
        )

        assert updated is not None
        assert updated.readiness == RobotReadiness.READY
        assert updated.capabilities.nav2_ready is True

    def test_update_readiness_preserves_other_capabilities(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        reg.register_robot("robot1", RobotType.HUMANOID)

        updated = reg.update_readiness("robot1", RobotReadiness.READY, nav2_ready=True)
        assert updated is not None
        assert updated.capabilities.can_block_exit is True
        assert updated.capabilities.can_guard is True

    def test_update_readiness_unknown_robot_returns_none(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        assert reg.update_readiness("ghost", RobotReadiness.OFFLINE) is None


# --- Task assignment ---


class TestTaskAssignment:
    def test_assign_task_marks_busy(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        reg.register_robot("robot0", RobotType.QUADRUPED)

        updated = reg.assign_task("robot0", "task-abc")

        assert updated is not None
        assert updated.readiness == RobotReadiness.BUSY
        assert updated.active_task_id == "task-abc"

    def test_clear_task_marks_ready(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        reg.register_robot("robot0", RobotType.QUADRUPED)
        reg.assign_task("robot0", "task-abc")

        updated = reg.clear_task("robot0")

        assert updated is not None
        assert updated.readiness == RobotReadiness.READY
        assert updated.active_task_id is None

    def test_assign_unknown_robot_returns_none(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        assert reg.assign_task("ghost", "task-1") is None

    def test_clear_unknown_robot_returns_none(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        assert reg.clear_task("ghost") is None


# --- Availability filtering ---


class TestAvailability:
    def test_get_available_robots_excludes_busy(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        reg.register_robot("robot0", RobotType.QUADRUPED)
        reg.register_robot("robot1", RobotType.HUMANOID)
        reg.update_readiness("robot1", RobotReadiness.READY, nav2_ready=True)
        reg.assign_task("robot0", "task-1")

        available = reg.get_available_robots()
        assert len(available) == 1
        assert available[0].robot_id == "robot1"

    def test_get_available_robots_excludes_degraded(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        reg.register_robot("robot0", RobotType.QUADRUPED)
        reg.register_robot("robot1", RobotType.HUMANOID)

        available = reg.get_available_robots()
        assert len(available) == 1
        assert available[0].robot_id == "robot0"

    def test_get_available_robots_excludes_heartbeat_timeout(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock, heartbeat_timeout_s=10.0)
        reg.register_robot("robot0", RobotType.QUADRUPED)

        clock.tick(11.0)
        available = reg.get_available_robots()
        assert len(available) == 0

    def test_position_update_refreshes_heartbeat(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock, heartbeat_timeout_s=10.0)
        reg.register_robot("robot0", RobotType.QUADRUPED)

        clock.tick(9.0)
        reg.update_position("robot0", 1.0, 2.0, 0.0)

        clock.tick(5.0)
        available = reg.get_available_robots()
        assert len(available) == 1


# --- Capability filtering ---


class TestCapabilityFiltering:
    def test_get_robots_capable_of_pursue(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        reg.register_robot("robot0", RobotType.QUADRUPED)
        reg.register_robot("robot1", RobotType.HUMANOID)

        pursuers = reg.get_robots_capable_of("PURSUE_THIEF")
        assert len(pursuers) == 1
        assert pursuers[0].robot_id == "robot0"

    def test_get_robots_capable_of_block_exit(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        reg.register_robot("robot0", RobotType.QUADRUPED)
        reg.register_robot("robot1", RobotType.HUMANOID)

        blockers = reg.get_robots_capable_of("BLOCK_EXIT")
        assert len(blockers) == 1
        assert blockers[0].robot_id == "robot1"

    def test_get_robots_capable_of_inspect(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        reg.register_robot("robot0", RobotType.QUADRUPED)
        reg.register_robot("robot1", RobotType.HUMANOID)

        inspectors = reg.get_robots_capable_of("INVESTIGATE_ALERT")
        assert len(inspectors) == 2

    def test_unknown_task_type_returns_all_robots(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        reg.register_robot("robot0", RobotType.QUADRUPED)
        reg.register_robot("robot1", RobotType.HUMANOID)

        result = reg.get_robots_capable_of("UNKNOWN_TASK")
        assert len(result) == 2


# --- Snapshot ---


class TestSnapshot:
    def test_snapshot_structure(self) -> None:
        clock = FakeClock(100.0)
        reg = _registry(clock)
        reg.register_robot("robot0", RobotType.QUADRUPED)
        reg.register_robot("robot1", RobotType.HUMANOID)

        snap = reg.snapshot()
        assert snap["robot_count"] == 2
        assert snap["available_count"] == 1  # humanoid is degraded
        assert len(snap["robots"]) == 2
        assert snap["robots"][0]["robot_id"] == "robot0"
        assert snap["robots"][0]["robot_type"] == "quadruped"
        assert snap["robots"][0]["nav2_ready"] is True
        assert snap["robots"][1]["robot_id"] == "robot1"
        assert snap["robots"][1]["nav2_ready"] is False


# --- Default capabilities ---


class TestDefaultCapabilities:
    def test_quadruped_defaults(self) -> None:
        caps = DEFAULT_CAPABILITIES[RobotType.QUADRUPED]
        assert caps.can_pursue is True
        assert caps.can_block_exit is False
        assert caps.max_speed_mps == 3.5
        assert caps.nav2_ready is True

    def test_humanoid_defaults(self) -> None:
        caps = DEFAULT_CAPABILITIES[RobotType.HUMANOID]
        assert caps.can_pursue is False
        assert caps.can_block_exit is True
        assert caps.can_guard is True
        assert caps.max_speed_mps == 1.2
        assert caps.nav2_ready is False
