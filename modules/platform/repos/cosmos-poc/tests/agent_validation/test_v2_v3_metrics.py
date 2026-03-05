"""Deterministic V2 vs V3 metrics for rollout decisions."""

from __future__ import annotations

from src.benchmarks.agent_validation.v2_v3_metrics import (
    build_default_v2_v3_metrics,
    estimate_v3_model_calls,
)
from src.agents.v3.state import AgentNode


def test_estimate_v3_model_calls_for_early_exit_path() -> None:
    calls = estimate_v3_model_calls(
        [AgentNode.DETECT_FAST, AgentNode.RISK_GATE, AgentNode.ACT_MINIMAL, AgentNode.END]
    )

    assert calls == 1


def test_estimate_v3_model_calls_for_deep_path() -> None:
    calls = estimate_v3_model_calls(
        [AgentNode.DETECT_FAST, AgentNode.RISK_GATE, AgentNode.UNDERSTAND_DEEP]
    )

    assert calls == 4


def test_default_v2_v3_metrics_has_reduction_and_case_coverage() -> None:
    report = build_default_v2_v3_metrics()

    assert report["aggregate"]["case_count"] >= 4
    assert report["aggregate"]["v2_avg_calls_per_frame"] == 5.0
    assert report["aggregate"]["v3_avg_calls_per_frame"] < 5.0
    assert report["aggregate"]["estimated_call_reduction_pct"] > 0.0
