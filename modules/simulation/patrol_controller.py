from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass
class PatrolCommand:
    vx: float
    vy: float
    yaw: float
    waypoint_index: int


class WaypointPatrolController:
    """Simple planar waypoint follower for scripted patrol demos."""

    def __init__(
        self,
        waypoints: list[tuple[float, float, float]],
        speed_mps: float = 0.7,
        position_tolerance_m: float = 0.35,
    ) -> None:
        if not waypoints:
            raise ValueError("At least one patrol waypoint is required.")
        self._waypoints = waypoints
        self._speed_mps = speed_mps
        self._tolerance = position_tolerance_m
        self._index = 0

    @property
    def active_waypoint(self) -> tuple[float, float, float]:
        return self._waypoints[self._index]

    def update(self, current_x: float, current_y: float) -> PatrolCommand:
        target_x, target_y, target_yaw = self._waypoints[self._index]
        dx = target_x - current_x
        dy = target_y - current_y
        distance = math.hypot(dx, dy)

        if distance <= self._tolerance:
            self._index = (self._index + 1) % len(self._waypoints)
            target_x, target_y, target_yaw = self._waypoints[self._index]
            dx = target_x - current_x
            dy = target_y - current_y
            distance = math.hypot(dx, dy)

        if distance < 1e-6:
            return PatrolCommand(vx=0.0, vy=0.0, yaw=target_yaw, waypoint_index=self._index)

        scale = self._speed_mps / distance
        return PatrolCommand(
            vx=dx * scale,
            vy=dy * scale,
            yaw=target_yaw,
            waypoint_index=self._index,
        )
