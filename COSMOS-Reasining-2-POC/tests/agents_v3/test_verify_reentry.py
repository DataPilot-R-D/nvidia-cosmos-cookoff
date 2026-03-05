"""Verify re-entry loop tests for surveillance agent V3."""

from __future__ import annotations

from src.agents.v3.graph import SurveillanceGraphV3
from src.agents.v3.memory import SlidingMemoryWindow
from src.agents.v3.state import AgentNode, AgentState, VerifyOutcome


def test_verify_unresolved_reenters_until_resolved() -> None:
    outcomes = iter([VerifyOutcome.UNRESOLVED, VerifyOutcome.RESOLVED])
    graph = SurveillanceGraphV3()
    state = AgentState(detection_alert_level="yellow", detection_confidence=0.9, max_reentries=2)

    result = graph.run_until_stable(state, verify_step=lambda _state: next(outcomes))

    assert result.current_node == AgentNode.END
    assert result.reentry_count == 1
    assert result.verify_outcome == VerifyOutcome.RESOLVED
    assert result.path.count(AgentNode.VERIFY) == 2
    assert result.path[-1] == AgentNode.END


def test_verify_loop_honors_reentry_budget_and_escalates() -> None:
    graph = SurveillanceGraphV3()
    state = AgentState(detection_alert_level="yellow", detection_confidence=0.9, max_reentries=2)

    result = graph.run_until_stable(state, verify_step=lambda _state: VerifyOutcome.UNRESOLVED)

    assert result.current_node == AgentNode.END
    assert result.reentry_count == 2
    assert result.verify_outcome == VerifyOutcome.UNRESOLVED
    assert result.terminated_by_budget is True
    assert result.path.count(AgentNode.VERIFY) == 3
    assert result.path[-2:] == [AgentNode.ESCALATE, AgentNode.END]


def test_verify_malformed_outcome_falls_back_to_unresolved_and_stops() -> None:
    graph = SurveillanceGraphV3()
    state = AgentState(detection_alert_level="yellow", detection_confidence=0.9, max_reentries=1)

    result = graph.run_until_stable(state, verify_step=lambda _state: "nonsense")

    assert result.current_node == AgentNode.END
    assert result.reentry_count == 1
    assert result.verify_outcome == VerifyOutcome.UNRESOLVED
    assert result.terminated_by_budget is True
    assert result.path.count(AgentNode.VERIFY) == 2


def test_deep_path_receives_last_n_memory_context() -> None:
    memory = SlidingMemoryWindow(max_items=2)
    memory.add({"frame_id": "f1", "summary": "background only"})
    memory.add({"frame_id": "f2", "summary": "window open"})
    memory.add({"frame_id": "f3", "summary": "person near window"})

    seen_contexts: list[list[dict[str, str]]] = []
    graph = SurveillanceGraphV3()
    state = AgentState(detection_alert_level="yellow", detection_confidence=0.9, max_reentries=0)

    result = graph.run_until_stable(
        state,
        verify_step=lambda _state: VerifyOutcome.RESOLVED,
        memory_window=memory,
        deep_step=lambda _state, context: seen_contexts.append(context),
    )

    assert result.current_node == AgentNode.END
    assert len(seen_contexts) == 1
    assert [entry["frame_id"] for entry in seen_contexts[0]] == ["f2", "f3"]
    assert [entry["frame_id"] for entry in result.deep_context] == ["f2", "f3"]
