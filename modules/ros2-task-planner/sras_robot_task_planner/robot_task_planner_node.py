#!/usr/bin/env python3
"""ROS2 node that turns reasoning events into robot task requests."""

from __future__ import annotations

import json
import math
import os
import time
from typing import Any

from nav_msgs.msg import OccupancyGrid, Odometry
import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from std_srvs.srv import Trigger

from .cosmos_assignment_reasoner import CosmosAssignmentReasonerClient
from .cosmos_deep_planner import CosmosDeepPlannerClient
from .cosmos_intruder_reasoner import CosmosIntruderReasonerClient
from .detection_buffer import DetectionBuffer, SceneSnapshot
from .dashboard_notifications import (
    NotificationThrottle,
    ThrottleConfig,
    build_notification,
)
from .goal_builder import build_goal_from_detection, pick_target_position
from .planner_journal import SQLitePlannerJournal
from .planner_core import (
    PlannerConfig,
    PlannerEngine,
    PlannerEvent,
    PlannerTask,
    TaskLifecycleState,
)
from .robot_registry import (
    DEFAULT_CAPABILITIES,
    RobotCapabilities,
    RobotReadiness,
    RobotRegistry,
    RobotType,
)


class RobotTaskPlannerNode(Node):
    """Planner node with deterministic baseline and optional deep reasoning."""

    def __init__(self) -> None:
        super().__init__("robot_task_planner_node")
        self._journal: SQLitePlannerJournal | None = None
        self._resolved_journal_path: str | None = None
        self._robot_position: dict[str, float] | None = None
        self._detection_buffer: DetectionBuffer | None = None
        self._intruder_reasoner: CosmosIntruderReasonerClient | None = None
        self._declare_parameters()
        self._load_config()
        self._setup_engine()
        self._setup_detection_pipeline()
        self._setup_ros()
        self._log_startup()

    def _declare_parameters(self) -> None:
        self.declare_parameter("blindspot_topic", "/reasoning/blindspot_events")
        self.declare_parameter("risk_topic", "/reasoning/risk_assessments")
        self.declare_parameter("task_status_topic", "/robot/task_status")
        self.declare_parameter("map_topic", "/map")
        self.declare_parameter("task_request_topic", "/reasoning/task_requests")

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

        self.declare_parameter("detection_topic", "/triangulated/detections_json")
        self.declare_parameter("odom_topic", "/odom")
        self.declare_parameter("detection_buffer_window_s", 10.0)
        self.declare_parameter("detection_position_shift_m", 1.5)
        self.declare_parameter("detection_sustained_frames", 3)
        self.declare_parameter("detection_cosmos_enabled", False)
        self.declare_parameter("detection_min_score", 0.3)
        self.declare_parameter("detection_alert_on_change", True)

        self.declare_parameter("dashboard_notifications_topic", "/ui/dashboard_notifications")

        self.declare_parameter("multi_robot_enabled", False)
        self.declare_parameter("max_active_tasks_per_robot", 1)
        self.declare_parameter("cosmos_assignment_enabled", False)
        self.declare_parameter("cosmos_assignment_timeout_s", 3.0)

    def _load_config(self) -> None:
        self.blindspot_topic = str(self.get_parameter("blindspot_topic").value)
        self.risk_topic = str(self.get_parameter("risk_topic").value)
        self.task_status_topic = str(self.get_parameter("task_status_topic").value)
        self.map_topic = str(self.get_parameter("map_topic").value)
        self.task_request_topic = str(self.get_parameter("task_request_topic").value)

        self.planner_state_topic = str(self.get_parameter("planner_state_topic").value)
        self.set_task_state_topic = str(self.get_parameter("set_task_state_topic").value)
        self.tick_hz = max(0.1, float(self.get_parameter("planner_tick_hz").value))

        self.multi_robot_enabled = bool(self.get_parameter("multi_robot_enabled").value)
        self.max_active_tasks_per_robot = max(
            1, int(self.get_parameter("max_active_tasks_per_robot").value)
        )
        self.cosmos_assignment_enabled = bool(
            self.get_parameter("cosmos_assignment_enabled").value
        )
        self.cosmos_assignment_timeout_s = max(
            0.1, float(self.get_parameter("cosmos_assignment_timeout_s").value)
        )

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
            multi_robot_enabled=self.multi_robot_enabled,
            max_active_tasks_per_robot=self.max_active_tasks_per_robot,
            cosmos_assignment_enabled=self.cosmos_assignment_enabled,
            cosmos_assignment_timeout_s=self.cosmos_assignment_timeout_s,
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

        self.detection_topic = str(self.get_parameter("detection_topic").value)
        self.odom_topic = str(self.get_parameter("odom_topic").value)
        self.detection_buffer_window_s = float(
            self.get_parameter("detection_buffer_window_s").value
        )
        self.detection_position_shift_m = float(
            self.get_parameter("detection_position_shift_m").value
        )
        self.detection_sustained_frames = int(
            self.get_parameter("detection_sustained_frames").value
        )
        self.detection_cosmos_enabled = bool(
            self.get_parameter("detection_cosmos_enabled").value
        )
        self.detection_min_score = float(self.get_parameter("detection_min_score").value)
        self.detection_alert_on_change = bool(
            self.get_parameter("detection_alert_on_change").value
        )
        self.dashboard_notifications_topic = str(
            self.get_parameter("dashboard_notifications_topic").value
        )

    def _setup_engine(self) -> None:
        self.engine = PlannerEngine(config=self.config, now_fn=time.time)
        self._registry: RobotRegistry | None = None
        self._odom_subs: list[Any] = []

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
            else:
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

        if self.multi_robot_enabled:
            self._setup_multi_robot()

    def _setup_multi_robot(self) -> None:
        self._registry = RobotRegistry(now_fn=time.time)
        self.engine.set_robot_registry(self._registry)

        fleet_config = self._load_fleet_config()
        for entry in fleet_config:
            robot_id = str(entry.get("robot_id", ""))
            robot_type_str = str(entry.get("robot_type", "quadruped")).lower()
            robot_type = (
                RobotType.HUMANOID
                if robot_type_str == "humanoid"
                else RobotType.QUADRUPED
            )
            nav2_ready = bool(entry.get("nav2_ready", True))
            default_caps = DEFAULT_CAPABILITIES.get(robot_type, RobotCapabilities())
            caps = RobotCapabilities(
                can_pursue=default_caps.can_pursue,
                can_block_exit=default_caps.can_block_exit,
                can_guard=default_caps.can_guard,
                can_inspect=default_caps.can_inspect,
                can_patrol=default_caps.can_patrol,
                max_speed_mps=default_caps.max_speed_mps,
                nav2_ready=nav2_ready,
            )

            self._registry.register_robot(robot_id, robot_type, caps)

            odom_topic = str(entry.get("odom_topic", f"/{robot_id}/odom"))
            sub = self.create_subscription(
                Odometry,
                odom_topic,
                lambda msg, rid=robot_id: self._multi_odom_callback(msg, rid),
                10,
            )
            self._odom_subs.append(sub)
            self.get_logger().info(
                f"Registered robot {robot_id} ({robot_type.value}) "
                f"odom={odom_topic} nav2_ready={nav2_ready}"
            )

        if self.cosmos_assignment_enabled and self.cosmos_api_base:
            try:
                assignment_client = CosmosAssignmentReasonerClient(
                    api_base=self.cosmos_api_base,
                    model=self.cosmos_model,
                    max_retries=self.cosmos_max_retries,
                )
                self.engine.set_assignment_client(assignment_client)
                self.get_logger().info("Cosmos assignment reasoner enabled")
            except Exception as exc:
                self.get_logger().error(
                    f"Failed to initialize Cosmos assignment client: {exc}"
                )

    def _load_fleet_config(self) -> list[dict[str, Any]]:
        try:
            self.declare_parameter("robot_fleet", rclpy.Parameter.Type.STRING_ARRAY)
            raw = self.get_parameter("robot_fleet").value
            if isinstance(raw, list):
                return [{"robot_id": r} for r in raw]
        except Exception as exc:
            self.get_logger().warning(
                f"Could not load robot_fleet parameter (YAML nested lists are not "
                f"supported as ROS2 parameters), using hardcoded defaults: {exc}"
            )

        return [
            {"robot_id": "robot0", "robot_type": "quadruped", "odom_topic": "/robot0/odom", "nav2_ready": True},
            {"robot_id": "robot1", "robot_type": "humanoid", "odom_topic": "/robot1/odom", "nav2_ready": False},
        ]

    def _multi_odom_callback(self, msg: Odometry, robot_id: str) -> None:
        if self._registry is None:
            return
        pos = msg.pose.pose.position
        orient = msg.pose.pose.orientation
        yaw = math.atan2(
            2.0 * (orient.w * orient.z + orient.x * orient.y),
            1.0 - 2.0 * (orient.y * orient.y + orient.z * orient.z),
        )
        self._registry.update_position(robot_id, float(pos.x), float(pos.y), yaw)

    def _setup_detection_pipeline(self) -> None:
        self._detection_buffer = DetectionBuffer(
            window_s=self.detection_buffer_window_s,
            position_shift_threshold_m=self.detection_position_shift_m,
            sustained_presence_min_frames=self.detection_sustained_frames,
            now_fn=time.time,
        )
        if self.detection_cosmos_enabled and self.cosmos_api_base:
            try:
                self._intruder_reasoner = CosmosIntruderReasonerClient(
                    api_base=self.cosmos_api_base,
                    model=self.cosmos_model,
                    use_reasoning=self.cosmos_use_reasoning,
                    max_retries=self.cosmos_max_retries,
                )
            except Exception as exc:
                self.get_logger().error(
                    f"Failed to initialize intruder reasoner: {exc}"
                )

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

        self.detection_sub = self.create_subscription(
            String,
            self.detection_topic,
            self._detection_callback,
            10,
        )
        self.odom_sub = self.create_subscription(
            Odometry,
            self.odom_topic,
            self._odom_callback,
            10,
        )

        self.task_request_pub = self.create_publisher(String, self.task_request_topic, 10)

        self.planner_state_pub = self.create_publisher(String, self.planner_state_topic, 10)
        self.dashboard_notif_pub = self.create_publisher(
            String, self.dashboard_notifications_topic, 10,
        )
        self._notif_throttle = NotificationThrottle(
            config=ThrottleConfig(), now_fn=time.time,
        )

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
        self.get_logger().info(f"detection_topic: {self.detection_topic}")
        self.get_logger().info(f"odom_topic: {self.odom_topic}")
        self.get_logger().info(
            f"detection_cosmos: {'enabled' if self.detection_cosmos_enabled else 'disabled'}"
        )
        self.get_logger().info("=" * 60)

    def _odom_callback(self, msg: Odometry) -> None:
        pos = msg.pose.pose.position
        self._robot_position = {"x": float(pos.x), "y": float(pos.y)}

    def _detection_callback(self, msg: String) -> None:
        payload = self._safe_parse_json(msg.data)
        if payload is None:
            return

        if self._detection_buffer is None:
            return

        snapshot = DetectionBuffer.parse_detection_msg(payload)
        if snapshot is None:
            return

        # Filter low-score detections
        min_score = self.detection_min_score
        filtered_dets = tuple(d for d in snapshot.detections if d.score >= min_score)
        snapshot = SceneSnapshot(
            timestamp_s=snapshot.timestamp_s,
            frame_id=snapshot.frame_id,
            detections=filtered_dets,
        )

        self._detection_buffer.ingest(snapshot)

        if not self._detection_buffer.has_meaningful_changes():
            return

        self.get_logger().info(
            f"Detection change detected — {len(snapshot.detections)} objects in frame"
        )

        summary = self._detection_buffer.get_summary()
        changes = self._detection_buffer.detect_changes()
        change_descriptions = [
            f"{c.change_type}: {c.class_name}" for c in changes
        ]

        # Optional Cosmos threat assessment
        cosmos_target = None
        cosmos_reasoning = ""
        cosmos_task = None
        if self._intruder_reasoner is not None:
            try:
                assessment = self._intruder_reasoner.assess(
                    summary,
                    robot_position=self._robot_position,
                    timeout_s=float(self.config.deep_timeout_s),
                )
                cosmos_reasoning = assessment.reasoning
                cosmos_target = assessment.target_position
                cosmos_task = assessment.recommended_task
                if cosmos_task == "NONE":
                    self.get_logger().debug(
                        f"Cosmos says NONE for detection changes: {change_descriptions}"
                    )
                    return
            except Exception as exc:
                self.get_logger().warn(f"Intruder reasoner failed: {exc}")

        # Build goal from best available position
        detection_positions = [
            {"x": d.x, "y": d.y}
            for d in snapshot.detections
        ]
        target = pick_target_position(cosmos_target, detection_positions)
        goal = None
        if target is not None:
            robot_x = self._robot_position["x"] if self._robot_position else None
            robot_y = self._robot_position["y"] if self._robot_position else None
            goal = build_goal_from_detection(
                target_x=target[0],
                target_y=target[1],
                robot_x=robot_x,
                robot_y=robot_y,
                frame_id=snapshot.frame_id,
            )

        # Create incident key from change type
        change_key = changes[0].change_type if changes else "detection"
        incident_key = f"intruder-{change_key}-{int(time.time())}"

        event = PlannerEvent(
            incident_key=incident_key,
            event_type="intruder_detected",
            severity="high",
            confidence=0.7,
            asset_criticality=0.7,
            details={
                "source": "triangulated_detections",
                "class_counts": dict(summary.class_counts),
                "cosmos_reasoning": cosmos_reasoning,
                "goal": goal,
            },
            source="triangulated_detections",
        )
        self.engine.ingest_event(event)

        self._publish_notification(
            category="intruder_detected",
            level="warning",
            title="Intruder Detected",
            message=f"Detection changes: {', '.join(change_descriptions)}",
            incident_key=incident_key,
            metadata={
                "class_counts": dict(summary.class_counts),
                "cosmos_reasoning": cosmos_reasoning,
            },
        )


    def _event_callback(self, msg: String, default_event_type: str) -> None:
        payload = self._safe_parse_json(msg.data)
        if payload is None:
            self.get_logger().warn(f"Invalid JSON on {default_event_type} topic")
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
            self.get_logger().warn("Invalid task status JSON")
            return

        task_id = str(payload.get("task_id", "")).strip()
        status = str(payload.get("state") or payload.get("status") or "").strip()
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
            self.get_logger().warn("Invalid set_task_state JSON")
            return

        task_id = str(payload.get("task_id", "")).strip()
        command_raw = str(payload.get("command", "")).strip().lower()
        if not task_id or not command_raw:
            self.get_logger().warn("set_task_state requires fields: task_id, command")
            return

        accepted, reason, task = self.engine.apply_command(task_id, command_raw)
        log_fn = self.get_logger().info if accepted else self.get_logger().warn
        log_fn(f"set_task_state task_id={task_id}: {reason}")

        if accepted and task is not None and task.state == TaskLifecycleState.DISPATCHED:
            # Approve/resume can transition a task back into executable state.
            self._publish_task_request(task, trigger="operator_command")

    def _tick_callback(self) -> None:
        tasks = self.engine.tick()
        for task in tasks:
            self._publish_task_request(task, trigger="planner_tick")
            self._publish_notification(
                category="plan_scheduled",
                level="info",
                title="Task Dispatched",
                message=f"Task {task.task_id} dispatched ({task.task_type})",
                task_id=task.task_id,
                incident_key=task.incident_key,
                metadata={"task_type": task.task_type, "priority": task.priority},
            )

        # Drain engine alerts (logged only; no more /ui/alerts topic)
        self.engine.pop_alerts()

        self._publish_planner_state()

    def _publish_task_request(self, task: PlannerTask, trigger: str) -> None:
        goal = task.goal or task.payload.get("goal")
        message = String()
        payload_dict: dict[str, Any] = {
            "task_id": task.task_id,
            "incident_key": task.incident_key,
            "task_type": task.task_type,
            "priority": task.priority,
            "goal": goal,
            "state": task.state.value,
            "route": task.route,
            "requires_approval": task.requires_approval,
            "trigger": trigger,
            "payload": task.payload,
            "timestamp_s": time.time(),
        }
        if task.robot_id is not None:
            payload_dict["robot_id"] = task.robot_id
        message.data = json.dumps(payload_dict)
        self.task_request_pub.publish(message)


    def _publish_planner_state(self) -> None:
        stats = self.engine.get_stats()
        if self._registry is not None:
            stats["robot_registry"] = self._registry.snapshot()
        state_msg = String()
        state_msg.data = json.dumps(stats)
        self.planner_state_pub.publish(state_msg)

    def _publish_notification(
        self,
        *,
        category: str,
        level: str,
        title: str,
        message: str,
        task_id: str = "",
        incident_key: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        try:
            notif = build_notification(
                category=category,
                level=level,
                title=title,
                message=message,
                task_id=task_id,
                incident_key=incident_key,
                metadata=metadata,
                now_fn=time.time,
            )
            if not self._notif_throttle.should_publish(notif):
                self.get_logger().debug(
                    f"Throttled notification category={category} task_id={task_id}"
                )
                return
            ros_msg = String()
            ros_msg.data = notif.to_json()
            self.dashboard_notif_pub.publish(ros_msg)
        except Exception as exc:
            self.get_logger().error(
                f"Failed to publish dashboard notification "
                f"category={category} task_id={task_id}: {exc}"
            )

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
