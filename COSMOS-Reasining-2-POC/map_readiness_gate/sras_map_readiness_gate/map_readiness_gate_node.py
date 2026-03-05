from __future__ import annotations

from typing import Any

import rclpy
from lifecycle_msgs.msg import TransitionEvent
from nav_msgs.msg import OccupancyGrid
from rclpy.node import Node
from std_msgs.msg import String
from std_srvs.srv import Trigger
from tf2_msgs.msg import TFMessage

from .readiness_core import evaluate_readiness, readiness_to_json


class MapReadinessGateNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_map_readiness_gate")
        self._declare_parameters()
        self._load_parameters()
        self._setup_state()
        self._setup_ros()

    def _declare_parameters(self) -> None:
        self.declare_parameter("map_topic", "/map")
        self.declare_parameter("tf_topic", "/tf")
        self.declare_parameter("nav2_lifecycle_topic", "/nav2_lifecycle_manager/transition_event")
        self.declare_parameter("readiness_topic", "/robot/nav_readiness")
        self.declare_parameter("max_map_age_s", 300.0)
        self.declare_parameter("max_tf_age_s", 5.0)
        self.declare_parameter("check_interval_s", 1.0)

    def _load_parameters(self) -> None:
        self.map_topic = str(self.get_parameter("map_topic").value)
        self.tf_topic = str(self.get_parameter("tf_topic").value)
        self.nav2_lifecycle_topic = str(self.get_parameter("nav2_lifecycle_topic").value)
        self.readiness_topic = str(self.get_parameter("readiness_topic").value)
        self.max_map_age_s = float(self.get_parameter("max_map_age_s").value)
        self.max_tf_age_s = float(self.get_parameter("max_tf_age_s").value)
        self.check_interval_s = float(self.get_parameter("check_interval_s").value)

    def _setup_state(self) -> None:
        self.map_received = False
        self.tf_valid = False
        self.nav2_active = False
        self.map_timestamp_s = 0.0
        self.tf_timestamp_s = 0.0
        self.current_state_json = ""

    def _setup_ros(self) -> None:
        self.readiness_pub = self.create_publisher(String, self.readiness_topic, 10)
        self.create_subscription(OccupancyGrid, self.map_topic, self._on_map, 10)
        self.create_subscription(TFMessage, self.tf_topic, self._on_tf, 10)
        self.create_subscription(TransitionEvent, self.nav2_lifecycle_topic, self._on_nav2_transition, 10)
        self.create_timer(self.check_interval_s, self._on_timer)
        self.create_service(Trigger, "~/get_readiness", self._handle_get_readiness)

    def _on_map(self, msg: OccupancyGrid) -> None:
        self.map_received = True
        self.map_timestamp_s = self._stamp_to_seconds(msg.header.stamp)

    def _on_tf(self, msg: TFMessage) -> None:
        found_match = False
        latest_stamp = self.tf_timestamp_s

        for transform in msg.transforms:
            parent = transform.header.frame_id.lstrip("/")
            child = transform.child_frame_id.lstrip("/")
            if parent == "map" and child in {"odom", "base_link"}:
                found_match = True
                stamp_s = self._stamp_to_seconds(transform.header.stamp)
                if stamp_s > latest_stamp:
                    latest_stamp = stamp_s

        if found_match:
            self.tf_valid = True
            self.tf_timestamp_s = latest_stamp

    def _on_nav2_transition(self, msg: TransitionEvent) -> None:
        goal_id = int(msg.goal_state.id)
        start_id = int(msg.start_state.id)

        if goal_id == 3:
            self.nav2_active = True
        elif start_id == 3 and goal_id != 3:
            self.nav2_active = False

    def _on_timer(self) -> None:
        now_s = self.get_clock().now().nanoseconds / 1e9
        map_age_s = now_s - self.map_timestamp_s if self.map_received else float("inf")
        tf_age_s = now_s - self.tf_timestamp_s if self.tf_valid else float("inf")

        state = evaluate_readiness(
            map_received=self.map_received,
            tf_valid=self.tf_valid,
            nav2_active=self.nav2_active,
            map_age_s=map_age_s,
            tf_age_s=tf_age_s,
            max_map_age_s=self.max_map_age_s,
            max_tf_age_s=self.max_tf_age_s,
        )

        state.last_updated_s = now_s
        json_state = readiness_to_json(state)
        self.current_state_json = json_state

        out = String()
        out.data = json_state
        self.readiness_pub.publish(out)

    def _handle_get_readiness(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        if not self.current_state_json:
            self._on_timer()

        response.success = True
        response.message = self.current_state_json
        return response

    def _stamp_to_seconds(self, stamp: Any) -> float:
        return float(stamp.sec) + float(stamp.nanosec) / 1_000_000_000.0


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = MapReadinessGateNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
