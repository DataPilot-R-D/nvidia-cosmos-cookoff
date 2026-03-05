import json

from sras_hitl_command_bridge.hitl_command_core import (
    STATUS_NAMES,
    CommandRequest,
    CommandResponse,
    TaskCommand,
    command_to_json,
    json_to_command,
    response_to_json,
    task_status_to_view,
    validate_command,
)


def test_validate_command_valid() -> None:
    request = CommandRequest(
        task_id="task-123",
        command=TaskCommand.APPROVE,
        reason="looks safe",
        operator_id="op-1",
        timestamp_s=123.4,
    )

    valid, message = validate_command(request)

    assert valid is True
    assert message == "ok"


def test_validate_command_empty_task_id() -> None:
    request = CommandRequest(
        task_id="   ",
        command=TaskCommand.CANCEL,
        reason="unsafe",
        operator_id="op-1",
        timestamp_s=123.4,
    )

    valid, message = validate_command(request)

    assert valid is False
    assert "task_id" in message


def test_command_json_roundtrip() -> None:
    request = CommandRequest(
        task_id="task-77",
        command=TaskCommand.PAUSE,
        reason="blocked aisle",
        operator_id="dispatcher-a",
        timestamp_s=42.0,
    )

    raw = command_to_json(request)
    loaded = json_to_command(raw)

    assert loaded.task_id == request.task_id
    assert loaded.command == request.command
    assert loaded.reason == request.reason
    assert loaded.operator_id == request.operator_id
    assert loaded.timestamp_s == request.timestamp_s


def test_response_to_json() -> None:
    response = CommandResponse(
        success=True,
        message="updated",
        current_state=3,
        task_id="task-88",
    )

    raw = response_to_json(response)
    parsed = json.loads(raw)

    assert parsed["success"] is True
    assert parsed["message"] == "updated"
    assert parsed["current_state"] == 3
    assert parsed["task_id"] == "task-88"


def test_task_status_to_view() -> None:
    view = task_status_to_view(
        {
            "task_id": "task-9",
            "status": 4,
            "progress_pct": 55.5,
            "status_message": "paused by operator",
            "timestamp_updated_s": 100.25,
        }
    )

    assert view.task_id == "task-9"
    assert view.status == 4
    assert view.progress_pct == 55.5
    assert view.status_message == "paused by operator"
    assert view.last_updated_s == 100.25


def test_status_names_complete() -> None:
    assert set(STATUS_NAMES.keys()) == set(range(9))
