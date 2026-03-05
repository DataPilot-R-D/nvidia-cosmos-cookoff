"""Tool plan execution tests for surveillance agent V3."""

from __future__ import annotations

from src.agents.v3.tools import execute_tool_plan


def test_execute_tool_plan_runs_known_tool() -> None:
    calls: list[str] = []

    def describe_scene(description: str) -> dict[str, str]:
        calls.append(description)
        return {"logged": True, "description": description}

    plan = '{"actions":[{"tool":"describe_scene","args":{"description":"all clear"}}]}'
    result = execute_tool_plan(plan, tool_registry={"describe_scene": describe_scene})

    assert calls == ["all clear"]
    assert result == [
        {
            "tool": "describe_scene",
            "status": "executed",
            "output": {"logged": True, "description": "all clear"},
        }
    ]


def test_execute_tool_plan_rejects_unknown_tool() -> None:
    plan = '{"actions":[{"tool":"unknown_tool","args":{"x":1}}]}'
    result = execute_tool_plan(plan, tool_registry={})

    assert result == [
        {
            "tool": "unknown_tool",
            "status": "rejected",
            "reason": "unknown_tool",
        }
    ]


def test_execute_tool_plan_rejects_invalid_arguments() -> None:
    def check_window_status(window_id: str = "main") -> dict[str, str]:
        return {"window_id": window_id, "status": "closed"}

    plan = '{"actions":[{"tool":"check_window_status","args":{"window_id":"main","extra":"x"}}]}'
    result = execute_tool_plan(plan, tool_registry={"check_window_status": check_window_status})

    assert result == [
        {
            "tool": "check_window_status",
            "status": "rejected",
            "reason": "invalid_arguments",
        }
    ]


def test_execute_tool_plan_handles_malformed_json() -> None:
    result = execute_tool_plan("not-json", tool_registry={})

    assert result == [{"status": "parse_error", "reason": "invalid_json"}]
