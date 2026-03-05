"""Pure-Python robot fleet registry for multi-robot coordination.

No ROS imports — fully unit-testable. Tracks robot positions, capabilities,
readiness, and active task assignments.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable
import time


class RobotType(str, Enum):
    QUADRUPED = "quadruped"
    HUMANOID = "humanoid"


class RobotReadiness(str, Enum):
    READY = "ready"
    BUSY = "busy"
    DEGRADED = "degraded"
    OFFLINE = "offline"


@dataclass(frozen=True)
class RobotCapabilities:
    can_pursue: bool = False
    can_block_exit: bool = False
    can_guard: bool = False
    can_inspect: bool = True
    can_patrol: bool = True
    max_speed_mps: float = 1.0
    nav2_ready: bool = True


@dataclass(frozen=True)
class RobotPosition:
    x: float = 0.0
    y: float = 0.0
    yaw: float = 0.0
    timestamp_s: float = 0.0


@dataclass(frozen=True)
class RobotState:
    robot_id: str
    robot_type: RobotType
    capabilities: RobotCapabilities
    readiness: RobotReadiness
    position: RobotPosition
    active_task_id: str | None = None
    last_heartbeat_s: float = 0.0


DEFAULT_CAPABILITIES: dict[RobotType, RobotCapabilities] = {
    RobotType.QUADRUPED: RobotCapabilities(
        can_pursue=True,
        can_block_exit=False,
        can_guard=False,
        can_inspect=True,
        can_patrol=True,
        max_speed_mps=3.5,
        nav2_ready=True,
    ),
    RobotType.HUMANOID: RobotCapabilities(
        can_pursue=False,
        can_block_exit=True,
        can_guard=True,
        can_inspect=True,
        can_patrol=True,
        max_speed_mps=1.2,
        nav2_ready=False,
    ),
}

_HEARTBEAT_TIMEOUT_S = 30.0


class RobotRegistry:
    """Tracks fleet state for multi-robot coordination."""

    def __init__(
        self,
        now_fn: Callable[[], float] | None = None,
        heartbeat_timeout_s: float = _HEARTBEAT_TIMEOUT_S,
    ) -> None:
        self._now = now_fn or time.time
        self._heartbeat_timeout_s = max(1.0, float(heartbeat_timeout_s))
        self._robots: dict[str, RobotState] = {}

    def register_robot(
        self,
        robot_id: str,
        robot_type: RobotType,
        capabilities: RobotCapabilities | None = None,
    ) -> RobotState:
        caps = capabilities or DEFAULT_CAPABILITIES.get(
            robot_type,
            RobotCapabilities(),
        )
        now = self._now()
        initial_readiness = (
            RobotReadiness.READY if caps.nav2_ready else RobotReadiness.DEGRADED
        )
        state = RobotState(
            robot_id=robot_id,
            robot_type=robot_type,
            capabilities=caps,
            readiness=initial_readiness,
            position=RobotPosition(timestamp_s=now),
            last_heartbeat_s=now,
        )
        self._robots = {**self._robots, robot_id: state}
        return state

    def update_position(
        self,
        robot_id: str,
        x: float,
        y: float,
        yaw: float,
    ) -> RobotState | None:
        current = self._robots.get(robot_id)
        if current is None:
            return None

        now = self._now()
        updated = RobotState(
            robot_id=current.robot_id,
            robot_type=current.robot_type,
            capabilities=current.capabilities,
            readiness=current.readiness,
            position=RobotPosition(x=x, y=y, yaw=yaw, timestamp_s=now),
            active_task_id=current.active_task_id,
            last_heartbeat_s=now,
        )
        self._robots = {**self._robots, robot_id: updated}
        return updated

    def update_readiness(
        self,
        robot_id: str,
        readiness: RobotReadiness,
        nav2_ready: bool | None = None,
    ) -> RobotState | None:
        current = self._robots.get(robot_id)
        if current is None:
            return None

        caps = current.capabilities
        if nav2_ready is not None:
            caps = RobotCapabilities(
                can_pursue=caps.can_pursue,
                can_block_exit=caps.can_block_exit,
                can_guard=caps.can_guard,
                can_inspect=caps.can_inspect,
                can_patrol=caps.can_patrol,
                max_speed_mps=caps.max_speed_mps,
                nav2_ready=bool(nav2_ready),
            )

        updated = RobotState(
            robot_id=current.robot_id,
            robot_type=current.robot_type,
            capabilities=caps,
            readiness=readiness,
            position=current.position,
            active_task_id=current.active_task_id,
            last_heartbeat_s=self._now(),
        )
        self._robots = {**self._robots, robot_id: updated}
        return updated

    def assign_task(self, robot_id: str, task_id: str) -> RobotState | None:
        current = self._robots.get(robot_id)
        if current is None:
            return None

        updated = RobotState(
            robot_id=current.robot_id,
            robot_type=current.robot_type,
            capabilities=current.capabilities,
            readiness=RobotReadiness.BUSY,
            position=current.position,
            active_task_id=task_id,
            last_heartbeat_s=current.last_heartbeat_s,
        )
        self._robots = {**self._robots, robot_id: updated}
        return updated

    def clear_task(self, robot_id: str) -> RobotState | None:
        current = self._robots.get(robot_id)
        if current is None:
            return None

        updated = RobotState(
            robot_id=current.robot_id,
            robot_type=current.robot_type,
            capabilities=current.capabilities,
            readiness=RobotReadiness.READY,
            position=current.position,
            active_task_id=None,
            last_heartbeat_s=current.last_heartbeat_s,
        )
        self._robots = {**self._robots, robot_id: updated}
        return updated

    def get_robot(self, robot_id: str) -> RobotState | None:
        return self._robots.get(robot_id)

    def get_available_robots(self) -> list[RobotState]:
        now = self._now()
        self._recover_stale_busy_robots(now)
        available: list[RobotState] = []
        for state in self._robots.values():
            if state.readiness != RobotReadiness.READY:
                continue
            if (now - state.last_heartbeat_s) > self._heartbeat_timeout_s:
                continue
            available.append(state)
        return sorted(available, key=lambda s: s.robot_id)

    def _recover_stale_busy_robots(self, now: float) -> None:
        busy_timeout_s = self._heartbeat_timeout_s * 2
        for robot_id, state in list(self._robots.items()):
            if state.readiness != RobotReadiness.BUSY:
                continue
            if state.active_task_id is None:
                self.clear_task(robot_id)
                continue
            if (now - state.last_heartbeat_s) > busy_timeout_s:
                self.clear_task(robot_id)

    def get_all_robots(self) -> list[RobotState]:
        return sorted(self._robots.values(), key=lambda s: s.robot_id)

    def get_robots_capable_of(self, task_type: str) -> list[RobotState]:
        capability_map: dict[str, str] = {
            "PURSUE_THIEF": "can_pursue",
            "BLOCK_EXIT": "can_block_exit",
            "GUARD_ASSET": "can_guard",
            "INSPECT_POI": "can_inspect",
            "INSPECT_BLINDSPOT": "can_inspect",
            "INVESTIGATE_ALERT": "can_inspect",
            "PATROL_ROUTE": "can_patrol",
        }
        attr = capability_map.get(task_type.strip().upper())
        if attr is None:
            return list(self._robots.values())

        return [
            state
            for state in self._robots.values()
            if getattr(state.capabilities, attr, False)
        ]

    def snapshot(self) -> dict[str, Any]:
        robots_data: list[dict[str, Any]] = []
        for state in sorted(self._robots.values(), key=lambda s: s.robot_id):
            robots_data.append({
                "robot_id": state.robot_id,
                "robot_type": state.robot_type.value,
                "readiness": state.readiness.value,
                "position": {
                    "x": state.position.x,
                    "y": state.position.y,
                    "yaw": state.position.yaw,
                },
                "active_task_id": state.active_task_id,
                "nav2_ready": state.capabilities.nav2_ready,
                "last_heartbeat_s": state.last_heartbeat_s,
            })
        return {
            "robot_count": len(self._robots),
            "available_count": len(self.get_available_robots()),
            "robots": robots_data,
        }
