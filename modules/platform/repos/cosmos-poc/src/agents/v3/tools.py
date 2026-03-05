"""Safe JSON tool-plan execution for surveillance agent V3."""

from __future__ import annotations

import inspect
import json
from typing import Any, Callable


def execute_tool_plan(
    plan: str | dict[str, Any],
    tool_registry: dict[str, Callable[..., Any]],
) -> list[dict[str, Any]]:
    """Execute a JSON tool plan with deterministic rejection fallbacks."""
    parsed = _parse_plan(plan)
    if parsed is None:
        return [{"status": "parse_error", "reason": "invalid_json"}]

    actions = _extract_actions(parsed)
    if actions is None:
        return [{"status": "parse_error", "reason": "invalid_plan_format"}]

    results: list[dict[str, Any]] = []
    for action in actions:
        if not isinstance(action, dict):
            results.append({"status": "rejected", "reason": "invalid_action"})
            continue

        tool_name = action.get("tool")
        args = action.get("args", {})
        if not isinstance(tool_name, str) or not tool_name:
            results.append({"status": "rejected", "reason": "invalid_tool_name"})
            continue

        tool = tool_registry.get(tool_name)
        if tool is None:
            results.append({"tool": tool_name, "status": "rejected", "reason": "unknown_tool"})
            continue

        if not isinstance(args, dict) or not _arguments_are_valid(tool, args):
            results.append({"tool": tool_name, "status": "rejected", "reason": "invalid_arguments"})
            continue

        try:
            output = tool(**args)
        except TypeError:
            results.append({"tool": tool_name, "status": "rejected", "reason": "invalid_arguments"})
            continue
        except Exception:
            results.append({"tool": tool_name, "status": "rejected", "reason": "tool_execution_error"})
            continue

        results.append({"tool": tool_name, "status": "executed", "output": output})

    return results


def _parse_plan(plan: str | dict[str, Any]) -> dict[str, Any] | list[dict[str, Any]] | None:
    if isinstance(plan, dict):
        return plan
    if not isinstance(plan, str):
        return None
    try:
        parsed = json.loads(plan)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, dict) or isinstance(parsed, list):
        return parsed
    return None


def _extract_actions(parsed: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]] | None:
    if isinstance(parsed, list):
        return parsed
    actions = parsed.get("actions")
    if isinstance(actions, list):
        return actions
    return None


def _arguments_are_valid(tool: Callable[..., Any], args: dict[str, Any]) -> bool:
    signature = inspect.signature(tool)
    valid_parameters = {
        name
        for name, parameter in signature.parameters.items()
        if parameter.kind in {inspect.Parameter.POSITIONAL_OR_KEYWORD, inspect.Parameter.KEYWORD_ONLY}
    }
    return set(args.keys()).issubset(valid_parameters)
