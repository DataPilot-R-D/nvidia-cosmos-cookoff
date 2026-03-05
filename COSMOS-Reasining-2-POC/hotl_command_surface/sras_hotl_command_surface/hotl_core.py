from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass
from enum import IntEnum
from typing import Any


class HOTLCommand(IntEnum):
    PAUSE = 0
    RESUME = 1
    STOP = 2
    REDEFINE = 3


HOTL_TO_SET_TASK_STATE: dict[HOTLCommand, int] = {
    HOTLCommand.PAUSE: 2,
    HOTLCommand.RESUME: 3,
    HOTLCommand.STOP: 1,
    HOTLCommand.REDEFINE: 1,
}


class TaskLifecycleState(IntEnum):
    QUEUED = 0
    APPROVED = 1
    DISPATCHED = 2
    ACTIVE = 3
    PAUSED = 4
    COMPLETED = 5
    FAILED = 6
    CANCELED = 7
    TIMED_OUT = 8


LIFECYCLE_NAMES: dict[int, str] = {
    TaskLifecycleState.QUEUED: "QUEUED",
    TaskLifecycleState.APPROVED: "APPROVED",
    TaskLifecycleState.DISPATCHED: "DISPATCHED",
    TaskLifecycleState.ACTIVE: "ACTIVE",
    TaskLifecycleState.PAUSED: "PAUSED",
    TaskLifecycleState.COMPLETED: "COMPLETED",
    TaskLifecycleState.FAILED: "FAILED",
    TaskLifecycleState.CANCELED: "CANCELED",
    TaskLifecycleState.TIMED_OUT: "TIMED_OUT",
}


@dataclass(slots=True)
class CommandOutcome:
    task_id: str
    command: HOTLCommand
    success: bool
    message: str
    resulting_state: int
    timestamp_s: float


@dataclass(slots=True)
class TaskView:
    task_id: str
    state: TaskLifecycleState
    progress_pct: float
    status_message: str
    last_updated_s: float
    can_pause: bool
    can_resume: bool
    can_stop: bool
    can_redefine: bool


def compute_allowed_commands(state: TaskLifecycleState) -> dict[HOTLCommand, bool]:
    return {
        HOTLCommand.PAUSE: state in {TaskLifecycleState.ACTIVE, TaskLifecycleState.DISPATCHED},
        HOTLCommand.RESUME: state == TaskLifecycleState.PAUSED,
        HOTLCommand.STOP: state
        in {
            TaskLifecycleState.ACTIVE,
            TaskLifecycleState.PAUSED,
            TaskLifecycleState.DISPATCHED,
            TaskLifecycleState.QUEUED,
            TaskLifecycleState.APPROVED,
        },
        HOTLCommand.REDEFINE: state in {TaskLifecycleState.QUEUED, TaskLifecycleState.PAUSED},
    }


def validate_command(command: HOTLCommand, task_state: TaskLifecycleState) -> tuple[bool, str]:
    allowed = compute_allowed_commands(task_state)
    if allowed.get(command, False):
        return True, "ok"

    current_name = LIFECYCLE_NAMES.get(int(task_state), "UNKNOWN")
    if command == HOTLCommand.REDEFINE and task_state == TaskLifecycleState.ACTIVE:
        return False, f"REDEFINE invalid in {current_name}; pause task first"

    return False, f"{command.name} invalid in {current_name}"


def create_command_payload(task_id: str, command: HOTLCommand, reason: str = "") -> dict[str, Any]:
    clean_task_id = task_id.strip()
    payload = {
        "task_id": clean_task_id,
        "command": int(command),
        "command_name": command.name,
        "requested_state": HOTL_TO_SET_TASK_STATE[command],
        "reason": reason,
        "timestamp_s": time.time(),
    }

    if command == HOTLCommand.REDEFINE:
        payload["redefine"] = True
    return payload


def task_status_to_view(status_dict: dict[str, Any]) -> TaskView:
    raw_state = int(status_dict.get("status", TaskLifecycleState.QUEUED))
    try:
        state = TaskLifecycleState(raw_state)
    except ValueError:
        state = TaskLifecycleState.QUEUED

    allowed = compute_allowed_commands(state)
    return TaskView(
        task_id=str(status_dict.get("task_id", "")),
        state=state,
        progress_pct=float(status_dict.get("progress_pct", 0.0)),
        status_message=str(status_dict.get("status_message", "")),
        last_updated_s=float(status_dict.get("timestamp_updated_s", 0.0)),
        can_pause=allowed[HOTLCommand.PAUSE],
        can_resume=allowed[HOTLCommand.RESUME],
        can_stop=allowed[HOTLCommand.STOP],
        can_redefine=allowed[HOTLCommand.REDEFINE],
    )


def outcome_to_json(outcome: CommandOutcome) -> str:
    payload = asdict(outcome)
    payload["command"] = int(outcome.command)
    payload["command_name"] = outcome.command.name
    payload["resulting_state_name"] = LIFECYCLE_NAMES.get(int(outcome.resulting_state), "UNKNOWN")
    return json.dumps(payload)


def view_to_json(view: TaskView) -> str:
    payload = asdict(view)
    payload["state"] = int(view.state)
    payload["state_name"] = LIFECYCLE_NAMES.get(int(view.state), "UNKNOWN")
    return json.dumps(payload)
