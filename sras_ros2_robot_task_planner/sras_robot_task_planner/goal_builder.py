"""Build executor-compatible goal dicts with atan2 yaw calculation.

No ROS imports — pure utility module for unit testing.
"""

from __future__ import annotations

import math
from typing import Any


def build_goal_from_detection(
    target_x: float,
    target_y: float,
    robot_x: float | None,
    robot_y: float | None,
    frame_id: str = "map",
) -> dict[str, Any]:
    """Return a ``{x, y, z, yaw, frame_id}`` goal dict.

    Yaw is calculated via ``atan2`` so the robot faces the target.
    Falls back to ``yaw=0.0`` when the robot position is unknown or
    the robot and target are at the same position.
    """
    yaw = 0.0
    if robot_x is not None and robot_y is not None:
        dx = target_x - robot_x
        dy = target_y - robot_y
        if dx != 0.0 or dy != 0.0:
            yaw = math.atan2(dy, dx)

    return {
        "x": target_x,
        "y": target_y,
        "z": 0.0,
        "yaw": yaw,
        "frame_id": frame_id,
    }


def pick_target_position(
    cosmos_target: dict[str, float] | None,
    detection_positions: list[dict[str, float]] | None,
) -> tuple[float, float] | None:
    """Choose the best target position.

    Priority:
      1. Cosmos recommendation (``cosmos_target``)
      2. Centroid of ``detection_positions``
      3. ``None``
    """
    if cosmos_target is not None:
        return (cosmos_target["x"], cosmos_target["y"])

    if detection_positions:
        cx = sum(d["x"] for d in detection_positions) / len(detection_positions)
        cy = sum(d["y"] for d in detection_positions) / len(detection_positions)
        return (cx, cy)

    return None
