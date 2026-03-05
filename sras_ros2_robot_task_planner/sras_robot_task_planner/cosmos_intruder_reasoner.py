"""Cosmos Reason2 text-only threat assessment client.

Follows the same HTTP pattern as ``cosmos_deep_planner.py`` — uses
``urllib.request`` for zero external dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
import os
from typing import Any
from urllib import error, request

from .detection_buffer import SceneSummary


@dataclass(frozen=True)
class ThreatAssessment:
    threat_level: str
    reasoning: str
    target_position: dict[str, float] | None
    recommended_task: str
    confidence: float
    raw_response: str


class CosmosIntruderReasonerClient:
    """HTTP client for Cosmos Reason2 threat assessment."""

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

    def assess(
        self,
        summary: SceneSummary,
        robot_position: dict[str, float] | None = None,
        timeout_s: float = 3.0,
    ) -> ThreatAssessment:
        """Send scene summary to Cosmos and return a ThreatAssessment."""
        endpoint = f"{self.api_base}/v1/chat/completions"
        prompt = self._build_prompt(summary, robot_position)
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
        req = request.Request(endpoint, data=body, headers=headers, method="POST")

        last_error: Exception | None = None
        for _ in range(self.max_retries + 1):
            try:
                with request.urlopen(req, timeout=timeout_s) as response:
                    raw = response.read().decode("utf-8")
                    parsed = json.loads(raw)
                    content = parsed["choices"][0]["message"]["content"]
                    return self._parse_assessment(content)
            except (error.URLError, error.HTTPError, KeyError, IndexError, ValueError) as exc:
                last_error = exc

        raise RuntimeError(f"Cosmos intruder reasoner failed: {last_error}")

    def _build_prompt(
        self,
        summary: SceneSummary,
        robot_position: dict[str, float] | None,
    ) -> str:
        scene_data = {
            "class_counts": summary.class_counts,
            "class_positions": summary.class_positions,
            "buffer_duration_s": summary.buffer_duration_s,
            "snapshot_count": summary.snapshot_count,
            "latest_timestamp_s": summary.latest_timestamp_s,
        }
        parts = [
            "Assess the following security scene for threats.",
            f"scene={json.dumps(scene_data, ensure_ascii=True)}",
        ]
        if robot_position is not None:
            parts.append(f"robot_position={json.dumps(robot_position, ensure_ascii=True)}")
        parts.append("Return JSON only.")
        return "\n".join(parts)

    @staticmethod
    def _parse_assessment(content: str) -> ThreatAssessment:
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

        return ThreatAssessment(
            threat_level=str(parsed.get("threat_level", "unknown")),
            reasoning=str(parsed.get("reasoning", "")),
            target_position=parsed.get("target_position"),
            recommended_task=str(parsed.get("recommended_task", "INVESTIGATE_ALERT")),
            confidence=float(parsed.get("confidence", 0.5)),
            raw_response=content,
        )


_SYSTEM_PROMPT = (
    "You are a museum security threat assessment system. "
    "Analyze the provided scene detection data and assess the threat level. "
    "Return compact JSON with keys: threat_level (none/low/medium/high/critical), "
    "reasoning (brief explanation), target_position ({x, y} or null), "
    "recommended_task (INVESTIGATE_ALERT or NONE), confidence (0.0-1.0)."
)
