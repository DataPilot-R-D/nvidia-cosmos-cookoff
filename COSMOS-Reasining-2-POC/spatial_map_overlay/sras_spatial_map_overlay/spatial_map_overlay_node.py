from __future__ import annotations

import json
from threading import Lock
from typing import Any

import rclpy
from rclpy.node import Node
from std_msgs.msg import String
from std_srvs.srv import Trigger
from tf2_msgs.msg import TFMessage
from warehouse_security_msgs.msg import BlindSpotEvent

from .spatial_overlay_core import (
    DEFAULT_CAMERAS,
    DEFAULT_WAREHOUSE,
    DetectionMarker,
    Pose3D,
    Quaternion,
    RobotState,
    Vec3,
    build_scene_state,
    compute_scene_summary,
    filter_markers_by_age,
    scene_to_json,
)


class SpatialMapOverlayNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_spatial_map_overlay")
        self._lock = Lock()

        self._declare_parameters()
        self._load_parameters()

        self._robot_poses: dict[str, Pose3D] = {}
        self._markers: list[DetectionMarker] = []
        self._alerts: list[dict[str, Any]] = []

        self.scene_pub = self.create_publisher(String, "~/scene_state", 10)

        self.create_subscription(TFMessage, "/tf", self._on_tf, 30)
        self.create_subscription(String, "/perception/detections_2d", self._on_detections, 20)
        self.create_subscription(BlindSpotEvent, "/reasoning/blindspot_events", self._on_blindspot, 20)

        self.create_service(Trigger, "~/get_scene", self._handle_get_scene)
        self.create_service(Trigger, "~/get_summary", self._handle_get_summary)

        timer_period_s = 1.0 / self.publish_rate_hz if self.publish_rate_hz > 0.0 else 0.5
        self.create_timer(timer_period_s, self._publish_scene)

    def _declare_parameters(self) -> None:
        self.declare_parameter("publish_rate_hz", 2.0)
        self.declare_parameter("marker_max_age_s", 30.0)
        self.declare_parameter("max_markers", 100)
        self.declare_parameter("max_alerts", 50)

    def _load_parameters(self) -> None:
        self.publish_rate_hz = float(self.get_parameter("publish_rate_hz").value)
        self.marker_max_age_s = float(self.get_parameter("marker_max_age_s").value)
        self.max_markers = max(1, int(self.get_parameter("max_markers").value))
        self.max_alerts = max(1, int(self.get_parameter("max_alerts").value))

    def _now_s(self) -> float:
        return self.get_clock().now().nanoseconds / 1e9

    def _on_tf(self, msg: TFMessage) -> None:
        with self._lock:
            for transform_stamped in msg.transforms:
                parent = transform_stamped.header.frame_id.strip("/")
                child = transform_stamped.child_frame_id.strip("/")
                if parent != "map" or child != "base_link":
                    continue

                t = transform_stamped.transform.translation
                r = transform_stamped.transform.rotation
                self._robot_poses["robot_0"] = Pose3D(
                    position=Vec3(float(t.x), float(t.y), float(t.z)),
                    orientation=Quaternion(float(r.x), float(r.y), float(r.z), float(r.w)),
                )

    def _on_detections(self, msg: String) -> None:
        try:
            payload = json.loads(msg.data) if msg.data else {}
        except json.JSONDecodeError:
            self.get_logger().warning("Failed to parse /perception/detections_2d payload JSON")
            return

        detections = payload.get("detections", payload.get("markers", []))
        if not isinstance(detections, list):
            return

        timestamp_default = float(payload.get("timestamp_s", self._now_s()))
        parsed: list[DetectionMarker] = []
        for idx, item in enumerate(detections):
            if not isinstance(item, dict):
                continue

            position_obj = item.get("position", {}) if isinstance(item.get("position", {}), dict) else {}
            marker_id = str(item.get("marker_id", item.get("detection_id", f"marker_{int(timestamp_default*1000)}_{idx}")))
            label = str(item.get("label", "unknown"))
            confidence = float(item.get("confidence", 0.0))
            severity = int(item.get("severity", 0))
            timestamp_s = float(item.get("timestamp_s", timestamp_default))
            parsed.append(
                DetectionMarker(
                    marker_id=marker_id,
                    label=label,
                    position=Vec3(
                        float(position_obj.get("x", item.get("x", 0.0))),
                        float(position_obj.get("y", item.get("y", 0.0))),
                        float(position_obj.get("z", item.get("z", 0.0))),
                    ),
                    confidence=confidence,
                    severity=severity,
                    timestamp_s=timestamp_s,
                )
            )

        if not parsed:
            return

        with self._lock:
            self._markers.extend(parsed)
            self._markers = self._markers[-self.max_markers :]

    def _on_blindspot(self, msg: BlindSpotEvent) -> None:
        timestamp_s = float(msg.timestamp_detected.sec) + float(msg.timestamp_detected.nanosec) / 1_000_000_000.0
        alert = {
            "alert_id": msg.event_id,
            "type": "blindspot",
            "camera_id": msg.camera_id,
            "zone_id": msg.zone_id,
            "severity": int(msg.severity),
            "description": msg.description,
            "confidence": float(msg.confidence),
            "affected_asset_ids": list(msg.affected_asset_ids),
            "timestamp_s": timestamp_s,
            "duration_s": float(msg.duration_s),
        }
        with self._lock:
            self._alerts.append(alert)
            self._alerts = self._alerts[-self.max_alerts :]

    def _build_scene(self) -> Any:
        now_s = self._now_s()
        markers = filter_markers_by_age(self._markers, self.marker_max_age_s, now_s)
        self._markers = markers[-self.max_markers :]

        robots = [
            RobotState(robot_id=robot_id, pose=pose)
            for robot_id, pose in sorted(self._robot_poses.items())
        ]

        active_alerts = [
            alert
            for alert in self._alerts
            if (now_s - float(alert.get("timestamp_s", now_s))) <= self.marker_max_age_s
        ]
        self._alerts = active_alerts[-self.max_alerts :]

        return build_scene_state(
            timestamp_s=now_s,
            layout=DEFAULT_WAREHOUSE,
            cameras=DEFAULT_CAMERAS,
            robots=robots,
            markers=self._markers,
            alerts=self._alerts,
        )

    def _publish_scene(self) -> None:
        with self._lock:
            scene = self._build_scene()
            payload = scene_to_json(scene)
        self.scene_pub.publish(String(data=payload))

    def _handle_get_scene(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        with self._lock:
            scene = self._build_scene()
            response.message = scene_to_json(scene)
        response.success = True
        return response

    def _handle_get_summary(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        with self._lock:
            scene = self._build_scene()
            response.message = json.dumps(compute_scene_summary(scene), sort_keys=True)
        response.success = True
        return response


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = SpatialMapOverlayNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
