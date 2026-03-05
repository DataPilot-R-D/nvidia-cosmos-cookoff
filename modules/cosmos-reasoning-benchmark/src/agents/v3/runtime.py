"""Standalone V3 surveillance runtime with graph-driven routing."""

from __future__ import annotations

import asyncio
import base64
import binascii
import logging
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from src.connectors.cosmos_client import CosmosClient
from src.prompts.prompt_templates import C2PromptTemplates
from src.agents.v3.graph import SurveillanceGraphV3
from src.agents.v3.state import AgentState

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------
# Tool definitions
# ------------------------------------------------------------------

def check_window_status(window_id: str = "main") -> dict[str, str]:
    """Check whether a window is open or closed."""
    # TODO: integrate with SRAS sensor data
    return {"window_id": window_id, "status": "unknown", "source": "placeholder"}


def check_door_status(door_id: str = "front") -> dict[str, str]:
    """Check whether a door is open or closed."""
    return {"door_id": door_id, "status": "unknown", "source": "placeholder"}


def report_anomaly(description: str, severity: str = "medium") -> dict[str, Any]:
    """Report a detected anomaly to the monitoring system."""
    logger.warning("ANOMALY [%s]: %s", severity, description)
    return {"reported": True, "severity": severity, "description": description}


def describe_scene(description: str) -> dict[str, str]:
    """Persist a scene description for observability/auditing."""
    logger.info("SCENE: %s", description)
    return {"logged": True, "description": description}


TOOLS = [check_window_status, check_door_status, report_anomaly, describe_scene]


# ------------------------------------------------------------------
# Agent
# ------------------------------------------------------------------


