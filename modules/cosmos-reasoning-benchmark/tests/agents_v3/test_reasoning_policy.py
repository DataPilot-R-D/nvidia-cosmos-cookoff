"""Risk-based reasoning policy tests for surveillance agent V3."""

from __future__ import annotations

from src.agents.v3.reasoning_policy import ReasoningMode, select_reasoning_mode


def test_reasoning_policy_fast_mode_for_green_high_confidence() -> None:
    mode = select_reasoning_mode(alert_level="green", confidence=0.95, has_signal_conflict=False)

    assert mode == ReasoningMode.FAST


def test_reasoning_policy_deep_mode_for_low_confidence() -> None:
    mode = select_reasoning_mode(alert_level="green", confidence=0.4, has_signal_conflict=False)

    assert mode == ReasoningMode.DEEP


def test_reasoning_policy_deep_mode_for_elevated_risk() -> None:
    mode = select_reasoning_mode(alert_level="yellow", confidence=0.95, has_signal_conflict=False)

    assert mode == ReasoningMode.DEEP


def test_reasoning_policy_deep_mode_for_signal_conflict() -> None:
    mode = select_reasoning_mode(alert_level="green", confidence=0.95, has_signal_conflict=True)

    assert mode == ReasoningMode.DEEP
