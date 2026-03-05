"""Cosmos-backed optional deep planning client."""

from __future__ import annotations

from dataclasses import asdict
import json
import os
from typing import Any
from urllib import error, request

from .planner_core import PlannerEvent


class CosmosDeepPlannerClient:
    """HTTP client for optional deep planning path."""

    def __init__(
        self,
        api_base: str,
        model: str,
        api_key: str | None = None,
        use_reasoning: bool = False,
        max_retries: int = 1,
    ) -> None:
        normalized = api_base.rstrip("/")
        if normalized.endswith("/v1"):
            normalized = normalized[:-3]
        self.api_base = normalized
        self.model = model
        self.api_key = api_key or os.getenv("COSMOS_API_KEY", "")
        self.use_reasoning = use_reasoning
        self.max_retries = max(0, int(max_retries))
        if not self.api_base:
            raise ValueError("api_base must not be empty")

    def plan(self, event: PlannerEvent, timeout_s: float = 3.0) -> dict[str, Any]:
        endpoint = f"{self.api_base}/v1/chat/completions"
        prompt = self._prompt_for_event(event)
        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You are a robot task planner. Return compact JSON with keys: "
                        "task_type, priority, payload."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        body = json.dumps(payload).encode("utf-8")
        req = request.Request(endpoint, data=body, headers=headers, method="POST")

        last_error: Exception | None = None
        for _ in range(self.max_retries + 1):
            try:
                with request.urlopen(req, timeout=timeout_s) as response:
                    raw = response.read().decode("utf-8")
                    parsed = json.loads(raw)
                    content = parsed["choices"][0]["message"]["content"]
                    return self._parse_content(content)
            except (error.URLError, error.HTTPError, KeyError, IndexError, ValueError) as exc:
                last_error = exc

        raise RuntimeError(f"Cosmos deep planner failed: {last_error}")

    def _prompt_for_event(self, event: PlannerEvent) -> str:
        envelope = asdict(event)
        mode = "deep" if self.use_reasoning else "fast"
        return (
            "Create a task suggestion for this warehouse security event.\n"
            f"mode={mode}\n"
            f"event={json.dumps(envelope, ensure_ascii=True)}\n"
            "Output JSON only."
        )

    @staticmethod
    def _parse_content(content: str) -> dict[str, Any]:
        stripped = content.strip()
        if stripped.startswith("```json"):
            stripped = stripped[7:]
        if stripped.startswith("```"):
            stripped = stripped[3:]
        if stripped.endswith("```"):
            stripped = stripped[:-3]
        parsed = json.loads(stripped.strip())
        if not isinstance(parsed, dict):
            raise ValueError("deep planner response is not an object")
        return parsed
