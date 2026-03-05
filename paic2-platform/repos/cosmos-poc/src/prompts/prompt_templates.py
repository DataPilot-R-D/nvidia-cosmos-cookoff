"""C2 Prompt Templates for Cosmos Reason2 — Surveillance Agent v2.

Based on NVIDIA official prompting guide + benchmark results (2026-02-16).
See docs/PROMPT_GUIDE.md for full reference.

Usage:
    from src.prompts.prompt_templates import C2PromptTemplates
    templates = C2PromptTemplates()
    prompt = templates.detect(context="night patrol, sector B")
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# ------------------------------------------------------------------
# Reasoning suffix (NVIDIA official format for multimodal)
# ------------------------------------------------------------------
REASONING_SUFFIX = (
    "\n\nAnswer the question using the following format:\n\n"
    "<think>\nYour reasoning.\n</think>\n\n"
    "Write your final answer immediately after the </think> tag."
)

# ------------------------------------------------------------------
# System prompt (required per NVIDIA guide)
# ------------------------------------------------------------------
SYSTEM_PROMPT = "You are a helpful assistant."

# ------------------------------------------------------------------
# Sampling presets
# ------------------------------------------------------------------
SAMPLING_DEFAULT = {
    "temperature": 0.7,
    "top_p": 0.8,
    "top_k": 20,
    "presence_penalty": 1.5,
}

SAMPLING_REASONING = {
    "temperature": 0.6,
    "top_p": 0.95,
    "top_k": 20,
}

# ------------------------------------------------------------------
# Max tokens per task (from benchmark results)
# ------------------------------------------------------------------
MAX_TOKENS = {
    "detect": 800,
    "understand": 1200,
    "simulate": 1000,
    "decide": 800,
    "verify": 800,
    "caption": 200,
    "change_detection": 1200,
    "person_detection": 600,
    "motion": 800,
    "security_alert": 800,
    "json_output": 1000,
    # DO NOT use reasoning for these (they loop):
    "distance": 300,
    "room_dimensions": 300,
}


@dataclass
class C2PromptTemplates:
    """Prompt templates for the 5-step C2 surveillance loop.

    Steps: Detect → Understand → Simulate → Decide → Verify

    All prompts follow NVIDIA Cosmos Reason2 best practices:
    - Media BEFORE text in content array
    - System prompt always included
    - Reasoning mode via format instruction (not \\n<think>\\n suffix)
    - Task-specific max_tokens and sampling
    """

    # ------------------------------------------------------------------
    # Step 1: DETECT — What changed?
    # ------------------------------------------------------------------
    @staticmethod
    def detect(context: str = "") -> dict[str, Any]:
        """Detect anomalies / changes in surveillance frame(s).

        Use with 1 frame (general scan) or 2 frames (before/after change detection).
        Uses reasoning mode for change detection accuracy.
        """
        ctx = f" Context: {context}." if context else ""

        prompt_single = (
            "You are a security surveillance AI analyzing a camera feed.{ctx} "
            "Analyze this frame and report:\n"
            "1. SCENE: Brief description of the environment\n"
            "2. OBJECTS: Key objects visible (name, position, state)\n"
            "3. PEOPLE: Count and describe any persons (clothing, posture, location)\n"
            "4. ANOMALIES: Anything unusual or security-relevant\n"
            "5. DOORS/WINDOWS: State of all entry points (open/closed/partially open)\n\n"
            "Return ONLY valid JSON:\n"
            '{{"scene": "...", "objects": [...], "people_count": 0, '
            '"people": [...], "anomalies": [...], '
            '"doors_windows": [...], "alert_level": "green|yellow|red"}}'
        ).format(ctx=ctx)

        prompt_change = (
            "You are a security surveillance AI.{ctx} "
            "Image 1 is BEFORE, Image 2 is AFTER (same camera, same location).\n\n"
            "Compare carefully and report ALL changes:\n"
            "1. ADDED: Objects that appear in Image 2 but not Image 1\n"
            "2. REMOVED: Objects in Image 1 missing from Image 2\n"
            "3. MOVED: Objects that changed position\n"
            "4. STATE_CHANGED: Doors/windows/lights that changed state\n"
            "5. PEOPLE: Anyone entered or left the scene\n\n"
            "Return ONLY valid JSON:\n"
            '{{"added": [{{"object": "...", "color": "...", "location": "..."}}], '
            '"removed": [...], "moved": [{{"object": "...", "from": "...", "to": "..."}}], '
            '"state_changed": [{{"item": "...", "before": "...", "after": "..."}}], '
            '"people_entered": 0, "people_left": 0, '
            '"alert_level": "green|yellow|red"}}'
        ).format(ctx=ctx)

        return {
            "single_frame": prompt_single + REASONING_SUFFIX,
            "change_detection": prompt_change + REASONING_SUFFIX,
            "sampling": SAMPLING_REASONING,
            "max_tokens": MAX_TOKENS["detect"],
            "use_reasoning": True,
        }

    # ------------------------------------------------------------------
    # Step 2: UNDERSTAND — Why does it matter?
    # ------------------------------------------------------------------
    @staticmethod
    def understand(detections: dict, context: str = "") -> dict[str, Any]:
        """Interpret detection results in security context.

        Takes JSON detections from Step 1 and asks Cosmos to reason about
        their security implications.
        """
        ctx = f" Patrol context: {context}." if context else ""
        det_str = str(detections)

        prompt = (
            "You are a security analyst AI.{ctx}\n\n"
            "Detection results from surveillance camera:\n"
            "```\n{detections}\n```\n\n"
            "Analyze the security implications:\n"
            "1. THREAT_ASSESSMENT: Rate each detection (benign / suspicious / critical)\n"
            "2. PATTERNS: Any concerning patterns? (repeated intrusions, systematic changes)\n"
            "3. CONTEXT: Time-of-day / location considerations\n"
            "4. CONFIDENCE: How confident are you in each assessment? (0.0-1.0)\n\n"
            "Return ONLY valid JSON:\n"
            '{{"assessments": [{{"detection": "...", "threat_level": "benign|suspicious|critical", '
            '"reasoning": "...", "confidence": 0.0}}], '
            '"overall_threat": "low|medium|high|critical", '
            '"recommended_priority": "monitor|investigate|respond|evacuate"}}'
        ).format(ctx=ctx, detections=det_str)

        return {
            "prompt": prompt + REASONING_SUFFIX,
            "sampling": SAMPLING_REASONING,
            "max_tokens": MAX_TOKENS["understand"],
            "use_reasoning": True,
        }

    # ------------------------------------------------------------------
    # Step 3: SIMULATE — What happens next?
    # ------------------------------------------------------------------
    @staticmethod
    def simulate(understanding: dict, context: str = "") -> dict[str, Any]:
        """Predict what could happen next based on understanding.

        Uses Cosmos reasoning to project scenarios.
        """
        ctx = f" Context: {context}." if context else ""
        und_str = str(understanding)

        prompt = (
            "You are a security prediction AI.{ctx}\n\n"
            "Current situation assessment:\n"
            "```\n{understanding}\n```\n\n"
            "Project 3 scenarios for the next 5-15 minutes:\n"
            "1. BEST_CASE: Most optimistic realistic outcome\n"
            "2. LIKELY: Most probable outcome\n"
            "3. WORST_CASE: Worst realistic outcome\n\n"
            "For each scenario:\n"
            "- What happens\n"
            "- Probability (0.0-1.0)\n"
            "- Time estimate\n"
            "- Required response\n\n"
            "Return ONLY valid JSON:\n"
            '{{"scenarios": [{{"name": "best_case|likely|worst_case", '
            '"description": "...", "probability": 0.0, '
            '"time_estimate_minutes": 0, '
            '"required_response": "none|monitor|alert|dispatch|evacuate"}}], '
            '"recommended_action": "..."}}'
        ).format(ctx=ctx, understanding=und_str)

        return {
            "prompt": prompt + REASONING_SUFFIX,
            "sampling": SAMPLING_REASONING,
            "max_tokens": MAX_TOKENS["simulate"],
            "use_reasoning": True,
        }

    # ------------------------------------------------------------------
    # Step 4: DECIDE — What do we do?
    # ------------------------------------------------------------------
    @staticmethod
    def decide(
        understanding: dict,
        simulation: dict,
        context: str = "",
    ) -> dict[str, Any]:
        """Generate actionable decision based on understanding + simulation.

        This is the C2 (Command & Control) decision point.
        """
        ctx = f" Context: {context}." if context else ""

        prompt = (
            "You are a C2 (Command & Control) decision AI for physical security.{ctx}\n\n"
            "Situation assessment:\n```\n{understanding}\n```\n\n"
            "Projected scenarios:\n```\n{simulation}\n```\n\n"
            "Make a decision:\n"
            "1. ACTION: What specific action to take NOW\n"
            "2. ALERT: Who to notify and how (operator / security team / emergency)\n"
            "3. ROBOT_COMMAND: If a patrol robot is available, what should it do?\n"
            "4. ESCALATION: Under what conditions to escalate further\n"
            "5. MONITORING: What to watch for in next frames\n\n"
            "Return ONLY valid JSON:\n"
            '{{"action": "...", "alert": {{"level": "info|warning|critical|emergency", '
            '"notify": ["operator"], "message": "..."}}, '
            '"robot_command": {{"action": "continue_patrol|investigate|return_to_base|hold_position", '
            '"target": "...", "parameters": {{}}}}, '
            '"escalation_triggers": ["..."], '
            '"monitoring_focus": ["..."]}}'
        ).format(
            ctx=ctx,
            understanding=str(understanding),
            simulation=str(simulation),
        )

        return {
            "prompt": prompt + REASONING_SUFFIX,
            "sampling": SAMPLING_REASONING,
            "max_tokens": MAX_TOKENS["decide"],
            "use_reasoning": True,
        }

    # ------------------------------------------------------------------
    # Step 5: VERIFY — Did our action work?
    # ------------------------------------------------------------------
    @staticmethod
    def verify(
        decision: dict,
        context: str = "",
    ) -> dict[str, Any]:
        """Verify whether the decided action resolved the situation.

        Compare new frame(s) against the expected outcome from Step 4.
        """
        ctx = f" Context: {context}." if context else ""

        prompt = (
            "You are a security verification AI.{ctx}\n\n"
            "Previous decision and expected outcome:\n"
            "```\n{decision}\n```\n\n"
            "Analyze the current frame(s) and verify:\n"
            "1. RESOLVED: Was the original anomaly resolved? (yes/no/partial)\n"
            "2. NEW_ISSUES: Any new anomalies or concerns?\n"
            "3. ROBOT_STATUS: If robot was dispatched, is it in expected position?\n"
            "4. RECOMMENDATION: Continue monitoring / Escalate / Stand down\n\n"
            "Return ONLY valid JSON:\n"
            '{{"resolved": "yes|no|partial", "resolution_details": "...", '
            '"new_issues": [...], "robot_status": "...", '
            '"recommendation": "continue_monitoring|escalate|stand_down", '
            '"confidence": 0.0}}'
        ).format(ctx=ctx, decision=str(decision))

        return {
            "prompt": prompt + REASONING_SUFFIX,
            "sampling": SAMPLING_REASONING,
            "max_tokens": MAX_TOKENS["verify"],
            "use_reasoning": True,
        }

    # ------------------------------------------------------------------
    # Utility: Build message array (NVIDIA format)
    # ------------------------------------------------------------------
    @staticmethod
    def build_messages(
        prompt: str,
        image_data: list[str] | None = None,
        video_data: str | None = None,
    ) -> list[dict]:
        """Build OpenAI-compatible messages array with NVIDIA media-first ordering.

        Args:
            prompt: The text prompt (already includes reasoning suffix if needed).
            image_data: List of base64-encoded images or URLs.
            video_data: Base64-encoded video or URL.

        Returns:
            Messages array ready for CosmosClient.
        """
        content: list[dict] = []

        # MEDIA FIRST (required by NVIDIA guide)
        if image_data:
            for img in image_data:
                if img.startswith(("http://", "https://", "data:")):
                    url = img
                else:
                    url = f"data:image/jpeg;base64,{img}"
                content.append({
                    "type": "image_url",
                    "image_url": {"url": url},
                })

        if video_data:
            if video_data.startswith(("http://", "https://", "data:")):
                url = video_data
            else:
                url = f"data:video/mp4;base64,{video_data}"
            content.append({
                "type": "video_url",
                "video_url": {"url": url},
            })

        # TEXT AFTER media
        content.append({"type": "text", "text": prompt})

        return [
            {"role": "system", "content": [{"type": "text", "text": SYSTEM_PROMPT}]},
            {"role": "user", "content": content},
        ]

    # ------------------------------------------------------------------
    # Utility: Parse response (handle reasoning tags)
    # ------------------------------------------------------------------
    @staticmethod
    def extract_answer(response: str) -> str:
        """Extract final answer from Cosmos response, handling <think> tags.

        The 2B model sometimes fails to close </think>. This handles all cases.
        """
        if "</think>" in response:
            return response.split("</think>")[-1].strip()
        if response.startswith("<think>"):
            # Model looped — return raw (strip the tag)
            return response.replace("<think>", "").strip()
        return response.strip()

    @staticmethod
    def parse_json_response(response: str) -> dict:
        """Extract JSON from Cosmos response, handling reasoning tags + markdown fences."""
        import json
        import re

        answer = C2PromptTemplates.extract_answer(response)

        # Strip markdown code fences if present
        answer = re.sub(r"^```(?:json)?\s*", "", answer)
        answer = re.sub(r"\s*```$", "", answer)

        try:
            return json.loads(answer)
        except json.JSONDecodeError:
            # Try to find JSON object in the text
            match = re.search(r"\{.*\}", answer, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group())
                except json.JSONDecodeError:
                    pass
            return {"raw_response": answer, "parse_error": True}