@dataclass
class SurveillanceAgentV3:
    """Cosmos Reason2 surveillance runtime using V3 routing policy."""

    cosmos: CosmosClient
    context_history: list[dict[str, Any]] = field(default_factory=list)
    frame_queue: asyncio.Queue[str] = field(default_factory=asyncio.Queue)
    confidence_threshold: float = 0.6
    alert_cooldown_seconds: int = 30
    max_retries: int = 3
    retry_delay_seconds: float = 0.5
    last_alert_time: float = 0.0
    prompt_templates: C2PromptTemplates = field(default_factory=C2PromptTemplates)
    graph: SurveillanceGraphV3 = field(default_factory=SurveillanceGraphV3)

    def analyze_frame(self, image_data: str, context: str = "") -> dict[str, Any]:
        """Analyze a single frame/image for anomalies.

        This synchronous method is preserved for backward compatibility.

        Args:
            image_data: File path, URL, or base64-encoded JPEG.
            context: Additional context for the analysis prompt.

        Returns:
            Parsed result dictionary.
        """
        detect_cfg = self.prompt_templates.detect(context=context)
        prompt = detect_cfg["single_frame"]
        messages = self.prompt_templates.build_messages(
            prompt=prompt,
            image_data=[self._prepare_image_for_messages(image_data)],
        )
        raw = self.cosmos.chat(
            messages=messages,
            temperature=self._extract_temperature(detect_cfg),
            max_tokens=int(detect_cfg.get("max_tokens", 300)),
        )
        parsed = self._parse_c2_response(raw)
        detection = self._normalize_detection(parsed)
        routed = self.graph.run_once(
            AgentState(
                detection_alert_level=str(detection.get("alert_level", detection.get("severity", "unknown"))),
                detection_confidence=self._safe_float(detection.get("confidence", 0.0)),
            )
        )
        detection["agent_mode"] = "v3"
        detection["v3_route_path"] = [node.value for node in routed.path]
        return detection

    async def enqueue_frame(self, frame_base64_jpeg: str) -> None:
        """Enqueue a base64 JPEG frame for asynchronous patrol processing."""
        await self.frame_queue.put(frame_base64_jpeg)

    async def patrol_loop(
        self,
        frame_base64_jpeg: str | None = None,
        context: str = "",
        max_iterations: int | None = None,
    ) -> None:
        """Run observe->analyze->reason->decide->act surveillance loop.

        Args:
            frame_base64_jpeg: Optional single frame to process immediately.
            context: Optional patrol context appended to prompts.
            max_iterations: Optional hard limit for testability and bounded runs.
        """
        iterations = 0
        while True:
            if max_iterations is not None and iterations >= max_iterations:
                return

            # OBSERVE
            if frame_base64_jpeg is not None:
                frame = frame_base64_jpeg
                frame_base64_jpeg = None
            else:
                frame = await self.frame_queue.get()

            image_input = self._prepare_image_for_messages(frame)

            # DETECT
            detect_cfg = self.prompt_templates.detect(context=context)
            detect_messages = self.prompt_templates.build_messages(
                prompt=detect_cfg["single_frame"],
                image_data=[image_input],
            )
            detect_raw = await self._chat_retry(
                messages=detect_messages,
                temperature=self._extract_temperature(detect_cfg),
                max_tokens=int(detect_cfg.get("max_tokens", 300)),
            )
            detections = self._normalize_detection(self._parse_c2_response(detect_raw))

            routed_state = self.graph.run_once(
                AgentState(
                    detection_alert_level=str(
                        detections.get("alert_level", detections.get("severity", "unknown"))
                    ),
                    detection_confidence=self._safe_float(detections.get("confidence", 0.0)),
                )
            )
            deep_path = any(node.value == "understand_deep" for node in routed_state.path)

            understand_cfg: dict[str, Any] | None = None
            simulate_cfg: dict[str, Any] | None = None
            decide_cfg: dict[str, Any] | None = None
            verify_cfg: dict[str, Any] | None = None
            understanding: dict[str, Any] = {}
            simulation: dict[str, Any] = {}
            decision: dict[str, Any] = {}
            verification: dict[str, Any] = {}

            if deep_path:
                # UNDERSTAND
                understand_cfg = self.prompt_templates.understand(detections=detections, context=context)
                understand_messages = self.prompt_templates.build_messages(
                    prompt=understand_cfg["prompt"],
                    image_data=[image_input],
                )
                understand_raw = await self._chat_retry(
                    messages=understand_messages,
                    temperature=self._extract_temperature(understand_cfg),
                    max_tokens=int(understand_cfg.get("max_tokens", 300)),
                )
                understanding = self._parse_c2_response(understand_raw)

                # SIMULATE
                simulate_cfg = self.prompt_templates.simulate(understanding=understanding, context=context)
                simulate_messages = self.prompt_templates.build_messages(
                    prompt=simulate_cfg["prompt"],
                    image_data=[image_input],
                )
                simulate_raw = await self._chat_retry(
                    messages=simulate_messages,
                    temperature=self._extract_temperature(simulate_cfg),
                    max_tokens=int(simulate_cfg.get("max_tokens", 300)),
                )
                simulation = self._parse_c2_response(simulate_raw)

                # DECIDE
                decide_cfg = self.prompt_templates.decide(
                    understanding=understanding,
                    simulation=simulation,
                    context=context,
                )
                decide_messages = self.prompt_templates.build_messages(
                    prompt=decide_cfg["prompt"],
                    image_data=[image_input],
                )
                decide_raw = await self._chat_retry(
                    messages=decide_messages,
                    temperature=self._extract_temperature(decide_cfg),
                    max_tokens=int(decide_cfg.get("max_tokens", 300)),
                )
                decision = self._parse_c2_response(decide_raw)

                # VERIFY
                verify_cfg = self.prompt_templates.verify(decision=decision, context=context)
                verify_messages = self.prompt_templates.build_messages(
                    prompt=verify_cfg["prompt"],
                    image_data=[image_input],
                )
                verify_raw = await self._chat_retry(
                    messages=verify_messages,
                    temperature=self._extract_temperature(verify_cfg),
                    max_tokens=int(verify_cfg.get("max_tokens", 300)),
                )
                verification = self._parse_c2_response(verify_raw)

                anomalies = self._collect_anomalies(detections, understanding, verification)
                confidence = self._collect_confidence(detections, understanding, verification)
                severity = self._collect_severity(detections, understanding, decision)
            else:
                anomalies = [str(item) for item in detections.get("anomalies", []) if str(item).strip()]
                confidence = self._safe_float(detections.get("confidence", 0.0))
                severity = self._severity_from_alert_level(
                    str(detections.get("severity") or detections.get("alert_level") or "low")
                )

            # DECIDE
            action = self._determine_action(
                anomalies=anomalies,
                confidence=confidence,
                severity=severity,
            )

            # ACT
            action_result = self._execute_action(
                action=action,
                analysis=detections,
                anomalies=anomalies,
                confidence=confidence,
                severity=severity,
            )

            c2_meta: dict[str, Any] = {"detect": self._build_meta(detect_cfg)}
            if understand_cfg is not None:
                c2_meta["understand"] = self._build_meta(understand_cfg)
            if simulate_cfg is not None:
                c2_meta["simulate"] = self._build_meta(simulate_cfg)
            if decide_cfg is not None:
                c2_meta["decide"] = self._build_meta(decide_cfg)
            if verify_cfg is not None:
                c2_meta["verify"] = self._build_meta(verify_cfg)

            self.context_history.append(
                {
                    "agent_mode": "v3",
                    "v3_route_path": [node.value for node in routed_state.path],
                    "analysis": detections,
                    "detections": detections,
                    "understanding": understanding,
                    "simulation": simulation,
                    "decision": decision,
                    "verification": verification,
                    "anomalies": anomalies,
                    "confidence": confidence,
                    "severity": severity,
                    "action": action,
                    "c2_meta": c2_meta,
                    "action_result": action_result,
                    "timestamp": time.time(),
                }
            )
            iterations += 1

    async def _chat_retry(
        self,
        messages: list[dict],
        temperature: float,
        max_tokens: int,
        timeout_seconds: float = 15.0,
    ) -> str:
        """Call Cosmos chat with retries, timeout, and reasoning loop detection.

        If Cosmos returns a response that starts with ``<think>`` but never closes
        with ``</think>`` (reasoning loop), the attempt is retried with increased
        ``max_tokens`` to give the model room to finish.
        """
        last_error: Exception | None = None
        current_max_tokens = max_tokens

        for attempt in range(1, self.max_retries + 1):
            try:
                result: str = await asyncio.wait_for(
                    asyncio.to_thread(
                        self.cosmos.chat,
                        messages,
                        temperature,
                        current_max_tokens,
                    ),
                    timeout=timeout_seconds,
                )

                # Detect reasoning loop: <think> present but never closed
                if "<think>" in result and "</think>" not in result:
                    logger.warning(
                        "Reasoning loop detected (attempt %d/%d) — retrying with higher max_tokens",
                        attempt,
                        self.max_retries,
                    )
                    current_max_tokens = int(current_max_tokens * 1.5)
                    last_error = RuntimeError("Reasoning loop: <think> without </think>")
                    if attempt < self.max_retries:
                        await asyncio.sleep(self.retry_delay_seconds)
                    continue

                return result
            except asyncio.TimeoutError:
                last_error = TimeoutError(
                    f"Cosmos chat timed out after {timeout_seconds}s (attempt {attempt}/{self.max_retries})"
                )
                logger.warning("Cosmos chat timeout (attempt %d/%d)", attempt, self.max_retries)
                current_max_tokens = int(current_max_tokens * 1.5)
                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_delay_seconds)
            except Exception as exc:
                last_error = exc
                logger.exception("Cosmos chat failed (attempt %d/%d)", attempt, self.max_retries)
                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_delay_seconds)

        raise RuntimeError("Cosmos API call failed after retries") from last_error

    async def _chat_with_video_retry(self, frame: str, prompt: str) -> str:
        """Call Cosmos with retries and support base64 frame inputs."""
        last_error: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                prepared_frame, temp_path = self._prepare_frame_for_cosmos(frame)
                try:
                    return await asyncio.to_thread(
                        self.cosmos.chat_with_video,
                        prepared_frame,
                        prompt,
                    )
                finally:
                    if temp_path is not None:
                        temp_path.unlink(missing_ok=True)
            except Exception as exc:  # pragma: no cover - generic resilience branch
                last_error = exc
                logger.exception("Cosmos call failed (attempt %d/%d)", attempt, self.max_retries)
                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_delay_seconds)

        raise RuntimeError("Cosmos API call failed after retries") from last_error

    def _prepare_frame_for_cosmos(self, frame: str) -> tuple[str, Path | None]:
        """Convert frame to a path CosmosClient can send, when needed."""
        if frame.startswith(("http://", "https://")):
            return frame, None
        try:
            if Path(frame).exists():
                return frame, None
        except OSError:
            # Frame payload is not a filesystem-safe path.
            pass

        payload = frame
        if frame.startswith("data:image") and "," in frame:
            payload = frame.split(",", maxsplit=1)[1]

        try:
            data = self._decode_base64(payload)
        except ValueError:
            return frame, None

        handle = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
        with handle:
            handle.write(data)
        return handle.name, Path(handle.name)

    @staticmethod
    def _decode_base64(payload: str) -> bytes:
        """Decode a base64 string and raise ValueError when invalid."""
        try:
            return base64.b64decode(payload, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("invalid base64") from exc

    def _parse_c2_response(self, raw: str) -> dict[str, Any]:
        """Parse Cosmos output through C2PromptTemplates response helpers."""
        parsed = self.prompt_templates.parse_json_response(raw)
        if isinstance(parsed, dict):
            return parsed
        answer = self.prompt_templates.extract_answer(raw)
        return {"raw_response": answer, "parse_error": True}

    def _prepare_image_for_messages(self, image_data: str) -> str:
        """Convert path/base64/url into build_messages-compatible image value."""
        if image_data.startswith(("http://", "https://", "data:image")):
            return image_data
        try:
            path = Path(image_data)
            if path.exists():
                data = base64.b64encode(path.read_bytes()).decode("ascii")
                suffix = path.suffix.lower()
                mime = "image/png" if suffix == ".png" else "image/jpeg"
                return f"data:{mime};base64,{data}"
        except OSError:
            pass

        payload = image_data.split(",", maxsplit=1)[1] if image_data.startswith("data:image") and "," in image_data else image_data
        try:
            self._decode_base64(payload)
            return payload
        except ValueError:
            return image_data

    @staticmethod
    def _extract_temperature(step_cfg: dict[str, Any]) -> float:
        sampling = step_cfg.get("sampling", {})
        try:
            return float(sampling.get("temperature", 0.7))
        except (TypeError, ValueError):
            return 0.7

    @staticmethod
    def _build_meta(step_cfg: dict[str, Any]) -> dict[str, Any]:
        return {
            "use_reasoning": bool(step_cfg.get("use_reasoning", False)),
            "sampling": dict(step_cfg.get("sampling", {})),
            "max_tokens": int(step_cfg.get("max_tokens", 300)),
        }

    def _normalize_detection(self, detection: dict[str, Any]) -> dict[str, Any]:
        """Backwards-compatible normalization for detect outputs."""
        result = dict(detection)
        description = result.get("description") or result.get("scene") or result.get("raw_response") or ""
        result["description"] = str(description)
        anomalies = result.get("anomalies", [])
        if isinstance(anomalies, list):
            result["anomalies"] = [str(item) for item in anomalies]
        elif anomalies:
            result["anomalies"] = [str(anomalies)]
        else:
            result["anomalies"] = []
        result["confidence"] = self._safe_float(result.get("confidence", 0.0))
        result["severity"] = self._severity_from_alert_level(
            str(result.get("severity") or result.get("alert_level") or "low")
        )
        return result

    def _collect_anomalies(
        self,
        detections: dict[str, Any],
        understanding: dict[str, Any],
        verification: dict[str, Any],
    ) -> list[str]:
        anomalies: list[str] = []

        detected = detections.get("anomalies", [])
        if isinstance(detected, list):
            anomalies.extend(str(item) for item in detected if str(item).strip())

        assessments = understanding.get("assessments", [])
        if isinstance(assessments, list):
            for item in assessments:
                if isinstance(item, dict):
                    threat = str(item.get("threat_level", "")).lower()
                    if threat in {"suspicious", "critical"}:
                        detection = str(item.get("detection", "")).strip()
                        if detection:
                            anomalies.append(detection)

        new_issues = verification.get("new_issues", [])
        if isinstance(new_issues, list):
            anomalies.extend(str(item) for item in new_issues if str(item).strip())

        unique: list[str] = []
        for item in anomalies:
            if item not in unique:
                unique.append(item)
        return unique

    def _collect_confidence(
        self,
        detections: dict[str, Any],
        understanding: dict[str, Any],
        verification: dict[str, Any],
    ) -> float:
        values = [self._safe_float(detections.get("confidence"))]

        assessments = understanding.get("assessments", [])
        if isinstance(assessments, list):
            for item in assessments:
                if isinstance(item, dict):
                    values.append(self._safe_float(item.get("confidence")))

        values.append(self._safe_float(verification.get("confidence")))
        return max(values) if values else 0.0

    def _collect_severity(
        self,
        detections: dict[str, Any],
        understanding: dict[str, Any],
        decision: dict[str, Any],
    ) -> str:
        levels = [
            self._severity_from_alert_level(str(detections.get("severity") or detections.get("alert_level") or "")),
            self._severity_from_alert_level(str(understanding.get("overall_threat", ""))),
        ]

        alert = decision.get("alert")
        if isinstance(alert, dict):
            levels.append(self._severity_from_alert_level(str(alert.get("level", ""))))

        order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
        best = "low"
        for level in levels:
            if order.get(level, 0) > order[best]:
                best = level
        return best

    @staticmethod
    def _severity_from_alert_level(level: str) -> str:
        normalized = level.strip().lower()
        mapping = {
            "green": "low",
            "low": "low",
            "monitor": "low",
            "yellow": "medium",
            "medium": "medium",
            "warning": "medium",
            "investigate": "medium",
            "respond": "high",
            "red": "high",
            "high": "high",
            "critical": "critical",
            "emergency": "critical",
            "evacuate": "critical",
        }
        return mapping.get(normalized, "low")

    def _determine_action(self, anomalies: list[str], confidence: float, severity: str) -> str:
        """Decide action: ignore, log, alert, or escalate."""
        if not anomalies or confidence < self.confidence_threshold:
            return "ignore"

        if severity in {"critical", "high"} or confidence >= min(0.95, self.confidence_threshold + 0.3):
            action = "escalate"
        elif confidence >= self.confidence_threshold + 0.2:
            action = "alert"
        else:
            action = "log"

        if action in {"alert", "escalate"} and not self._can_alert_now():
            return "log"
        return action

    def _execute_action(
        self,
        action: str,
        analysis: dict[str, Any],
        anomalies: list[str],
        confidence: float,
        severity: str,
    ) -> dict[str, Any]:
        """Execute decision with available tools and return execution metadata."""
        results: dict[str, Any] = {
            "action": action,
            "tools": {},
            "confidence": confidence,
            "severity": severity,
        }

        description = str(analysis.get("description", "No description provided"))
        results["tools"]["describe_scene"] = describe_scene(description)

        if action == "ignore":
            logger.info("Ignoring frame; no actionable anomaly")
            return results

        results["tools"]["check_window_status"] = check_window_status()
        results["tools"]["check_door_status"] = check_door_status()

        if action in {"log", "alert", "escalate"}:
            report_severity = "high" if action == "escalate" else ("medium" if action == "alert" else "low")
            anomaly_summary = "; ".join(anomalies) if anomalies else description
            results["tools"]["report_anomaly"] = report_anomaly(
                f"{anomaly_summary} (confidence={confidence:.2f})",
                severity=report_severity,
            )

        if action in {"alert", "escalate"}:
            self.last_alert_time = time.time()

        return results

    def _can_alert_now(self) -> bool:
        """Return True when cooldown period has elapsed."""
        elapsed = time.time() - self.last_alert_time
        return elapsed >= self.alert_cooldown_seconds

    @staticmethod
    def _safe_float(value: Any) -> float:
        """Parse numeric confidence values safely."""
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0


# Canonical agent export for codepaths that still import SurveillanceAgent.
SurveillanceAgent = SurveillanceAgentV3

__all__ = [
    "SurveillanceAgent",
    "SurveillanceAgentV3",
    "TOOLS",
    "check_window_status",
    "check_door_status",
    "report_anomaly",
    "describe_scene",
]
