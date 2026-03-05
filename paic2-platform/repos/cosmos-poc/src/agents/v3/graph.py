"""Minimal graph skeleton for surveillance agent V3."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from src.agents.v3.memory import SlidingMemoryWindow
from src.agents.v3.reasoning_policy import ReasoningMode, select_reasoning_mode
from src.agents.v3.state import AgentNode, AgentState, RouteTarget, VerifyOutcome


def route_from_detection(
    state: AgentState,
    high_confidence_threshold: float = 0.8,
) -> RouteTarget:
    """Pick early-exit vs deep path from detection risk signals."""
    mode = select_reasoning_mode(
        alert_level=state.detection_alert_level,
        confidence=state.detection_confidence,
        has_signal_conflict=state.has_signal_conflict,
        high_confidence_threshold=high_confidence_threshold,
    )
    if mode == ReasoningMode.FAST:
        return RouteTarget.EARLY_EXIT
    return RouteTarget.DEEP_ANALYSIS


def normalize_verify_outcome(outcome: VerifyOutcome | str | None) -> VerifyOutcome:
    """Parse verify outcome with deterministic unresolved fallback."""
    if isinstance(outcome, VerifyOutcome):
        return outcome

    value = (outcome or "").strip().lower()
    if value in {"resolved", "yes", "closed", "done"}:
        return VerifyOutcome.RESOLVED
    if value in {"escalate", "critical"}:
        return VerifyOutcome.ESCALATE
    return VerifyOutcome.UNRESOLVED


@dataclass
class SurveillanceGraphV3:
    """Executable minimal V3 graph slice for routing validation."""

    high_confidence_threshold: float = 0.8

    def run_once(self, state: AgentState) -> AgentState:
        """Run detect->gate and branch into early-exit or deep-analysis."""
        state.path = []
        self._visit(state, AgentNode.DETECT_FAST)
        self._visit(state, AgentNode.RISK_GATE)

        route = route_from_detection(state, self.high_confidence_threshold)
        if route == RouteTarget.EARLY_EXIT:
            self._visit(state, AgentNode.ACT_MINIMAL)
            self._visit(state, AgentNode.END)
            return state

        self._visit(state, AgentNode.UNDERSTAND_DEEP)
        return state

    def run_until_stable(
        self,
        state: AgentState,
        verify_step: Callable[[AgentState], VerifyOutcome | str | None],
        memory_window: SlidingMemoryWindow | None = None,
        deep_step: Callable[[AgentState, list[dict[str, Any]]], None] | None = None,
    ) -> AgentState:
        """Run deep path with bounded verify->detect re-entry."""
        state.path = []
        state.reentry_count = 0
        state.verify_outcome = None
        state.terminated_by_budget = False
        state.deep_context = []

        while True:
            self._visit(state, AgentNode.DETECT_FAST)
            self._visit(state, AgentNode.RISK_GATE)

            route = route_from_detection(state, self.high_confidence_threshold)
            if route == RouteTarget.EARLY_EXIT:
                self._visit(state, AgentNode.ACT_MINIMAL)
                self._visit(state, AgentNode.END)
                return state

            state.deep_context = memory_window.snapshot() if memory_window else []
            if deep_step is not None:
                deep_step(state, state.deep_context)
            self._visit(state, AgentNode.UNDERSTAND_DEEP)
            self._visit(state, AgentNode.DECIDE)
            self._visit(state, AgentNode.TOOL_EXEC)
            self._visit(state, AgentNode.VERIFY)

            outcome = normalize_verify_outcome(verify_step(state))
            state.verify_outcome = outcome
            if outcome == VerifyOutcome.RESOLVED:
                self._visit(state, AgentNode.END)
                return state
            if outcome == VerifyOutcome.ESCALATE:
                self._visit(state, AgentNode.ESCALATE)
                self._visit(state, AgentNode.END)
                return state

            if state.reentry_count >= state.max_reentries:
                state.terminated_by_budget = True
                self._visit(state, AgentNode.ESCALATE)
                self._visit(state, AgentNode.END)
                return state

            state.reentry_count += 1

    @staticmethod
    def _visit(state: AgentState, node: AgentNode) -> None:
        state.current_node = node
        state.path.append(node)
