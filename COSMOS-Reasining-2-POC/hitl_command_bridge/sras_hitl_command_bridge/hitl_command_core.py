from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from enum import IntEnum
from typing import Any


class TaskCommand(IntEnum):
    APPROVE = 0
    CANCEL = 1
    PAUSE = 2
    RESUME = 3


@dataclass(slots=True)
class CommandRequest:
    task_id: str
    command: TaskCommand
    reason: str
    operator_id: str
    timestamp_s: float


@dataclass(slots=True)
class CommandResponse:
    success: bool
    message: str
    current_state: int
    task_id: str


@dataclass(slots=True)
class TaskStateView:
    task_id: str
    status: int
    progress_pct: float
    status_message: str
    last_updated_s: float


STATUS_NAMES: dict[int, str] = {
    0: "QUEUED",
    1: "APPROVED",
    2: "DISPATCHED",
    3: "ACTIVE",
    4: "PAUSED",
    5: "COMPLETED",
    6: "FAILED",
    7: "CANCELED",
    8: "TIMED_OUT",
}


def validate_command(request: CommandRequest) -> tuple[bool, str]:
    if not request.task_id.strip():
        return False, "task_id must not be empty"
    if int(request.command) not in {entry.value for entry in TaskCommand}:
        return False, "command must be one of APPROVE(0), CANCEL(1), PAUSE(2), RESUME(3)"
    return True, "ok"


def command_to_json(request: CommandRequest) -> str:
    payload = asdict(request)
    payload["command"] = int(request.command)
    return json.dumps(payload)


def json_to_command(json_str: str) -> CommandRequest:
    raw = json.loads(json_str)
    if not isinstance(raw, dict):
        raise ValueError("command payload must be a JSON object")

    return CommandRequest(
        task_id=str(raw.get("task_id", "")),
        command=TaskCommand(int(raw.get("command"))),
        reason=str(raw.get("reason", "")),
        operator_id=str(raw.get("operator_id", "")),
        timestamp_s=float(raw.get("timestamp_s", 0.0)),
    )


def response_to_json(response: CommandResponse) -> str:
    return json.dumps(asdict(response))


def task_status_to_view(status_dict: dict[str, Any]) -> TaskStateView:
    return TaskStateView(
        task_id=str(status_dict.get("task_id", "")),
        status=int(status_dict.get("status", 0)),
        progress_pct=float(status_dict.get("progress_pct", 0.0)),
        status_message=str(status_dict.get("status_message", "")),
        last_updated_s=float(status_dict.get("timestamp_updated_s", 0.0)),
    )
