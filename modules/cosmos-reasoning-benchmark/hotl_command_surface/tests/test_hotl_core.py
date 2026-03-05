import json

from sras_hotl_command_surface.hotl_core import (
    CommandOutcome,
    HOTLCommand,
    TaskLifecycleState,
    compute_allowed_commands,
    create_command_payload,
    outcome_to_json,
    task_status_to_view,
    validate_command,
)


def test_compute_allowed_commands_active() -> None:
    allowed = compute_allowed_commands(TaskLifecycleState.ACTIVE)

    assert allowed[HOTLCommand.PAUSE] is True
    assert allowed[HOTLCommand.STOP] is True
    assert allowed[HOTLCommand.RESUME] is False
    assert allowed[HOTLCommand.REDEFINE] is False


def test_compute_allowed_commands_paused() -> None:
    allowed = compute_allowed_commands(TaskLifecycleState.PAUSED)

    assert allowed[HOTLCommand.RESUME] is True
    assert allowed[HOTLCommand.STOP] is True
    assert allowed[HOTLCommand.REDEFINE] is True
    assert allowed[HOTLCommand.PAUSE] is False


def test_compute_allowed_commands_queued() -> None:
    allowed = compute_allowed_commands(TaskLifecycleState.QUEUED)

    assert allowed[HOTLCommand.STOP] is True
    assert allowed[HOTLCommand.REDEFINE] is True
    assert allowed[HOTLCommand.PAUSE] is False
    assert allowed[HOTLCommand.RESUME] is False


def test_compute_allowed_commands_completed() -> None:
    allowed = compute_allowed_commands(TaskLifecycleState.COMPLETED)

    assert all(value is False for value in allowed.values())


def test_validate_command_pause_active() -> None:
    valid, message = validate_command(HOTLCommand.PAUSE, TaskLifecycleState.ACTIVE)

    assert valid is True
    assert message == "ok"


def test_validate_command_pause_paused() -> None:
    valid, message = validate_command(HOTLCommand.PAUSE, TaskLifecycleState.PAUSED)

    assert valid is False
    assert "invalid" in message


def test_validate_command_redefine_active() -> None:
    valid, message = validate_command(HOTLCommand.REDEFINE, TaskLifecycleState.ACTIVE)

    assert valid is False
    assert "pause task first" in message


def test_create_command_payload_stop() -> None:
    payload = create_command_payload(task_id="task-1", command=HOTLCommand.STOP, reason="unsafe")

    assert payload["task_id"] == "task-1"
    assert payload["command"] == int(HOTLCommand.STOP)
    assert payload["requested_state"] == 1
    assert payload["reason"] == "unsafe"


def test_task_status_to_view_with_commands() -> None:
    view = task_status_to_view(
        {
            "task_id": "task-42",
            "status": int(TaskLifecycleState.PAUSED),
            "progress_pct": 51.0,
            "status_message": "paused by operator",
            "timestamp_updated_s": 1234.5,
        }
    )

    assert view.task_id == "task-42"
    assert view.state == TaskLifecycleState.PAUSED
    assert view.can_pause is False
    assert view.can_resume is True
    assert view.can_stop is True
    assert view.can_redefine is True


def test_outcome_to_json() -> None:
    outcome = CommandOutcome(
        task_id="task-99",
        command=HOTLCommand.RESUME,
        success=True,
        message="resumed",
        resulting_state=int(TaskLifecycleState.ACTIVE),
        timestamp_s=100.0,
    )

    parsed = json.loads(outcome_to_json(outcome))

    assert parsed["task_id"] == "task-99"
    assert parsed["command"] == int(HOTLCommand.RESUME)
    assert parsed["success"] is True
    assert parsed["resulting_state"] == int(TaskLifecycleState.ACTIVE)
