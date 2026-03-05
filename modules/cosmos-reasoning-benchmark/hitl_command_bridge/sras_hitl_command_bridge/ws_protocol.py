from __future__ import annotations

import json
import time
from typing import Any

from .hitl_command_core import CommandRequest, TaskCommand, command_to_json

WS_MSG_COMMAND = "task_command"
WS_MSG_STATUS = "task_status_update"
WS_MSG_ALERT = "operator_alert"
WS_MSG_RESULT = "command_result"


def wrap_ws_message(msg_type: str, payload: dict[str, Any]) -> str:
    return json.dumps({"type": msg_type, "payload": payload})


def unwrap_ws_message(raw: str) -> tuple[str, dict[str, Any]]:
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ValueError("websocket message must be a JSON object")

    msg_type = str(parsed.get("type", "")).strip()
    payload = parsed.get("payload", {})
    if not msg_type:
        raise ValueError("missing message type")
    if not isinstance(payload, dict):
        raise ValueError("message payload must be a JSON object")

    return msg_type, payload


def create_command_message(task_id: str, command: int | TaskCommand, reason: str, operator_id: str) -> str:
    command_value = TaskCommand(int(command))
    request = CommandRequest(
        task_id=task_id,
        command=command_value,
        reason=reason,
        operator_id=operator_id,
        timestamp_s=time.time(),
    )
    command_payload = json.loads(command_to_json(request))
    return wrap_ws_message(WS_MSG_COMMAND, command_payload)


def create_status_message(task_states: list[dict[str, Any]]) -> str:
    return wrap_ws_message(WS_MSG_STATUS, {"task_states": task_states})
