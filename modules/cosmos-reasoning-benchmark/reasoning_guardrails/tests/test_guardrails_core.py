from sras_reasoning_guardrails.guardrails_core import (
    DEFAULT_POLICY,
    GuardrailPolicy,
    GuardrailVerdict,
    TaskType,
    evaluate_risk_action,
    evaluate_task,
    json_to_policy,
    policy_to_json,
)


def test_evaluate_task_allowed_default() -> None:
    task = {"task_type": int(TaskType.INSPECT_POI), "zone_id": "zone_a"}
    verdict = evaluate_task(task=task, policy=DEFAULT_POLICY, current_risk_level=0, nav_ready=True)
    assert verdict.verdict == GuardrailVerdict.ALLOW


def test_evaluate_task_denied_forbidden_zone() -> None:
    policy = GuardrailPolicy(forbidden_zones=["restricted_zone"])
    task = {"task_type": int(TaskType.INSPECT_POI), "zone_id": "restricted_zone"}
    verdict = evaluate_task(task=task, policy=policy)
    assert verdict.verdict == GuardrailVerdict.DENY
    assert verdict.rule_name == "forbidden_zone"


def test_evaluate_task_denied_unknown_type() -> None:
    task = {"task_type": 99, "zone_id": "zone_a"}
    verdict = evaluate_task(task=task, policy=DEFAULT_POLICY)
    assert verdict.verdict == GuardrailVerdict.DENY
    assert verdict.rule_name == "task_type_not_allowed"


def test_evaluate_task_denied_nav_not_ready() -> None:
    task = {"task_type": int(TaskType.INSPECT_POI), "zone_id": "zone_a"}
    verdict = evaluate_task(task=task, policy=DEFAULT_POLICY, nav_ready=False)
    assert verdict.verdict == GuardrailVerdict.DENY
    assert verdict.rule_name == "nav_not_ready"


def test_evaluate_task_denied_max_concurrent() -> None:
    task = {"task_type": int(TaskType.INSPECT_POI), "zone_id": "zone_a"}
    verdict = evaluate_task(task=task, policy=DEFAULT_POLICY, active_task_count=2)
    assert verdict.verdict == GuardrailVerdict.DENY
    assert verdict.rule_name == "max_concurrent_tasks"


def test_evaluate_task_require_approval_critical() -> None:
    task = {"task_type": int(TaskType.INVESTIGATE_INCIDENT), "zone_id": "zone_a"}
    verdict = evaluate_task(task=task, policy=DEFAULT_POLICY, current_risk_level=3)
    assert verdict.verdict == GuardrailVerdict.REQUIRE_APPROVAL
    assert verdict.rule_name == "critical_requires_operator"


def test_evaluate_task_require_approval_high_risk() -> None:
    task = {"task_type": int(TaskType.INSPECT_POI), "zone_id": "zone_a"}
    verdict = evaluate_task(task=task, policy=DEFAULT_POLICY, current_risk_level=2)
    assert verdict.verdict == GuardrailVerdict.REQUIRE_APPROVAL
    assert verdict.rule_name == "risk_above_auto_approve"


def test_evaluate_task_patrol_blocked_by_risk() -> None:
    task = {"task_type": int(TaskType.PATROL_ROUTE), "zone_id": "zone_a"}
    verdict = evaluate_task(task=task, policy=DEFAULT_POLICY, current_risk_level=2)
    assert verdict.verdict == GuardrailVerdict.REQUIRE_APPROVAL
    assert verdict.rule_name == "patrol_risk_restriction"


def test_evaluate_risk_action_low() -> None:
    verdict = evaluate_risk_action(risk_level=0, policy=DEFAULT_POLICY)
    assert verdict.verdict == GuardrailVerdict.ALLOW


def test_policy_json_roundtrip() -> None:
    policy = GuardrailPolicy(
        allowed_task_types=[0, 3],
        max_auto_approve_risk=0,
        forbidden_zones=["zone_x"],
        max_speed_mps=0.8,
        require_nav_ready=True,
        require_operator_for_critical=False,
        max_concurrent_tasks=1,
        patrol_allowed_risk_levels=[0],
    )

    encoded = policy_to_json(policy)
    decoded = json_to_policy(encoded)

    assert decoded == policy
