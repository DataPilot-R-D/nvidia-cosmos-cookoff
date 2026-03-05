"""State contracts for surveillance agent V3 graph routing."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class AgentNode(str, Enum):
    """Graph nodes for the minimal V3 routing slice."""

    DETECT_FAST = "detect_fast"
    RISK_GATE = "risk_gate"
    ACT_MINIMAL = "act_minimal"
    UNDERSTAND_DEEP = "understand_deep"
    DECIDE = "decide"
    TOOL_EXEC = "tool_exec"
    VERIFY = "verify"
    ESCALATE = "escalate"
    END = "end"


class RouteTarget(str, Enum):
    """Routing outcomes selected by the risk gate."""

    EARLY_EXIT = "early_exit"
    DEEP_ANALYSIS = "deep_analysis"


class VerifyOutcome(str, Enum):
    """Verification node outcomes used for re-entry routing."""

    RESOLVED = "resolved"
    UNRESOLVED = "unresolved"
    ESCALATE = "escalate"


@dataclass
class AgentState:
    """Mutable state passed through V3 graph execution."""

    detection_alert_level: str = "unknown"
    detection_confidence: float = 0.0
    has_signal_conflict: bool = False
    max_reentries: int = 2
    reentry_count: int = 0
    verify_outcome: VerifyOutcome | None = None
    terminated_by_budget: bool = False
    deep_context: list[dict[str, Any]] = field(default_factory=list)
    current_node: AgentNode = AgentNode.DETECT_FAST
    path: list[AgentNode] = field(default_factory=list)
