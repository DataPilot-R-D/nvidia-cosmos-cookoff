"""Routing policy tests for surveillance agent V3."""

from __future__ import annotations

from src.agents.v3.state import AgentState, RouteTarget
from src.agents.v3.graph import route_from_detection


def test_route_green_high_confidence_to_early_exit() -> None:
    state = AgentState(detection_alert_level="green", detection_confidence=0.91)

    assert route_from_detection(state) == RouteTarget.EARLY_EXIT


def test_route_low_confidence_to_deep_path() -> None:
    state = AgentState(detection_alert_level="green", detection_confidence=0.42)

    assert route_from_detection(state) == RouteTarget.DEEP_ANALYSIS


def test_route_non_green_to_deep_path() -> None:
    state = AgentState(detection_alert_level="yellow", detection_confidence=0.95)

    assert route_from_detection(state) == RouteTarget.DEEP_ANALYSIS


def test_route_conflicting_signals_to_deep_path() -> None:
    state = AgentState(
        detection_alert_level="green",
        detection_confidence=0.95,
        has_signal_conflict=True,
    )

    assert route_from_detection(state) == RouteTarget.DEEP_ANALYSIS
