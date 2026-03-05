import json

from sras_hitl_command_bridge.hitl_command_core import TaskCommand
from sras_hitl_command_bridge.ws_protocol import (
    WS_MSG_COMMAND,
    WS_MSG_STATUS,
    create_command_message,
    create_status_message,
    unwrap_ws_message,
    wrap_ws_message,
)


def test_wrap_unwrap_roundtrip() -> None:
    raw = wrap_ws_message("x", {"a": 1})

    msg_type, payload = unwrap_ws_message(raw)

    assert msg_type == "x"
    assert payload == {"a": 1}


def test_create_command_message() -> None:
    raw = create_command_message("task-1", TaskCommand.RESUME, "continue", "operator-7")
    msg_type, payload = unwrap_ws_message(raw)

    assert msg_type == WS_MSG_COMMAND
    assert payload["task_id"] == "task-1"
    assert payload["command"] == int(TaskCommand.RESUME)
    assert payload["reason"] == "continue"
    assert payload["operator_id"] == "operator-7"
    assert "timestamp_s" in payload


def test_create_status_message() -> None:
    states = [{"task_id": "t-1", "status": 3}, {"task_id": "t-2", "status": 4}]

    raw = create_status_message(states)
    msg_type, payload = unwrap_ws_message(raw)

    assert msg_type == WS_MSG_STATUS
    assert payload == {"task_states": states}

    parsed = json.loads(raw)
    assert parsed["payload"]["task_states"][0]["task_id"] == "t-1"
