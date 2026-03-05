from __future__ import annotations

import json
import uuid
from typing import Any

import numpy as np
import rclpy
from builtin_interfaces.msg import Time as TimeMsg
from cv_bridge import CvBridge, CvBridgeError
from rclpy.node import Node
from sensor_msgs.msg import Image
from std_msgs.msg import String
from std_srvs.srv import Trigger
from warehouse_security_msgs.msg import BlindSpotEvent

from .visibility_core import ROIConfig, VisibilityTracker, check_zone_coverage, compute_image_coverage


class CCTVVisibilityMonitorNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_cctv_visibility_monitor")
        self._declare_parameters()
        self._load_config()
        self._setup_core()
        self._setup_ros()

    def _declare_parameters(self) -> None:
        from rcl_interfaces.msg import ParameterDescriptor, ParameterType

        self.declare_parameter("cctv_image_topics", ["/cctv/cam0/image_raw"])
        self.declare_parameter("check_interval_s", 2.0)
        self.declare_parameter("blind_threshold_s", 5.0)
        self.declare_parameter("coverage_warning_threshold", 0.3)
        self.declare_parameter("blindspot_events_topic", "/reasoning/blindspot_events")
        self.declare_parameter("asset_states_topic", "/perception/asset_states")
        self.declare_parameter(
            "zones",
            [],
            ParameterDescriptor(type=ParameterType.PARAMETER_STRING_ARRAY),
        )

    def _load_config(self) -> None:
        raw_topics = self.get_parameter("cctv_image_topics").value
        if isinstance(raw_topics, list) and raw_topics:
            self.cctv_image_topics = [str(topic) for topic in raw_topics]
        else:
            self.cctv_image_topics = ["/cctv/cam0/image_raw"]

        self.check_interval_s = float(self.get_parameter("check_interval_s").value)
        self.blind_threshold_s = float(self.get_parameter("blind_threshold_s").value)
        self.coverage_warning_threshold = float(self.get_parameter("coverage_warning_threshold").value)
        self.blindspot_events_topic = str(self.get_parameter("blindspot_events_topic").value)
        self.asset_states_topic = str(self.get_parameter("asset_states_topic").value)
        self.zones = self._parse_zones(self.get_parameter("zones").value)

    def _setup_core(self) -> None:
        self.bridge = CvBridge()
        self.tracker = VisibilityTracker(
            blind_threshold_s=self.blind_threshold_s,
            coverage_warning_threshold=self.coverage_warning_threshold,
        )
        self.latest_images: dict[str, Image] = {}
        self.latest_asset_detections: list[dict[str, Any]] = []
        self.stats = {
            "ticks": 0,
            "events_published": 0,
            "errors": 0,
        }

    def _setup_ros(self) -> None:
        self.events_pub = self.create_publisher(BlindSpotEvent, self.blindspot_events_topic, 10)
        self.summary_pub = self.create_publisher(String, "~/visibility_summary", 10)

        for topic in self.cctv_image_topics:
            self.create_subscription(Image, topic, self._make_image_callback(topic), 10)

        self.create_subscription(String, self.asset_states_topic, self._on_asset_states, 10)
        self.timer = self.create_timer(self.check_interval_s, self._on_check_timer)
        self.status_srv = self.create_service(Trigger, "~/get_status", self._handle_get_status)

    def _make_image_callback(self, topic: str):
        def _cb(msg: Image) -> None:
            self.latest_images[topic] = msg

        return _cb

    def _on_asset_states(self, msg: String) -> None:
        try:
            payload = json.loads(msg.data)
        except json.JSONDecodeError:
            self.get_logger().warning("invalid JSON received on /perception/asset_states")
            return

        assets = payload.get("assets", [])
        if not isinstance(assets, list):
            self.latest_asset_detections = []
            return

        parsed: list[dict[str, Any]] = []
        for asset in assets:
            if not isinstance(asset, dict):
                continue
            detection: dict[str, Any] = {"asset_id": str(asset.get("asset_id", ""))}
            if "bbox" in asset:
                detection["bbox"] = asset["bbox"]
            elif "bbox_center_x" in asset and "bbox_center_y" in asset:
                detection["bbox_center_x"] = asset["bbox_center_x"]
                detection["bbox_center_y"] = asset["bbox_center_y"]
            else:
                position = asset.get("position", {})
                if isinstance(position, dict) and "x" in position and "y" in position:
                    detection["x"] = position["x"]
                    detection["y"] = position["y"]
            parsed.append(detection)

        self.latest_asset_detections = parsed

    def _on_check_timer(self) -> None:
        self.stats["ticks"] += 1
        now_s = self.get_clock().now().nanoseconds / 1e9

        try:
            camera_states = []
            for topic in self.cctv_image_topics:
                image_msg = self.latest_images.get(topic)
                if image_msg is None:
                    continue
                camera_id = self._camera_id_from_topic(topic)
                state_entries = self._analyze_image(camera_id, image_msg, now_s)
                camera_states.extend(state_entries)

            blind_states = self.tracker.get_blind_spots(now_s)
            for state in blind_states:
                event = self._build_blindspot_event(state, now_s)
                self.events_pub.publish(event)
                self.stats["events_published"] += 1

            summary_payload = {
                "timestamp_s": now_s,
                "tracked_states": [
                    {
                        "camera_id": state.camera_id,
                        "zone_id": state.zone_id,
                        "is_covered": state.is_covered,
                        "coverage_ratio": state.coverage_ratio,
                        "blind_since": state.blind_since,
                        "last_image_time": state.last_image_time,
                    }
                    for state in self.tracker.get_all_states()
                ],
                "blind_spots_active": [
                    {
                        "camera_id": state.camera_id,
                        "zone_id": state.zone_id,
                        "duration_s": now_s - state.blind_since if state.blind_since is not None else 0.0,
                    }
                    for state in blind_states
                ],
                "stats": dict(self.stats),
            }
            self._publish_summary(summary_payload)
        except Exception as exc:  # noqa: BLE001
            self.stats["errors"] += 1
            self.get_logger().error(f"visibility check failed: {exc}")

    def _analyze_image(self, camera_id: str, image_msg: Image, now_s: float) -> list[dict[str, Any]]:
        cv_image = self._to_numpy_image(image_msg)
        if cv_image is None:
            coverage_ratio = 0.0
            image_width = int(image_msg.width)
            image_height = int(image_msg.height)
        else:
            image_height = int(cv_image.shape[0])
            image_width = int(cv_image.shape[1])
            image_stats = self._compute_image_stats(cv_image)
            coverage_ratio = compute_image_coverage(image_stats)

        global_state = self.tracker.update_camera(camera_id, "global", coverage_ratio, now_s)

        states = [{"camera_id": camera_id, "zone_id": "global", "coverage_ratio": global_state.coverage_ratio}]

        for zone in self.zones:
            zone_coverage = check_zone_coverage(zone, self.latest_asset_detections, image_width, image_height)
            zone_state = self.tracker.update_camera(camera_id, zone.zone_id, zone_coverage, now_s)
            states.append(
                {
                    "camera_id": camera_id,
                    "zone_id": zone.zone_id,
                    "coverage_ratio": zone_state.coverage_ratio,
                }
            )

        return states

    def _build_blindspot_event(self, state, now_s: float) -> BlindSpotEvent:
        event = BlindSpotEvent()
        event.header.stamp = self.get_clock().now().to_msg()
        event.header.frame_id = state.camera_id
        event.event_id = str(uuid.uuid4())
        event.camera_id = state.camera_id
        event.zone_id = state.zone_id
        event.severity = self._severity_for_state(state)
        event.confidence = max(0.0, min(1.0, 1.0 - state.coverage_ratio))
        event.description = (
            f"Visibility loss detected for camera '{state.camera_id}' in zone '{state.zone_id}' "
            f"(coverage={state.coverage_ratio:.2f})."
        )
        event.affected_asset_ids = self._affected_assets_for_zone(state.zone_id)
        event.timestamp_detected = self._to_time_msg(state.blind_since if state.blind_since is not None else now_s)
        event.duration_s = now_s - state.blind_since if state.blind_since is not None else 0.0
        return event

    def _severity_for_state(self, state) -> int:
        critical_zone = next((zone for zone in self.zones if zone.zone_id == state.zone_id and zone.critical), None)
        if state.coverage_ratio <= 0.05:
            return BlindSpotEvent.CRITICAL
        if state.coverage_ratio <= 0.15:
            return BlindSpotEvent.HIGH
        if critical_zone is not None:
            return BlindSpotEvent.HIGH
        if state.coverage_ratio <= self.coverage_warning_threshold:
            return BlindSpotEvent.MEDIUM
        return BlindSpotEvent.LOW

    def _affected_assets_for_zone(self, zone_id: str) -> list[str]:
        if zone_id == "global":
            return [
                str(asset.get("asset_id"))
                for asset in self.latest_asset_detections
                if isinstance(asset, dict) and asset.get("asset_id")
            ]

        zone = next((entry for entry in self.zones if entry.zone_id == zone_id), None)
        if zone is None:
            return []

        asset_ids: list[str] = []
        for detection in self.latest_asset_detections:
            asset_id = detection.get("asset_id")
            if not asset_id:
                continue
            point = detection.get("bbox") or detection
            x = None
            y = None
            if isinstance(point, dict) and "x" in point and "y" in point:
                x = float(point["x"])
                y = float(point["y"])
            elif isinstance(point, dict) and "bbox_center_x" in point and "bbox_center_y" in point:
                x = float(point["bbox_center_x"])
                y = float(point["bbox_center_y"])
            if x is None or y is None:
                continue
            if 0.0 <= x <= 1.0:
                x *= 1920.0
            if 0.0 <= y <= 1.0:
                y *= 1080.0
            from .visibility_core import point_in_polygon

            if point_in_polygon(x, y, zone.polygon):
                asset_ids.append(str(asset_id))

        return asset_ids

    def _publish_summary(self, payload: dict[str, Any]) -> None:
        msg = String()
        msg.data = json.dumps(payload)
        self.summary_pub.publish(msg)

    def _handle_get_status(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        states = [
            {
                "camera_id": state.camera_id,
                "zone_id": state.zone_id,
                "is_covered": state.is_covered,
                "coverage_ratio": state.coverage_ratio,
                "last_image_time": state.last_image_time,
                "blind_since": state.blind_since,
            }
            for state in self.tracker.get_all_states()
        ]
        response.success = True
        response.message = json.dumps({"stats": self.stats, "states": states})
        return response

    def _compute_image_stats(self, image: np.ndarray) -> dict[str, float]:
        if image.ndim == 3:
            grayscale = image.mean(axis=2)
        else:
            grayscale = image.astype(np.float64, copy=False)

        valid_mask = np.isfinite(grayscale)
        valid_ratio = float(valid_mask.mean()) if grayscale.size > 0 else 0.0
        if valid_ratio == 0.0:
            return {
                "mean_brightness": 0.0,
                "edge_density": 0.0,
                "valid_pixel_ratio": 0.0,
            }

        valid_pixels = grayscale[valid_mask]
        mean_brightness = float(valid_pixels.mean()) if valid_pixels.size else 0.0

        grad_x = np.abs(np.diff(grayscale, axis=1)) if grayscale.shape[1] > 1 else np.zeros_like(grayscale)
        grad_y = np.abs(np.diff(grayscale, axis=0)) if grayscale.shape[0] > 1 else np.zeros_like(grayscale)
        edge_pixels = float((grad_x > 15.0).mean()) + float((grad_y > 15.0).mean())
        edge_density = max(0.0, min(1.0, edge_pixels * 0.5))

        return {
            "mean_brightness": mean_brightness,
            "edge_density": edge_density,
            "valid_pixel_ratio": valid_ratio,
        }

    def _to_numpy_image(self, image_msg: Image) -> np.ndarray | None:
        try:
            return self.bridge.imgmsg_to_cv2(image_msg, desired_encoding="passthrough")
        except CvBridgeError as exc:
            self.get_logger().warning(f"failed converting image from camera stream: {exc}")
            return None

    def _camera_id_from_topic(self, topic: str) -> str:
        parts = [part for part in topic.split("/") if part]
        if len(parts) >= 2:
            return parts[-2]
        return topic.strip("/") or "unknown_camera"

    def _to_time_msg(self, stamp_s: float) -> TimeMsg:
        secs = int(stamp_s)
        nanosecs = int((stamp_s - secs) * 1_000_000_000)
        msg = TimeMsg()
        msg.sec = secs
        msg.nanosec = nanosecs
        return msg

    def _parse_zones(self, raw_value: Any) -> list[ROIConfig]:
        zones: list[ROIConfig] = []
        raw_items: list[Any]
        if isinstance(raw_value, list):
            raw_items = raw_value
        elif isinstance(raw_value, str) and raw_value.strip():
            raw_items = [raw_value]
        else:
            return zones

        for item in raw_items:
            config_obj: dict[str, Any] | None = None
            if isinstance(item, str):
                try:
                    decoded = json.loads(item)
                    if isinstance(decoded, dict):
                        config_obj = decoded
                except json.JSONDecodeError:
                    self.get_logger().warning(f"ignoring invalid zone config JSON: {item}")
                    continue
            elif isinstance(item, dict):
                config_obj = item

            if not config_obj:
                continue

            zone_id = str(config_obj.get("zone_id", "")).strip()
            polygon_raw = config_obj.get("polygon", [])
            if not zone_id or not isinstance(polygon_raw, list):
                continue

            polygon: list[tuple[float, float]] = []
            for point in polygon_raw:
                if not isinstance(point, (list, tuple)) or len(point) != 2:
                    continue
                polygon.append((float(point[0]), float(point[1])))

            if len(polygon) < 3:
                continue

            zones.append(
                ROIConfig(
                    zone_id=zone_id,
                    polygon=polygon,
                    min_coverage_ratio=float(config_obj.get("min_coverage_ratio", 0.5)),
                    critical=bool(config_obj.get("critical", False)),
                )
            )

        return zones


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = CCTVVisibilityMonitorNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
