"""Deterministic V2 vs V3 routing metrics for rollout evidence."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from src.agents.v3.graph import SurveillanceGraphV3
from src.agents.v3.state import AgentNode, AgentState

V2_MODEL_CALLS_PER_FRAME = 5
V3_EARLY_EXIT_MODEL_CALLS_PER_FRAME = 1
V3_DEEP_MODEL_CALLS_PER_FRAME = 4


@dataclass(frozen=True)
class RoutingCase:
    """Single deterministic policy benchmark case."""

    name: str
    alert_level: str
    confidence: float
    has_signal_conflict: bool = False


def estimate_v3_model_calls(path: list[AgentNode]) -> int:
    """Estimate model calls from V3 route path."""
    if AgentNode.UNDERSTAND_DEEP in path:
        return V3_DEEP_MODEL_CALLS_PER_FRAME
    return V3_EARLY_EXIT_MODEL_CALLS_PER_FRAME


def build_default_v2_v3_metrics() -> dict[str, Any]:
    """Build deterministic V2-vs-V3 summary metrics for policy cases."""
    graph = SurveillanceGraphV3()
    cases = [
        RoutingCase("routine_green_high_confidence", "green", 0.95, False),
        RoutingCase("green_low_confidence", "green", 0.45, False),
        RoutingCase("yellow_high_confidence", "yellow", 0.92, False),
        RoutingCase("green_high_conflict", "green", 0.93, True),
    ]

    rows: list[dict[str, Any]] = []
    total_v3_calls = 0
    early_exit_count = 0

    for case in cases:
        state = AgentState(
            detection_alert_level=case.alert_level,
            detection_confidence=case.confidence,
            has_signal_conflict=case.has_signal_conflict,
        )
        result = graph.run_once(state)
        v3_calls = estimate_v3_model_calls(result.path)
        total_v3_calls += v3_calls
        if AgentNode.ACT_MINIMAL in result.path:
            early_exit_count += 1

        rows.append(
            {
                "name": case.name,
                "alert_level": case.alert_level,
                "confidence": case.confidence,
                "has_signal_conflict": case.has_signal_conflict,
                "v2_model_calls": V2_MODEL_CALLS_PER_FRAME,
                "v3_model_calls": v3_calls,
                "v3_route_path": [node.value for node in result.path],
            }
        )

    case_count = len(rows)
    v2_avg = float(V2_MODEL_CALLS_PER_FRAME)
    v3_avg = total_v3_calls / case_count if case_count else 0.0
    reduction_pct = ((v2_avg - v3_avg) / v2_avg * 100.0) if v2_avg else 0.0

    return {
        "assumptions": {
            "v2_model_calls_per_frame": V2_MODEL_CALLS_PER_FRAME,
            "v3_model_calls_early_exit": V3_EARLY_EXIT_MODEL_CALLS_PER_FRAME,
            "v3_model_calls_deep_path": V3_DEEP_MODEL_CALLS_PER_FRAME,
        },
        "cases": rows,
        "aggregate": {
            "case_count": case_count,
            "early_exit_count": early_exit_count,
            "early_exit_rate": early_exit_count / case_count if case_count else 0.0,
            "v2_avg_calls_per_frame": v2_avg,
            "v3_avg_calls_per_frame": v3_avg,
            "estimated_call_reduction_pct": reduction_pct,
        },
    }
