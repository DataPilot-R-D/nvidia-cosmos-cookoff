from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

import rclpy
from builtin_interfaces.msg import Time as TimeMsg
from rclpy.node import Node
from std_msgs.msg import String
from std_srvs.srv import Trigger
from warehouse_security_msgs.msg import OperatorAlert, RiskAssessment, RobotTask

from .guardrails_core import (
    DEFAULT_POLICY,
    GuardrailPolicy,
    GuardrailVerdict,
    evaluate_task,
    policy_to_json,
)


class ReasoningGuardrailsNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_reasoning_guardrails")
        self._declare_parameters()
        self._load_parameters()
        self._setup_state()
        self._setup_ros()

    def _declare_parameters(self) -> None:
        self.declare_parameter("risk_assessments_topic", "/reasoning/risk_assessments")
        self.declare_parameter("task_requests_topic", "/reasoning/task_requests")
        self.declare_parameter("nav_readiness_topic", "/robot/nav_readiness")
        self.declare_parameter("task_verdicts_topic", "~/task_verdicts")
        self.declare_parameter("alerts_topic", "/ui/alerts")

        self.declare_parameter("allowed_task_types", list(DEFAULT_POLICY.allowed_task_types))
        self.declare_parameter("max_auto_approve_risk", DEFAULT_POLICY.max_auto_approve_risk)
        self.declare_parameter("forbidden_zones", list(DEFAULT_POLICY.forbidden_zones))
        self.declare_parameter("max_speed_mps", DEFAULT_POLICY.max_speed_mps)
        self.declare_parameter("require_nav_ready", DEFAULT_POLICY.require_nav_ready)
        self.declare_parameter("require_operator_for_critical", DEFAULT_POLICY.require_operator_for_critical)
        self.declare_parameter("max_concurrent_tasks", DEFAULT_POLICY.max_concurrent_tasks)
        self.declare_parameter("patrol_allowed_risk_levels", list(DEFAULT_POLICY.patrol_allowed_risk_levels))

    def _load_parameters(self) -> None:
        self.risk_assessments_topic = str(self.get_parameter("risk_assessments_topic").value)
        self.task_requests_topic = str(self.get_parameter("task_requests_topic").value)
        self.nav_readiness_topic = str(self.get_parameter("nav_readiness_topic").value)
        self.task_verdicts_topic = str(self.get_parameter("task_verdicts_topic").value)
        self.alerts_topic = str(self.get_parameter("alerts_topic").value)

        self.policy = GuardrailPolicy(
            allowed_task_types=[int(value) for value in self.get_parameter("allowed_task_types").value],
            max_auto_approve_risk=int(self.get_parameter("max_auto_approve_risk").value),
            forbidden_zones=[str(value) for value in self.get_parameter("forbidden_zones").value],
            max_speed_mps=float(self.get_parameter("max_speed_mps").value),
            require_nav_ready=bool(self.get_parameter("require_nav_ready").value),
            require_operator_for_critical=bool(self.get_parameter("require_operator_for_critical").value),
            max_concurrent_tasks=int(self.get_parameter("max_concurrent_tasks").value),
            patrol_allowed_risk_levels=[
                int(value) for value in self.get_parameter("patrol_allowed_risk_levels").value
            ],
        )

    def _setup_state(self) -> None:
        self.nav_ready = True
        self.zone_risk_levels: dict[str, int] = {}
        self.active_tasks: set[str] = set()
        self.stats = {
            "tasks_evaluated": 0,
            "allowed": 0,
            "denied": 0,
            "escalated": 0,
        }

    def _setup_ros(self) -> None:
        self.verdict_pub = self.create_publisher(String, self.task_verdicts_topic, 10)
        self.alert_pub = self.create_publisher(OperatorAlert, self.alerts_topic, 10)

        self.create_subscription(RiskAssessment, self.risk_assessments_topic, self._on_risk_assessment, 10)
        self.create_subscription(RobotTask, self.task_requests_topic, self._on_task_request, 10)
        self.create_subscription(String, self.nav_readiness_topic, self._on_nav_readiness, 10)

        self.create_service(Trigger, "~/get_policy", self._handle_get_policy)
        self.create_service(Trigger, "~/get_status", self._handle_get_status)

    def _on_risk_assessment(self, msg: RiskAssessment) -> None:
        zone_id = str(msg.zone_id).strip()
        if not zone_id:
            zone_id = str(msg.header.frame_id).strip()
        if zone_id:
            self.zone_risk_levels[zone_id] = int(msg.risk_level)

    def _on_nav_readiness(self, msg: String) -> None:
        try:
            payload = json.loads(msg.data)
            self.nav_ready = int(payload.get("status", 0)) == 3
        except (json.JSONDecodeError, TypeError, ValueError):
            self.get_logger().warning("failed to parse nav readiness payload")

    def _on_task_request(self, msg: RobotTask) -> None:
        self.stats["tasks_evaluated"] += 1

        task_payload = self._task_to_dict(msg)
        task_zone = self._extract_zone_from_msg(msg)
        current_risk_level = self._current_risk_for_zone(task_zone)

        verdict = evaluate_task(
            task=task_payload,
            policy=self.policy,
            current_risk_level=current_risk_level,
            nav_ready=self.nav_ready,
            active_task_count=len(self.active_tasks),
        )

        if verdict.verdict == GuardrailVerdict.ALLOW:
            self.stats["allowed"] += 1
            if msg.task_id:
                self.active_tasks.add(msg.task_id)
        elif verdict.verdict == GuardrailVerdict.DENY:
            self.stats["denied"] += 1
            self._publish_operator_alert(msg, verdict)
        else:
            self.stats["escalated"] += 1
            self._publish_operator_alert(msg, verdict)

        self._publish_verdict(msg.task_id, verdict, task_zone, current_risk_level)

    def _publish_verdict(
        self,
        task_id: str,
        verdict,
        task_zone: str,
        current_risk_level: int,
    ) -> None:
        payload = {
            "task_id": str(task_id),
            "verdict": int(verdict.verdict),
            "rule_name": verdict.rule_name,
            "message": verdict.message,
            "zone_id": task_zone,
            "risk_level": int(current_risk_level),
        }

        out = String()
        out.data = json.dumps(payload, sort_keys=True)
        self.verdict_pub.publish(out)

    def _publish_operator_alert(self, task: RobotTask, verdict) -> None:
        msg = OperatorAlert()
        now = self.get_clock().now().nanoseconds / 1e9

        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = "operations"
        msg.alert_id = str(uuid4())
        msg.severity = (
            OperatorAlert.SEVERITY_CRITICAL
            if verdict.verdict == GuardrailVerdict.DENY
            else OperatorAlert.SEVERITY_HIGH
        )
        msg.title = (
            "Task Denied by Reasoning Guardrails"
            if verdict.verdict == GuardrailVerdict.DENY
            else "Task Requires Operator Approval"
        )
        msg.message = (
            f"task_id={task.task_id or '<empty>'} rule={verdict.rule_name}: {verdict.message}"
        )
        msg.source_node = "reasoning_guardrails"
        msg.related_task_id = str(task.task_id)
        msg.requires_action = True
        msg.timestamp_created = self._to_time_msg(now)

        self.alert_pub.publish(msg)

    def _current_risk_for_zone(self, zone_id: str) -> int:
        if zone_id and zone_id in self.zone_risk_levels:
            return int(self.zone_risk_levels[zone_id])
        if self.zone_risk_levels:
            return max(self.zone_risk_levels.values())
        return 0

    def _extract_zone_from_msg(self, msg: RobotTask) -> str:
        zone_id = str(msg.target_pose.header.frame_id).strip()
        if zone_id:
            return zone_id
        return str(msg.header.frame_id).strip()

    def _task_to_dict(self, msg: RobotTask) -> dict[str, Any]:
        return {
            "task_id": str(msg.task_id),
            "task_type": int(msg.task_type),
            "priority": int(msg.priority),
            "description": str(msg.description),
            "source_event_id": str(msg.source_event_id),
            "timeout_s": float(msg.timeout_s),
            "auto_approved": bool(msg.auto_approved),
            "zone_id": self._extract_zone_from_msg(msg),
        }

    def _handle_get_policy(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        response.success = True
        response.message = policy_to_json(self.policy)
        return response

    def _handle_get_status(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        payload = {
            "stats": dict(self.stats),
            "nav_ready": bool(self.nav_ready),
            "active_task_count": len(self.active_tasks),
            "tracked_zones": len(self.zone_risk_levels),
        }
        response.success = True
        response.message = json.dumps(payload, sort_keys=True)
        return response

    def _to_time_msg(self, stamp_s: float) -> TimeMsg:
        secs = int(stamp_s)
        nanosecs = int((stamp_s - secs) * 1_000_000_000)
        msg = TimeMsg()
        msg.sec = secs
        msg.nanosec = nanosecs
        return msg


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = ReasoningGuardrailsNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
