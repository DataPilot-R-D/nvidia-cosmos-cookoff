from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from enum import IntEnum


class GuardrailVerdict(IntEnum):
    ALLOW = 0
    REQUIRE_APPROVAL = 1
    DENY = 2


class RiskLevel(IntEnum):
    LOW = 0
    MEDIUM = 1
    HIGH = 2
    CRITICAL = 3


class TaskType(IntEnum):
    INSPECT_POI = 0
    INSPECT_BLINDSPOT = 1
    PATROL_ROUTE = 2
    INVESTIGATE_INCIDENT = 3
    RETURN_HOME = 4


@dataclass
class VerdictReason:
    verdict: GuardrailVerdict
    rule_name: str
    message: str


@dataclass
class GuardrailPolicy:
    allowed_task_types: list[int] = field(default_factory=lambda: [0, 1, 2, 3, 4])
    max_auto_approve_risk: int = 1
    forbidden_zones: list[str] = field(default_factory=list)
    max_speed_mps: float = 1.0
    require_nav_ready: bool = True
    require_operator_for_critical: bool = True
    max_concurrent_tasks: int = 2
    patrol_allowed_risk_levels: list[int] = field(default_factory=lambda: [0, 1])


DEFAULT_POLICY = GuardrailPolicy()


def evaluate_task(
    task: dict,
    policy: GuardrailPolicy,
    current_risk_level: int = 0,
    nav_ready: bool = True,
    active_task_count: int = 0,
) -> VerdictReason:
    task_type = int(task.get("task_type", -1))

    if task_type not in policy.allowed_task_types:
        return VerdictReason(
            verdict=GuardrailVerdict.DENY,
            rule_name="task_type_not_allowed",
            message=f"task_type={task_type} not allowed by policy",
        )

    target_zone = _extract_target_zone(task)
    if target_zone in policy.forbidden_zones:
        return VerdictReason(
            verdict=GuardrailVerdict.DENY,
            rule_name="forbidden_zone",
            message=f"target zone '{target_zone}' is forbidden",
        )

    if int(active_task_count) >= int(policy.max_concurrent_tasks):
        return VerdictReason(
            verdict=GuardrailVerdict.DENY,
            rule_name="max_concurrent_tasks",
            message=(
                f"active_task_count={int(active_task_count)} exceeds "
                f"max_concurrent_tasks={int(policy.max_concurrent_tasks)}"
            ),
        )

    if policy.require_nav_ready and not bool(nav_ready):
        return VerdictReason(
            verdict=GuardrailVerdict.DENY,
            rule_name="nav_not_ready",
            message="navigation readiness is required but nav_ready=False",
        )

    if task_type == int(TaskType.PATROL_ROUTE) and int(current_risk_level) not in policy.patrol_allowed_risk_levels:
        return VerdictReason(
            verdict=GuardrailVerdict.REQUIRE_APPROVAL,
            rule_name="patrol_risk_restriction",
            message=(
                f"patrol task blocked at risk_level={int(current_risk_level)}; "
                f"allowed={policy.patrol_allowed_risk_levels}"
            ),
        )

    if (
        int(current_risk_level) >= int(RiskLevel.CRITICAL)
        and bool(policy.require_operator_for_critical)
    ):
        return VerdictReason(
            verdict=GuardrailVerdict.REQUIRE_APPROVAL,
            rule_name="critical_requires_operator",
            message=(
                f"risk_level={int(current_risk_level)} is CRITICAL and "
                "operator approval is required"
            ),
        )

    if int(current_risk_level) > int(policy.max_auto_approve_risk):
        return VerdictReason(
            verdict=GuardrailVerdict.REQUIRE_APPROVAL,
            rule_name="risk_above_auto_approve",
            message=(
                f"risk_level={int(current_risk_level)} exceeds "
                f"max_auto_approve_risk={int(policy.max_auto_approve_risk)}"
            ),
        )

    return VerdictReason(
        verdict=GuardrailVerdict.ALLOW,
        rule_name="allowed",
        message="task satisfies current guardrail policy",
    )


def evaluate_risk_action(risk_level: int, policy: GuardrailPolicy) -> VerdictReason:
    if int(risk_level) >= int(RiskLevel.CRITICAL) and bool(policy.require_operator_for_critical):
        return VerdictReason(
            verdict=GuardrailVerdict.REQUIRE_APPROVAL,
            rule_name="critical_requires_operator",
            message="critical risk requires operator approval",
        )

    if int(risk_level) > int(policy.max_auto_approve_risk):
        return VerdictReason(
            verdict=GuardrailVerdict.REQUIRE_APPROVAL,
            rule_name="risk_above_auto_approve",
            message="risk exceeds automatic approval threshold",
        )

    return VerdictReason(
        verdict=GuardrailVerdict.ALLOW,
        rule_name="risk_within_auto_approve",
        message="risk is within automatic approval threshold",
    )


def policy_to_json(policy: GuardrailPolicy) -> str:
    return json.dumps(asdict(policy), sort_keys=True)


def json_to_policy(json_str: str) -> GuardrailPolicy:
    payload = json.loads(json_str)
    return GuardrailPolicy(
        allowed_task_types=[int(value) for value in payload.get("allowed_task_types", [0, 1, 2, 3, 4])],
        max_auto_approve_risk=int(payload.get("max_auto_approve_risk", 1)),
        forbidden_zones=[str(value) for value in payload.get("forbidden_zones", [])],
        max_speed_mps=float(payload.get("max_speed_mps", 1.0)),
        require_nav_ready=bool(payload.get("require_nav_ready", True)),
        require_operator_for_critical=bool(payload.get("require_operator_for_critical", True)),
        max_concurrent_tasks=int(payload.get("max_concurrent_tasks", 2)),
        patrol_allowed_risk_levels=[int(value) for value in payload.get("patrol_allowed_risk_levels", [0, 1])],
    )


def _extract_target_zone(task: dict) -> str:
    for key in ("zone_id", "target_zone", "target_zone_id"):
        value = task.get(key)
        if isinstance(value, str) and value:
            return value

    header = task.get("header")
    if isinstance(header, dict):
        frame_id = header.get("frame_id")
        if isinstance(frame_id, str) and frame_id:
            return frame_id

    target_pose = task.get("target_pose")
    if isinstance(target_pose, dict):
        target_header = target_pose.get("header")
        if isinstance(target_header, dict):
            frame_id = target_header.get("frame_id")
            if isinstance(frame_id, str) and frame_id:
                return frame_id

    return ""
