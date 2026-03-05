"""Risk-based reasoning mode selection for surveillance agent V3."""

from __future__ import annotations

from enum import Enum


class ReasoningMode(str, Enum):
    """Inference depth mode for graph nodes."""

    FAST = "fast"
    DEEP = "deep"


def select_reasoning_mode(
    alert_level: str,
    confidence: float,
    has_signal_conflict: bool,
    high_confidence_threshold: float = 0.8,
) -> ReasoningMode:
    """Select deep mode only for elevated risk, low confidence, or conflict."""
    normalized = alert_level.strip().lower()
    elevated_risk_levels = {"yellow", "red", "critical"}

    if normalized in elevated_risk_levels:
        return ReasoningMode.DEEP
    if confidence < high_confidence_threshold:
        return ReasoningMode.DEEP
    if has_signal_conflict:
        return ReasoningMode.DEEP
    return ReasoningMode.FAST
