from __future__ import annotations

import json

import rclpy
from geometry_msgs.msg import PoseStamped
from rclpy.node import Node
from std_msgs.msg import String
from std_srvs.srv import SetBool, Trigger
from warehouse_security_msgs.msg import RobotTask

from .patrol_core import (
    DEFAULT_WAREHOUSE_ROUTE,
    PatrolSchedule,
    PatrolState,
    create_patrol_task,
    patrol_state_to_json,
    should_dispatch,
)


class PatrolSchedulerNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_patrol_scheduler")
        self._declare_parameters()
        self._load_parameters()
        self._setup_state()
        self._setup_ros()

    def _declare_parameters(self) -> None:
        self.declare_parameter("patrol_interval_s", 120.0)
        self.declare_parameter("patrol_priority", 2)
        self.declare_parameter("patrol_timeout_s", 300.0)
        self.declare_parameter("auto_approved", True)
        self.declare_parameter("check_interval_s", 10.0)
        self.declare_parameter("nav_readiness_topic", "/robot/nav_readiness")
        self.declare_parameter("task_requests_topic", "/reasoning/task_requests")

    def _load_parameters(self) -> None:
        self.patrol_interval_s = float(self.get_parameter("patrol_interval_s").value)
        self.patrol_priority = int(self.get_parameter("patrol_priority").value)
        self.patrol_timeout_s = float(self.get_parameter("patrol_timeout_s").value)
        self.auto_approved = bool(self.get_parameter("auto_approved").value)
        self.check_interval_s = float(self.get_parameter("check_interval_s").value)
        self.nav_readiness_topic = str(self.get_parameter("nav_readiness_topic").value)
        self.task_requests_topic = str(self.get_parameter("task_requests_topic").value)

    def _setup_state(self) -> None:
        schedule = PatrolSchedule(
            route=DEFAULT_WAREHOUSE_ROUTE,
            interval_s=self.patrol_interval_s,
            priority=self.patrol_priority,
            auto_approved=self.auto_approved,
            timeout_s=self.patrol_timeout_s,
        )
        self.state = PatrolState(
            schedule=schedule,
            last_dispatched_s=0.0,
            patrol_count=0,
            is_paused=False,
        )
        self.nav_ready = False

    def _setup_ros(self) -> None:
        self.task_pub = self.create_publisher(RobotTask, self.task_requests_topic, 10)
        self.create_subscription(String, self.nav_readiness_topic, self._on_nav_readiness, 10)
        self.create_timer(self.check_interval_s, self._on_timer)
        self.create_service(SetBool, "~/pause_patrol", self._handle_pause_patrol)
        self.create_service(Trigger, "~/get_status", self._handle_get_status)

    def _on_nav_readiness(self, msg: String) -> None:
        try:
            payload = json.loads(msg.data)
            self.nav_ready = int(payload.get("status", 0)) == 3
        except (json.JSONDecodeError, TypeError, ValueError):
            self.get_logger().warning("Failed to parse nav readiness JSON payload")

    def _on_timer(self) -> None:
        now_s = self.get_clock().now().nanoseconds / 1e9
        if not should_dispatch(self.state, now_s, self.nav_ready):
            return

        task_payload = create_patrol_task(self.state, now_s)
        task_msg = self._task_from_payload(task_payload)
        self.task_pub.publish(task_msg)

    def _task_from_payload(self, payload: dict) -> RobotTask:
        msg = RobotTask()
        now = self.get_clock().now().to_msg()
        msg.header.stamp = now
        msg.header.frame_id = "map"

        msg.task_id = str(payload["task_id"])
        msg.task_type = RobotTask.TASK_PATROL_ROUTE
        msg.priority = int(payload["priority"])
        msg.description = str(payload["description"])
        msg.source_event_id = str(payload["source_event_id"])
        msg.timeout_s = float(payload["timeout_s"])
        msg.auto_approved = bool(payload["auto_approved"])

        waypoints = []
        for wp in payload.get("waypoints", []):
            pose = PoseStamped()
            pose.header.stamp = now
            pose.header.frame_id = "map"
            pose.pose.position.x = float(wp["x"])
            pose.pose.position.y = float(wp["y"])
            pose.pose.position.z = float(wp["z"])
            pose.pose.orientation.w = 1.0
            waypoints.append(pose)

        msg.waypoints = waypoints

        if waypoints:
            msg.target_pose = waypoints[0]

        return msg

    def _handle_pause_patrol(
        self, request: SetBool.Request, response: SetBool.Response
    ) -> SetBool.Response:
        self.state.is_paused = bool(request.data)
        response.success = True
        response.message = "Patrol paused" if self.state.is_paused else "Patrol resumed"
        return response

    def _handle_get_status(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        response.success = True
        response.message = patrol_state_to_json(self.state)
        return response


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = PatrolSchedulerNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
