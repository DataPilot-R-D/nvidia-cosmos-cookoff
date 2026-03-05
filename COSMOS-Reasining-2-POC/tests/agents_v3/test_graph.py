"""Minimal graph execution tests for surveillance agent V3."""

from __future__ import annotations

from src.agents.v3.graph import SurveillanceGraphV3
from src.agents.v3.state import AgentNode, AgentState


def test_graph_early_exit_path() -> None:
    graph = SurveillanceGraphV3()
    state = AgentState(detection_alert_level="green", detection_confidence=0.9)

    result = graph.run_once(state)

    assert result.current_node == AgentNode.END
    assert result.path == [AgentNode.DETECT_FAST, AgentNode.RISK_GATE, AgentNode.ACT_MINIMAL, AgentNode.END]


def test_graph_deep_path_routes_to_understand() -> None:
    graph = SurveillanceGraphV3()
    state = AgentState(detection_alert_level="yellow", detection_confidence=0.9)

    result = graph.run_once(state)

    assert result.current_node == AgentNode.UNDERSTAND_DEEP
    assert result.path == [AgentNode.DETECT_FAST, AgentNode.RISK_GATE, AgentNode.UNDERSTAND_DEEP]
