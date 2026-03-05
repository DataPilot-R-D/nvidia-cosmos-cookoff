from __future__ import annotations

import json
import uuid
from dataclasses import asdict, dataclass


@dataclass
class PatrolRoute:
    route_id: str
    waypoints: list[tuple[float, float, float]]
    description: str
    loop: bool = True


@dataclass
class PatrolSchedule:
    route: PatrolRoute
    interval_s: float
    priority: int = 2
    auto_approved: bool = True
    timeout_s: float = 300.0


@dataclass
class PatrolState:
    schedule: PatrolSchedule
    last_dispatched_s: float
    patrol_count: int
    is_paused: bool


DEFAULT_WAREHOUSE_ROUTE = PatrolRoute(
    route_id="warehouse_periodic_route",
    waypoints=[
        (2.0, 2.0, 0.45),
        (4.0, 3.8, 0.45),
        (8.2, 3.8, 0.45),
        (10.5, 1.2, 0.45),
        (8.2, -2.8, 0.45),
        (3.0, -1.8, 0.45),
    ],
    description="Periodic warehouse perimeter patrol route.",
    loop=True,
)


def should_dispatch(state: PatrolState, now_s: float, nav_ready: bool) -> bool:
    if not nav_ready or state.is_paused:
        return False

    elapsed_s = float(now_s) - float(state.last_dispatched_s)
    return elapsed_s >= float(state.schedule.interval_s)


def create_patrol_task(state: PatrolState, now_s: float) -> dict:
    waypoint_payload = [
        {"x": float(x), "y": float(y), "z": float(z)} for x, y, z in state.schedule.route.waypoints
    ]

    target_pose = waypoint_payload[0] if waypoint_payload else {"x": 0.0, "y": 0.0, "z": 0.0}

    task = {
        "header": {},
        "task_id": str(uuid.uuid4()),
        "task_type": 2,
        "priority": int(state.schedule.priority),
        "target_pose": target_pose,
        "waypoints": waypoint_payload,
        "description": state.schedule.route.description,
        "source_event_id": "patrol_scheduler",
        "timeout_s": float(state.schedule.timeout_s),
        "auto_approved": bool(state.schedule.auto_approved),
    }

    state.patrol_count += 1
    state.last_dispatched_s = float(now_s)

    return task


def patrol_state_to_json(state: PatrolState) -> str:
    return json.dumps(asdict(state), sort_keys=True)


def json_to_patrol_state(json_str: str) -> PatrolState:
    payload = json.loads(json_str)

    route_payload = payload["schedule"]["route"]
    waypoints = [
        (float(wp[0]), float(wp[1]), float(wp[2]))
        for wp in route_payload.get("waypoints", [])
    ]

    route = PatrolRoute(
        route_id=str(route_payload.get("route_id", "")),
        waypoints=waypoints,
        description=str(route_payload.get("description", "")),
        loop=bool(route_payload.get("loop", True)),
    )

    schedule_payload = payload["schedule"]
    schedule = PatrolSchedule(
        route=route,
        interval_s=float(schedule_payload.get("interval_s", 0.0)),
        priority=int(schedule_payload.get("priority", 2)),
        auto_approved=bool(schedule_payload.get("auto_approved", True)),
        timeout_s=float(schedule_payload.get("timeout_s", 300.0)),
    )

    return PatrolState(
        schedule=schedule,
        last_dispatched_s=float(payload.get("last_dispatched_s", 0.0)),
        patrol_count=int(payload.get("patrol_count", 0)),
        is_paused=bool(payload.get("is_paused", False)),
    )
