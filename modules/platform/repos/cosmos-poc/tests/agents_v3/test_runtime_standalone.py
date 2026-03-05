"""Regression guards for V3 runtime standalone behavior."""

from __future__ import annotations

import inspect

from src.agents.v3 import runtime


def test_v3_runtime_has_no_v2_fallback_field() -> None:
    source = inspect.getsource(runtime.SurveillanceAgentV3)

    assert "_v2_fallback" not in source
    assert "from src.agents.surveillance_agent import SurveillanceAgent" not in source
