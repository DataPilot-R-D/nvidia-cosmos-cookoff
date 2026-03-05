from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from enum import IntEnum


class ReadinessStatus(IntEnum):
    NOT_READY = 0
    MAP_LOADING = 1
    LOCALIZING = 2
    READY = 3
    DEGRADED = 4


@dataclass
class ReadinessCheck:
    check_name: str
    passed: bool
    message: str
    timestamp_s: float


@dataclass
class ReadinessState:
    status: ReadinessStatus
    checks: list[ReadinessCheck]
    map_received: bool
    tf_valid: bool
    nav2_active: bool
    last_updated_s: float


STATUS_NAMES: dict[ReadinessStatus, str] = {
    ReadinessStatus.NOT_READY: "Not Ready",
    ReadinessStatus.MAP_LOADING: "Map Loading",
    ReadinessStatus.LOCALIZING: "Localizing",
    ReadinessStatus.READY: "Ready",
    ReadinessStatus.DEGRADED: "Degraded",
}


def evaluate_readiness(
    map_received: bool,
    tf_valid: bool,
    nav2_active: bool,
    map_age_s: float,
    tf_age_s: float,
    max_map_age_s: float = 300.0,
    max_tf_age_s: float = 5.0,
) -> ReadinessState:
    now_s = max(float(map_age_s), float(tf_age_s), 0.0)

    map_fresh = bool(map_received) and float(map_age_s) <= float(max_map_age_s)
    tf_fresh = bool(tf_valid) and float(tf_age_s) <= float(max_tf_age_s)
    nav_ok = bool(nav2_active)

    checks = [
        ReadinessCheck(
            check_name="map_received_and_fresh",
            passed=map_fresh,
            message=(
                f"map_received={map_received}, map_age_s={float(map_age_s):.2f}, "
                f"max_map_age_s={float(max_map_age_s):.2f}"
            ),
            timestamp_s=now_s,
        ),
        ReadinessCheck(
            check_name="tf_valid_and_fresh",
            passed=tf_fresh,
            message=(
                f"tf_valid={tf_valid}, tf_age_s={float(tf_age_s):.2f}, "
                f"max_tf_age_s={float(max_tf_age_s):.2f}"
            ),
            timestamp_s=now_s,
        ),
        ReadinessCheck(
            check_name="nav2_active",
            passed=nav_ok,
            message=f"nav2_active={nav2_active}",
            timestamp_s=now_s,
        ),
    ]

    all_received = bool(map_received) and bool(tf_valid) and bool(nav2_active)
    all_fresh = map_fresh and tf_fresh and nav_ok

    if all_fresh:
        status = ReadinessStatus.READY
    elif all_received:
        status = ReadinessStatus.DEGRADED
    elif not map_received:
        status = ReadinessStatus.MAP_LOADING
    elif map_received and not tf_valid:
        status = ReadinessStatus.LOCALIZING
    else:
        status = ReadinessStatus.NOT_READY

    return ReadinessState(
        status=status,
        checks=checks,
        map_received=bool(map_received),
        tf_valid=bool(tf_valid),
        nav2_active=bool(nav2_active),
        last_updated_s=now_s,
    )


def readiness_to_json(state: ReadinessState) -> str:
    payload = asdict(state)
    payload["status"] = int(state.status)
    return json.dumps(payload, sort_keys=True)


def json_to_readiness(json_str: str) -> ReadinessState:
    payload = json.loads(json_str)

    checks = [
        ReadinessCheck(
            check_name=str(item["check_name"]),
            passed=bool(item["passed"]),
            message=str(item["message"]),
            timestamp_s=float(item["timestamp_s"]),
        )
        for item in payload.get("checks", [])
    ]

    return ReadinessState(
        status=ReadinessStatus(int(payload["status"])),
        checks=checks,
        map_received=bool(payload.get("map_received", False)),
        tf_valid=bool(payload.get("tf_valid", False)),
        nav2_active=bool(payload.get("nav2_active", False)),
        last_updated_s=float(payload.get("last_updated_s", 0.0)),
    )
