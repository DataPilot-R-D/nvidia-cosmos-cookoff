#!/usr/bin/env python3
"""ROS2 node that turns reasoning events into robot task requests."""

from __future__ import annotations

import json
import os
import time
from typing import Any

from nav_msgs.msg import OccupancyGrid
import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from std_srvs.srv import Trigger

from .cosmos_deep_planner import CosmosDeepPlannerClient
from .planner_journal import SQLitePlannerJournal
from .planner_core import (
    PlannerConfig,
    PlannerEngine,
    PlannerEvent,
    PlannerTask,
    TaskLifecycleState,
)


class RobotTaskPlannerNode(Node):
    """Planner node with deterministic baseline and optional deep reasoning."""

    def __init__(self) -> None:
        super().__init__("robot_task_planner_node")
        self._journal: SQLitePlannerJournal | None = None
        self._resolved_journal_path: str | None = None
        self._declare_parameters()
        self._load_config()
        self._setup_engine()
        self._setup_ros()
        self._log_startup()

    def _declare_parameters(self) -> None:
        self.declare_parameter("blindspot_topic", "/reasoning/blindspot_events")
        self.declare_parameter("risk_topic", "/reasoning/risk_assessments")
        self.declare_parameter("task_status_topic", "/robot/task_status")
        self.declare_parameter("map_topic", "/map")
        self.declare_parameter("task_request_topic", "/reasoning/task_requests")
        self.declare_parameter("alerts_topic", "/ui/alerts")
        self.declare_parameter("planner_state_topic", "~/planner_state")
        self.declare_parameter("set_task_state_topic", "/ui/set_task_state")
        self.declare_parameter("planner_tick_hz", 2.0)

        self.declare_parameter("incident_ttl_s", 600.0)
        self.declare_parameter("dedup_window_s", 60.0)
        self.declare_parameter("queue_max_size", 300)
        self.declare_parameter("max_active_tasks", 1)
        self.declare_parameter("auto_approve_max_severity", 0.55)
        self.declare_parameter("default_task_priority", 0.5)

        self.declare_parameter("require_map", True)
        self.declare_parameter("map_stale_timeout_s", 5.0)
        self.declare_parameter("require_nav_ready", False)

        self.declare_parameter("langgraph_enabled", False)
        self.declare_parameter("deep_conf_threshold", 0.8)
        self.declare_parameter("max_reentries", 2)

        self.declare_parameter("cosmos_enabled", False)
        self.declare_parameter("cosmos_api_base", "")
        self.declare_parameter("cosmos_model", "nvidia/cosmos-reason-2")
        self.declare_parameter("cosmos_timeout_s", 3.0)
        self.declare_parameter("cosmos_max_retries", 1)
        self.declare_parameter("cosmos_use_reasoning", False)

        self.declare_parameter("use_json_transport_fallback", True)
        self.declare_parameter("planner_journal_enabled", False)
        self.declare_parameter("planner_journal_path", "data/planner_journal.db")

    def _load_config(self) -> None:
        self.blindspot_topic = str(self.get_parameter("blindspot_topic").value)
        self.risk_topic = str(self.get_parameter("risk_topic").value)
        self.task_status_topic = str(self.get_parameter("task_status_topic").value)
        self.map_topic = str(self.get_parameter("map_topic").value)
        self.task_request_topic = str(self.get_parameter("task_request_topic").value)
        self.alerts_topic = str(self.get_parameter("alerts_topic").value)
        self.planner_state_topic = str(self.get_parameter("planner_state_topic").value)
        self.set_task_state_topic = str(self.get_parameter("set_task_state_topic").value)
        self.tick_hz = max(0.1, float(self.get_parameter("planner_tick_hz").value))

        self.config = PlannerConfig(
            dedup_window_s=float(self.get_parameter("dedup_window_s").value),
            incident_ttl_s=float(self.get_parameter("incident_ttl_s").value),
            queue_max_size=int(self.get_parameter("queue_max_size").value),
            max_active_tasks=max(1, int(self.get_parameter("max_active_tasks").value)),
            auto_approve_max_severity=float(
                self.get_parameter("auto_approve_max_severity").value
            ),
            default_task_priority=float(self.get_parameter("default_task_priority").value),
            require_map=bool(self.get_parameter("require_map").value),
            map_stale_timeout_s=float(self.get_parameter("map_stale_timeout_s").value),
            require_nav_ready=bool(self.get_parameter("require_nav_ready").value),
            langgraph_enabled=bool(self.get_parameter("langgraph_enabled").value),
            cosmos_enabled=bool(self.get_parameter("cosmos_enabled").value),
            deep_conf_threshold=float(self.get_parameter("deep_conf_threshold").value),
            deep_timeout_s=float(self.get_parameter("cosmos_timeout_s").value),
            max_reentries=max(0, int(self.get_parameter("max_reentries").value)),
        )

        self.cosmos_api_base = str(self.get_parameter("cosmos_api_base").value)
        self.cosmos_model = str(self.get_parameter("cosmos_model").value)
        self.cosmos_max_retries = int(self.get_parameter("cosmos_max_retries").value)
        self.cosmos_use_reasoning = bool(self.get_parameter("cosmos_use_reasoning").value)
        self.use_json_transport_fallback = bool(
            self.get_parameter("use_json_transport_fallback").value
        )
        self.planner_journal_enabled = bool(self.get_parameter("planner_journal_enabled").value)
        self.planner_journal_path = str(self.get_parameter("planner_journal_path").value)

    def _setup_engine(self) -> None:
        self.engine = PlannerEngine(config=self.config, now_fn=time.time)
        if self.planner_journal_enabled:
            journal_path = self.planner_journal_path.strip() or "data/planner_journal.db"
            self._resolved_journal_path = os.path.abspath(journal_path)
            try:
                self._journal = SQLitePlannerJournal(self._resolved_journal_path)
                self.engine.set_journal(self._journal)
            except Exception as exc:
                self.get_logger().error(f"Failed to initialize planner journal: {exc}")

        if self.config.langgraph_enabled and self.config.cosmos_enabled:
            if not self.cosmos_api_base:
                self.get_logger().warn(
                    "cosmos_enabled=true but cosmos_api_base is empty; "
                    "deep planning will fallback to deterministic."
                )
                return
            try:
                client = CosmosDeepPlannerClient(
                    api_base=self.cosmos_api_base,
                    model=self.cosmos_model,
                    use_reasoning=self.cosmos_use_reasoning,
                    max_retries=self.cosmos_max_retries,
                )
                self.engine.set_deep_planner_client(client)
            except Exception as exc:
                self.get_logger().error(f"Failed to initialize Cosmos client: {exc}")

    def _setup_ros(self) -> None:
        self.blindspot_sub = self.create_subscription(
            String,
            self.blindspot_topic,
            lambda msg: self._event_callback(msg, "blindspot"),
            10,
        )
        self.risk_sub = self.create_subscription(
            String,
            self.risk_topic,
            lambda msg: self._event_callback(msg, "risk_assessment"),
            10,
        )
        self.task_status_sub = self.create_subscription(
            String,
            self.task_status_topic,
            self._task_status_callback,
            10,
        )
        self.map_sub = self.create_subscription(
            OccupancyGrid,
            self.map_topic,
            self._map_callback,
            10,
        )
        self.set_task_state_sub = self.create_subscription(
            String,
            self.set_task_state_topic,
            self._set_task_state_callback,
            10,
        )

        self.task_request_pub = self.create_publisher(String, self.task_request_topic, 10)
        self.alerts_pub = self.create_publisher(String, self.alerts_topic, 10)
        self.planner_state_pub = self.create_publisher(String, self.planner_state_topic, 10)

        self.stats_srv = self.create_service(Trigger, "~/get_stats", self._get_stats_callback)
        self.tick_timer = self.create_timer(1.0 / self.tick_hz, self._tick_callback)

    def _log_startup(self) -> None:
        self.get_logger().info("=" * 60)
        self.get_logger().info("robot_task_planner_node started")
        self.get_logger().info("=" * 60)
        self.get_logger().info(f"blindspot_topic: {self.blindspot_topic}")
        self.get_logger().info(f"risk_topic: {self.risk_topic}")
        self.get_logger().info(f"task_status_topic: {self.task_status_topic}")
        self.get_logger().info(f"map_topic: {self.map_topic}")
        self.get_logger().info(f"task_request_topic: {self.task_request_topic}")
        self.get_logger().info(f"alerts_topic: {self.alerts_topic}")
        self.get_logger().info(f"set_task_state_topic: {self.set_task_state_topic}")
        self.get_logger().info(f"planner_tick_hz: {self.tick_hz}")
        self.get_logger().info(
            f"deep mode: {'enabled' if self.config.langgraph_enabled else 'disabled'}"
        )
        self.get_logger().info(
            f"cosmos: {'enabled' if self.config.cosmos_enabled else 'disabled'}"
        )
        self.get_logger().info(
            f"planner_journal: {'enabled' if self.planner_journal_enabled else 'disabled'}"
        )
        if self.planner_journal_enabled:
            path = self._resolved_journal_path or os.path.abspath(
                self.planner_journal_path.strip() or "data/planner_journal.db"
            )
            self.get_logger().info(f"planner_journal_path: {path}")
        self.get_logger().info("=" * 60)

    def _event_callback(self, msg: String, default_event_type: str) -> None:
        payload = self._safe_parse_json(msg.data)
        if payload is None:
            self._publish_alert(
                level="error",
                message=f"Invalid JSON on {default_event_type} topic",
            )
            return

        event = self._event_from_payload(payload, default_event_type)
        accepted = self.engine.ingest_event(event)
        if accepted:
            self.get_logger().debug(
                f"Ingested event incident={event.incident_key} type={event.event_type}"
            )
        else:
            self.get_logger().info(
                f"Deduplicated event incident={event.incident_key} type={event.event_type}"
            )

    def _task_status_callback(self, msg: String) -> None:
        payload = self._safe_parse_json(msg.data)
        if payload is None:
            self._publish_alert(level="error", message="Invalid task status JSON")
            return

        task_id = str(payload.get("task_id", "")).strip()
        status = str(payload.get("status", "")).strip()
        if not task_id or not status:
            return

        updated = self.engine.update_task_status(task_id=task_id, status=status, metadata=payload)
        if not updated:
            self.get_logger().warn(
                f"Failed to apply task status update task_id={task_id} status={status}"
            )

    def _map_callback(self, msg: OccupancyGrid) -> None:
        stamp_s = (
            float(msg.header.stamp.sec) + float(msg.header.stamp.nanosec) / 1_000_000_000.0
        )
        self.engine.update_map_metadata(
            width=int(msg.info.width),
            height=int(msg.info.height),
            resolution=float(msg.info.resolution),
            stamp_s=stamp_s,
            received_at_s=time.time(),
        )

    def _set_task_state_callback(self, msg: String) -> None:
        payload = self._safe_parse_json(msg.data)
        if payload is None:
            self._publish_alert(level="error", message="Invalid set_task_state JSON")
            return

        task_id = str(payload.get("task_id", "")).strip()
        command_raw = str(payload.get("command", "")).strip().lower()
        if not task_id or not command_raw:
            self._publish_alert(
                level="warning",
                message="set_task_state requires fields: task_id, command",
            )
            return

        accepted, reason, task = self.engine.apply_command(task_id, command_raw)
        level = "info" if accepted else "warning"
        self._publish_alert(level=level, message=reason, task_id=task_id)

        if accepted and task is not None and task.state == TaskLifecycleState.DISPATCHED:
            # Approve/resume can transition a task back into executable state.
            self._publish_task_request(task, trigger="operator_command")

    def _tick_callback(self) -> None:
        tasks = self.engine.tick()
        for task in tasks:
            self._publish_task_request(task, trigger="planner_tick")

        for alert in self.engine.pop_alerts():
            self._publish_alert(
                level=alert.level,
                message=alert.message,
                task_id=alert.task_id,
                incident_key=alert.incident_key,
            )

        self._publish_planner_state()

    def _publish_task_request(self, task: PlannerTask, trigger: str) -> None:
        message = String()
        message.data = json.dumps(
            {
                "task_id": task.task_id,
                "incident_key": task.incident_key,
                "task_type": task.task_type,
                "priority": task.priority,
                "state": task.state.value,
                "route": task.route,
                "requires_approval": task.requires_approval,
                "trigger": trigger,
                "payload": task.payload,
                "timestamp_s": time.time(),
            }
        )
        self.task_request_pub.publish(message)

    def _publish_alert(
        self,
        level: str,
        message: str,
        task_id: str | None = None,
        incident_key: str | None = None,
    ) -> None:
        envelope = {
            "level": level,
            "message": message,
            "task_id": task_id,
            "incident_key": incident_key,
            "timestamp_s": time.time(),
        }
        ros_msg = String()
        ros_msg.data = json.dumps(envelope)
        self.alerts_pub.publish(ros_msg)

    def _publish_planner_state(self) -> None:
        state_msg = String()
        state_msg.data = json.dumps(self.engine.get_stats())
        self.planner_state_pub.publish(state_msg)

    def _event_from_payload(
        self,
        payload: dict[str, Any],
        default_event_type: str,
    ) -> PlannerEvent:
        incident_key = str(
            payload.get("incident_key")
            or payload.get("event_id")
            or payload.get("id")
            or f"incident-{int(time.time() * 1000)}"
        )
        event_type = str(payload.get("event_type") or default_event_type)
        severity = payload.get("severity", "medium")
        confidence = self._to_float(payload.get("confidence"), default=0.5)
        asset_criticality = self._to_float(payload.get("asset_criticality"), default=0.5)
        has_signal_conflict = bool(payload.get("has_signal_conflict", False))
        source = str(payload.get("source", default_event_type))
        timestamp_s = self._extract_timestamp(payload.get("timestamp"))

        return PlannerEvent(
            incident_key=incident_key,
            event_type=event_type,
            severity=severity,
            confidence=confidence,
            asset_criticality=asset_criticality,
            has_signal_conflict=has_signal_conflict,
            details=payload,
            source=source,
            timestamp_s=timestamp_s,
        )

    def _get_stats_callback(self, request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        del request
        try:
            response.success = True
            response.message = json.dumps(self.engine.get_stats())
        except Exception as exc:
            response.success = False
            response.message = f"Failed to collect stats: {exc}"
        return response

    @staticmethod
    def _safe_parse_json(raw: str) -> dict[str, Any] | None:
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None

    @staticmethod
    def _to_float(value: Any, default: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    @staticmethod
    def _extract_timestamp(value: Any) -> float | None:
        if value is None:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def destroy_node(self) -> bool:
        if self._journal is not None:
            try:
                self._journal.close()
            except Exception as exc:
                self.get_logger().warn(f"Failed to close planner journal cleanly: {exc}")
        self.get_logger().info("Shutting down robot_task_planner_node")
        return super().destroy_node()


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    try:
        node = RobotTaskPlannerNode()
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
