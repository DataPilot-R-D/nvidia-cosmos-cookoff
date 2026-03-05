"""Cosmos-based multi-robot task assignment client.

Follows the same HTTP pattern as ``cosmos_intruder_reasoner.py`` — uses
``urllib.request`` for zero external dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
from typing import Any
from urllib import error, request


@dataclass(frozen=True)
class RobotAssignment:
    robot_id: str
    task_type: str
    priority: float
    reasoning: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class AssignmentPlan:
    assignments: tuple[RobotAssignment, ...]
    raw_response: str


class CosmosAssignmentReasonerClient:
    """HTTP client for Cosmos-based multi-robot task assignment."""

    def __init__(
        self,
        api_base: str,
        model: str,
        api_key: str | None = None,
        max_retries: int = 1,
    ) -> None:
        normalized = api_base.rstrip("/")
        if normalized.endswith("/v1"):
            normalized = normalized[:-3]
        self.api_base = normalized
        self.model = model
        self.api_key = api_key or os.getenv("COSMOS_API_KEY", "")
        self.max_retries = max(0, int(max_retries))
        if not self.api_base:
            raise ValueError("api_base must not be empty")

    def assign(
        self,
        event_summary: dict[str, Any],
        robot_states: list[dict[str, Any]],
        timeout_s: float = 3.0,
    ) -> AssignmentPlan:
        endpoint = f"{self.api_base}/v1/chat/completions"
        prompt = self._build_prompt(event_summary, robot_states)
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        body = json.dumps(payload).encode("utf-8")

        last_error: Exception | None = None
        for _ in range(self.max_retries + 1):
            req = request.Request(endpoint, data=body, headers=headers, method="POST")
            try:
                with request.urlopen(req, timeout=timeout_s) as response:
                    raw = response.read().decode("utf-8")
                    parsed = json.loads(raw)
                    content = parsed["choices"][0]["message"]["content"]
                    return self._parse_plan(content)
            except (error.URLError, error.HTTPError, KeyError, IndexError, ValueError) as exc:
                last_error = exc

        raise RuntimeError(f"Cosmos assignment reasoner failed: {last_error}")

    @staticmethod
    def _build_prompt(
        event_summary: dict[str, Any],
        robot_states: list[dict[str, Any]],
    ) -> str:
        parts = [
            "Assign robots to handle the following security event.",
            f"event={json.dumps(event_summary, ensure_ascii=True)}",
            f"fleet={json.dumps(robot_states, ensure_ascii=True)}",
            "Return JSON only.",
        ]
        return "\n".join(parts)

    @staticmethod
    def _parse_plan(content: str) -> AssignmentPlan:
        stripped = content.strip()
        if stripped.startswith("```json"):
            stripped = stripped[7:]
        if stripped.startswith("```"):
            stripped = stripped[3:]
        if stripped.endswith("```"):
            stripped = stripped[:-3]
        parsed = json.loads(stripped.strip())
        if not isinstance(parsed, dict):
            raise ValueError("Response is not a JSON object")

        raw_assignments = parsed.get("assignments", [])
        if not isinstance(raw_assignments, list):
            raise ValueError("assignments must be a list")

        assignments: list[RobotAssignment] = []
        for entry in raw_assignments:
            if not isinstance(entry, dict):
                continue
            assignments.append(
                RobotAssignment(
                    robot_id=str(entry.get("robot_id", "")),
                    task_type=str(entry.get("task_type", "INVESTIGATE_ALERT")),
                    priority=float(entry.get("priority", 0.5)),
                    reasoning=str(entry.get("reasoning", "")),
                    payload=entry.get("payload", {}),
                )
            )

        return AssignmentPlan(
            assignments=tuple(assignments),
            raw_response=content,
        )


_SYSTEM_PROMPT = (
    "You are a multi-robot museum security coordinator. "
    "Given a security event and the current fleet state (robot positions, capabilities, readiness), "
    "assign each available robot an optimal task. "
    "Return compact JSON with key: assignments (list of objects with robot_id, task_type, "
    "priority (0.0-1.0), reasoning (brief), payload (dict with target coordinates if applicable)). "
    "Task types: PURSUE_THIEF (fast pursuit), BLOCK_EXIT (block escape routes), "
    "GUARD_ASSET (protect valuable items), INVESTIGATE_ALERT (general investigation). "
    "Assign quadruped robots to PURSUE_THIEF tasks and humanoid robots to BLOCK_EXIT tasks when possible."
)
