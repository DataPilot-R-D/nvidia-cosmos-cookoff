#!/usr/bin/env python3
"""Mock message publisher for Phase 1 multi-robot planner+executor testing.

Publishes test messages to trigger planner task creation and executor dispatch.
Run with: python3 mock_detections.py <test_name>

Available tests:
  blindspot     - Single-robot INSPECT_BLINDSPOT via blindspot event
  intruder      - Multi-robot PURSUE_THIEF + BLOCK_EXIT via intruder event
  detection     - Sustained detections via detection buffer (multi-frame)
  risk          - Single-robot GUARD_ASSET via risk assessment
  cancel        - Cancel active task for robot0
  all           - Run blindspot, then intruder, then risk with delays
"""
from __future__ import annotations

import json
import sys
import time

import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class MockPublisher(Node):

    def __init__(self) -> None:
        super().__init__("mock_detection_publisher")
        self._blindspot_pub = self.create_publisher(
            String, "/reasoning/blindspot_events", 10,
        )
        self._risk_pub = self.create_publisher(
            String, "/reasoning/risk_assessments", 10,
        )
        self._detection_pub = self.create_publisher(
            String, "/triangulated/detections_json", 10,
        )
        self._set_task_state_pub = self.create_publisher(
            String, "/ui/set_task_state", 10,
        )
        self.get_logger().info("MockPublisher ready. Waiting 2s for connections...")
        time.sleep(2.0)

    def publish_blindspot(self) -> None:
        """Publish a blindspot event -> triggers INSPECT_BLINDSPOT (single robot)."""
        payload = {
            "incident_key": f"blindspot-test-{int(time.time())}",
            "event_type": "blindspot",
            "severity": "medium",
            "confidence": 0.6,
            "asset_criticality": 0.5,
            "source": "mock_test",
            "goal": {
                "x": 2.0,
                "y": -1.0,
                "z": 0.0,
                "yaw": 1.57,
                "frame_id": "map",
            },
            "details": {
                "camera_id": "cctv0",
                "region": "gallery_west",
                "description": "Camera occlusion detected in gallery west",
            },
        }
        msg = String()
        msg.data = json.dumps(payload)
        self._blindspot_pub.publish(msg)
        self.get_logger().info(
            f"Published blindspot event: {payload['incident_key']}"
        )

    def publish_intruder_event(self) -> None:
        """Publish intruder_detected event directly -> triggers multi-robot
        PURSUE_THIEF (quadruped/robot0) + BLOCK_EXIT (humanoid/h1_0).

        This bypasses the detection buffer and injects the event directly
        through the blindspot topic with event_type=intruder_detected.
        """
        payload = {
            "incident_key": f"intruder-test-{int(time.time())}",
            "event_type": "intruder_detected",
            "severity": "high",
            "confidence": 0.85,
            "asset_criticality": 0.8,
            "source": "mock_test",
            "goal": {
                "x": 5.0,
                "y": 3.0,
                "z": 0.0,
                "yaw": 0.0,
                "frame_id": "map",
            },
            "details": {
                "class": "person",
                "position": {"x": 5.0, "y": 3.0, "z": 0.0},
                "threat_level": "high",
                "description": "Unauthorized person detected near Mona Lisa",
            },
        }
        msg = String()
        msg.data = json.dumps(payload)
        self._blindspot_pub.publish(msg)
        self.get_logger().info(
            f"Published intruder event (via blindspot topic): {payload['incident_key']}"
        )

    def publish_sustained_detections(self, num_frames: int = 5) -> None:
        """Publish multiple detection frames to trigger the detection buffer.

        The buffer requires detection_sustained_frames (default 3) frames
        with a new detection before triggering. This publishes num_frames
        frames 0.5s apart with a 'person' detection.
        """
        self.get_logger().info(
            f"Publishing {num_frames} detection frames (0.5s apart)..."
        )
        for i in range(num_frames):
            now = self.get_clock().now().to_msg()
            payload = {
                "timestamp": {
                    "sec": now.sec,
                    "nanosec": now.nanosec,
                },
                "frame_id": "map",
                "detections": [
                    {
                        "class": "person",
                        "position": {"x": 5.0, "y": 3.0, "z": 0.0},
                        "score": 0.82,
                        "reprojection_error_px": 3.5,
                    },
                ],
            }
            msg = String()
            msg.data = json.dumps(payload)
            self._detection_pub.publish(msg)
            self.get_logger().info(f"  Detection frame {i + 1}/{num_frames}")
            if i < num_frames - 1:
                time.sleep(0.5)

        self.get_logger().info(
            "Detection frames complete. Buffer should trigger if sustained_frames threshold met."
        )

    def publish_risk_assessment(self) -> None:
        """Publish a risk assessment -> triggers GUARD_ASSET."""
        payload = {
            "incident_key": f"risk-test-{int(time.time())}",
            "event_type": "guard_asset",
            "severity": "high",
            "confidence": 0.75,
            "asset_criticality": 0.9,
            "source": "mock_test",
            "goal": {
                "x": 3.0,
                "y": 0.0,
                "z": 0.0,
                "yaw": 0.0,
                "frame_id": "map",
            },
            "details": {
                "asset_id": "mona_lisa",
                "threat_type": "proximity_alert",
                "description": "High-value asset requires guarding",
            },
        }
        msg = String()
        msg.data = json.dumps(payload)
        self._risk_pub.publish(msg)
        self.get_logger().info(
            f"Published risk assessment (guard_asset): {payload['incident_key']}"
        )

    def publish_cancel(self, robot_id: str = "robot0") -> None:
        """Publish cancel command for a specific robot."""
        payload = {
            "command": "cancel",
            "robot_id": robot_id,
        }
        msg = String()
        msg.data = json.dumps(payload)
        self._set_task_state_pub.publish(msg)
        self.get_logger().info(f"Published cancel command for {robot_id}")


def main() -> None:
    test_name = sys.argv[1] if len(sys.argv) > 1 else "all"

    rclpy.init()
    node = MockPublisher()

    try:
        if test_name == "blindspot":
            node.publish_blindspot()
        elif test_name == "intruder":
            node.publish_intruder_event()
        elif test_name == "detection":
            node.publish_sustained_detections(num_frames=5)
        elif test_name == "risk":
            node.publish_risk_assessment()
        elif test_name == "cancel":
            robot_id = sys.argv[2] if len(sys.argv) > 2 else "robot0"
            node.publish_cancel(robot_id)
        elif test_name == "all":
            node.get_logger().info("=== Test 1: Blindspot (INSPECT_BLINDSPOT) ===")
            node.publish_blindspot()
            time.sleep(3.0)

            node.get_logger().info("=== Test 2: Intruder (PURSUE_THIEF + BLOCK_EXIT) ===")
            node.publish_intruder_event()
            time.sleep(3.0)

            node.get_logger().info("=== Test 3: Risk Assessment (GUARD_ASSET) ===")
            node.publish_risk_assessment()
            time.sleep(2.0)

            node.get_logger().info("=== All tests published ===")
        else:
            node.get_logger().error(
                f"Unknown test: {test_name}. Use: blindspot, intruder, detection, risk, cancel, all"
            )

        # Keep alive briefly for message delivery
        time.sleep(1.0)

    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
