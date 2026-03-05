from __future__ import annotations

import base64
import json
import os
import urllib.error
import urllib.request
from typing import Any

import cv2
import rclpy
from cv_bridge import CvBridge, CvBridgeError
from rclpy.duration import Duration
from rclpy.node import Node
from rclpy.time import Time
from sensor_msgs.msg import CameraInfo, Image, PointCloud2
from std_msgs.msg import String
from std_srvs.srv import Trigger
from tf2_ros import Buffer, TransformException, TransformListener

from .detection_core import AssetTracker, Detection2D, Detection3D, fuse_detections, project_2d_to_3d


class SpatialObjectRecognitionNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_spatial_object_recognition")
        self._declare_parameters()
        self._load_config()
        self._setup_core()
        self._setup_ros()
        self._log_startup()

    def _declare_parameters(self) -> None:
        self.declare_parameter("cctv_image_topics", ["/cctv/cam0/image_raw"])
        self.declare_parameter("robot_image_topic", "/robot0/front_cam/rgb")
        self.declare_parameter("robot_depth_topic", "/robot0/front_cam/depth")
        self.declare_parameter("robot_pointcloud_topic", "/robot0/point_cloud2_L1")
        self.declare_parameter("camera_info_topic", "/robot0/front_cam/camera_info")
        self.declare_parameter("map_frame", "map")
        self.declare_parameter("camera_frame", "robot0/front_cam_optical_frame")
        self.declare_parameter("detection_interval_s", 2.0)
        self.declare_parameter("min_detection_confidence", 0.3)
        self.declare_parameter("detections_3d_topic", "/perception/detections_3d")
        self.declare_parameter("asset_states_topic", "/perception/asset_states")
        self.declare_parameter("use_json_transport_fallback", True)
        self.declare_parameter("vlm_backend", "cosmos")
        self.declare_parameter("cosmos_api_base", "")
        self.declare_parameter("cosmos_model", "nvidia/cosmos-reason-2")

    def _load_config(self) -> None:
        cctv_topics_raw = self.get_parameter("cctv_image_topics").value
        if isinstance(cctv_topics_raw, list):
            self.cctv_image_topics = [str(topic) for topic in cctv_topics_raw]
        else:
            self.cctv_image_topics = ["/cctv/cam0/image_raw"]

        self.robot_image_topic = str(self.get_parameter("robot_image_topic").value)
        self.robot_depth_topic = str(self.get_parameter("robot_depth_topic").value)
        self.robot_pointcloud_topic = str(self.get_parameter("robot_pointcloud_topic").value)
        self.camera_info_topic = str(self.get_parameter("camera_info_topic").value)
        self.map_frame = str(self.get_parameter("map_frame").value)
        self.camera_frame = str(self.get_parameter("camera_frame").value)
        self.detection_interval_s = float(self.get_parameter("detection_interval_s").value)
        self.min_detection_confidence = float(self.get_parameter("min_detection_confidence").value)
        self.detections_3d_topic = str(self.get_parameter("detections_3d_topic").value)
        self.asset_states_topic = str(self.get_parameter("asset_states_topic").value)
        self.use_json_transport_fallback = bool(self.get_parameter("use_json_transport_fallback").value)
        self.vlm_backend = str(self.get_parameter("vlm_backend").value)
        self.cosmos_api_base = str(self.get_parameter("cosmos_api_base").value or os.getenv("COSMOS_API_BASE", ""))
        self.cosmos_model = str(self.get_parameter("cosmos_model").value)

    def _setup_core(self) -> None:
        self.bridge = CvBridge()
        self.tracker = AssetTracker(distance_threshold=1.0, visibility_timeout_s=10.0)
        self.stats = {
            "ticks": 0,
            "published_detection_batches": 0,
            "published_asset_batches": 0,
            "errors": 0,
        }
        self.latest_cctv_images: dict[str, Image] = {}
        self.latest_robot_image: Image | None = None
        self.latest_robot_depth: Image | None = None
        self.latest_robot_pointcloud: PointCloud2 | None = None
        self.latest_camera_info: CameraInfo | None = None

    def _setup_ros(self) -> None:
        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)

        self.detections_pub = self.create_publisher(String, self.detections_3d_topic, 10)
        self.asset_states_pub = self.create_publisher(String, self.asset_states_topic, 10)
        self.node_state_pub = self.create_publisher(String, "~/node_state", 10)

        for topic in self.cctv_image_topics:
            self.create_subscription(Image, topic, self._make_cctv_callback(topic), 10)
        self.create_subscription(Image, self.robot_image_topic, self._on_robot_image, 10)
        self.create_subscription(Image, self.robot_depth_topic, self._on_robot_depth, 10)
        self.create_subscription(PointCloud2, self.robot_pointcloud_topic, self._on_robot_pointcloud, 10)
        self.create_subscription(CameraInfo, self.camera_info_topic, self._on_camera_info, 10)

        self.timer = self.create_timer(self.detection_interval_s, self._on_detection_tick)
        self.stats_srv = self.create_service(Trigger, "~/get_stats", self._handle_get_stats)

    def _log_startup(self) -> None:
        self.get_logger().info(
            f"Spatial object recognition started: backend={self.vlm_backend}, "
            f"map_frame={self.map_frame}, cctv_topics={','.join(self.cctv_image_topics)}"
        )
        if not self.use_json_transport_fallback:
            self.get_logger().warning(
                "use_json_transport_fallback=False requested, but this implementation publishes std_msgs/String JSON."
            )

    def _make_cctv_callback(self, topic: str):
        def _cb(msg: Image) -> None:
            self.latest_cctv_images[topic] = msg

        return _cb

    def _on_robot_image(self, msg: Image) -> None:
        self.latest_robot_image = msg

    def _on_robot_depth(self, msg: Image) -> None:
        self.latest_robot_depth = msg

    def _on_robot_pointcloud(self, msg: PointCloud2) -> None:
        self.latest_robot_pointcloud = msg

    def _on_camera_info(self, msg: CameraInfo) -> None:
        self.latest_camera_info = msg

    def _on_detection_tick(self) -> None:
        self.stats["ticks"] += 1
        now_s = self.get_clock().now().nanoseconds / 1e9
        try:
            detections_3d = self._collect_detections(now_s)
            fused = fuse_detections(detections_3d, distance_threshold=1.0)
            asset_states = self.tracker.update(fused, current_time_s=now_s)

            detection_payload = {
                "frame": self.map_frame,
                "timestamp_s": now_s,
                "detections": [d.to_dict() for d in fused],
            }
            assets_payload = {
                "timestamp_s": now_s,
                "assets": asset_states,
            }
            node_state_payload = {
                "timestamp_s": now_s,
                "backend": self.vlm_backend,
                "detection_count": len(fused),
                "asset_count": len(asset_states),
                "stats": dict(self.stats),
            }
            self._publish_json(self.detections_pub, detection_payload)
            self._publish_json(self.asset_states_pub, assets_payload)
            self._publish_json(self.node_state_pub, node_state_payload)
            self.stats["published_detection_batches"] += 1
            self.stats["published_asset_batches"] += 1
        except Exception as exc:  # noqa: BLE001
            self.stats["errors"] += 1
            self.get_logger().error(f"detection tick failed: {exc}")

    def _collect_detections(self, timestamp_s: float) -> list[Detection3D]:
        detections_3d: list[Detection3D] = []

        for topic, image_msg in self.latest_cctv_images.items():
            cctv_detections = self._run_2d_detection(image_msg, source_camera_id=topic, timestamp_s=timestamp_s)
            for detection_2d in cctv_detections:
                cctv_3d = self._estimate_cctv_3d(detection_2d, image_msg)
                if cctv_3d is not None:
                    detections_3d.append(cctv_3d)

        if self.latest_robot_image is not None:
            robot_detections = self._run_2d_detection(
                self.latest_robot_image,
                source_camera_id=self.robot_image_topic,
                timestamp_s=timestamp_s,
            )
            for detection_2d in robot_detections:
                robot_3d = self._project_robot_3d(detection_2d)
                if robot_3d is not None:
                    detections_3d.append(robot_3d)

        return detections_3d

    def _run_2d_detection(self, image_msg: Image, source_camera_id: str, timestamp_s: float) -> list[Detection2D]:
        width = float(image_msg.width if image_msg.width > 0 else 1280.0)
        height = float(image_msg.height if image_msg.height > 0 else 720.0)

        def _mock_detections() -> list[Detection2D]:
            confidence = 0.9
            if confidence < self.min_detection_confidence:
                return []
            detection = Detection2D(
                label="person",
                confidence=confidence,
                bbox_x=width * 0.35,
                bbox_y=height * 0.2,
                bbox_w=width * 0.3,
                bbox_h=height * 0.6,
                source_camera_id=source_camera_id,
                timestamp_s=timestamp_s,
            )
            return [detection]

        if self.vlm_backend == "mock":
            return _mock_detections()
        if self.vlm_backend != "cosmos":
            self.get_logger().warning(f"unknown vlm_backend '{self.vlm_backend}', using mock")
            return _mock_detections()
        if not self.cosmos_api_base.strip():
            self.get_logger().warning("cosmos_api_base is empty, using mock detections")
            return _mock_detections()

        try:
            cv_image = self.bridge.imgmsg_to_cv2(image_msg, desired_encoding="bgr8")
            ok, encoded = cv2.imencode(".jpg", cv_image)
            if not ok:
                raise RuntimeError("cv2.imencode(.jpg) failed")
            image_b64 = base64.b64encode(encoded.tobytes()).decode("utf-8")
        except (CvBridgeError, Exception) as exc:  # noqa: BLE001
            self.get_logger().warning(f"image conversion failed, using mock detections: {exc}")
            return _mock_detections()

        payload = {
            "model": self.cosmos_model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
                        {
                            "type": "text",
                            "text": (
                                "Analyze this warehouse camera image for security monitoring. "
                                "List every visible object. Return ONLY a JSON array, no other text. "
                                "Each element: {\"label\": \"object_name\", \"confidence\": 0.0-1.0, "
                                "\"bbox\": [x, y, width, height]} with bbox as fractions 0-1. "
                                "If you cannot estimate bbox, use [0,0,1,1]. "
                                "Example: [{\"label\": \"forklift\", \"confidence\": 0.8, \"bbox\": [0.1,0.2,0.3,0.4]}]"
                            ),
                        },
                    ],
                }
            ],
            "max_tokens": 1024,
        }

        try:
            url = f"{self.cosmos_api_base.rstrip('/')}/chat/completions"
            req = urllib.request.Request(
                url=url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                response_payload = json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, Exception) as exc:  # noqa: BLE001
            self.get_logger().warning(f"Cosmos request failed, using mock detections: {exc}")
            return _mock_detections()

        try:
            choices = response_payload.get("choices", [])
            content = choices[0]["message"]["content"] if choices else None
            if isinstance(content, list):
                content_text = "".join(part.get("text", "") for part in content if isinstance(part, dict))
            elif isinstance(content, str):
                content_text = content
            else:
                content_text = ""
            content_text = content_text.strip()

            if content_text.startswith("```"):
                lines = [line for line in content_text.splitlines() if not line.strip().startswith("```")]
                content_text = "\n".join(lines).strip()

            start = content_text.find("[")
            end = content_text.rfind("]")
            if start == -1 or end == -1 or end < start:
                raise ValueError("no JSON array found in response")
            extracted = content_text[start : end + 1]
            try:
                objects = json.loads(extracted)
            except json.JSONDecodeError:
                # Model may return comma-separated arrays without outer wrapper:
                # [0.0,0.36,1.0,0.09], [0.0,0.36,1.0,0.09]
                objects = json.loads("[" + extracted + "]")

            detections: list[Detection2D] = []
            for obj in objects:
                # Handle plain string arrays: ["crate", "metal", ...]
                if isinstance(obj, str):
                    label = obj.strip()
                    if not label:
                        continue
                    detections.append(
                        Detection2D(
                            label=label,
                            confidence=0.6,
                            bbox_x=0.0,
                            bbox_y=0.0,
                            bbox_w=width,
                            bbox_h=height,
                            source_camera_id=source_camera_id,
                            timestamp_s=timestamp_s,
                        )
                    )
                    continue
                # Handle bare bbox arrays: [0.0, 0.36, 1.0, 0.09]
                if isinstance(obj, list) and len(obj) == 4:
                    try:
                        x, y, w_f, h_f = (float(v) for v in obj)
                        x = max(0.0, min(1.0, x))
                        y = max(0.0, min(1.0, y))
                        w_f = max(0.0, min(1.0 - x, w_f))
                        h_f = max(0.0, min(1.0 - y, h_f))
                        if w_f > 0.0 and h_f > 0.0:
                            detections.append(
                                Detection2D(
                                    label="object",
                                    confidence=0.5,
                                    bbox_x=x * width,
                                    bbox_y=y * height,
                                    bbox_w=w_f * width,
                                    bbox_h=h_f * height,
                                    source_camera_id=source_camera_id,
                                    timestamp_s=timestamp_s,
                                )
                            )
                    except (TypeError, ValueError):
                        pass
                    continue
                if not isinstance(obj, dict):
                    continue
                label = str(obj.get("label", "object")).strip() or "object"
                confidence = float(obj.get("confidence", 0.6))
                bbox = obj.get("bbox")
                if not isinstance(bbox, list) or len(bbox) != 4:
                    # Dict without bbox — accept with full-frame bbox
                    detections.append(
                        Detection2D(
                            label=label,
                            confidence=max(0.0, min(1.0, confidence)),
                            bbox_x=0.0,
                            bbox_y=0.0,
                            bbox_w=width,
                            bbox_h=height,
                            source_camera_id=source_camera_id,
                            timestamp_s=timestamp_s,
                        )
                    )
                    continue
                x, y, w, h = (float(v) for v in bbox)
                x = max(0.0, min(1.0, x))
                y = max(0.0, min(1.0, y))
                w = max(0.0, min(1.0 - x, w))
                h = max(0.0, min(1.0 - y, h))
                if confidence < self.min_detection_confidence or w <= 0.0 or h <= 0.0:
                    continue
                detections.append(
                    Detection2D(
                        label=label,
                        confidence=max(0.0, min(1.0, confidence)),
                        bbox_x=x * width,
                        bbox_y=y * height,
                        bbox_w=w * width,
                        bbox_h=h * height,
                        source_camera_id=source_camera_id,
                        timestamp_s=timestamp_s,
                    )
                )

            self.get_logger().info(f"Cosmos detected {len(detections)} objects")
            return detections
        except Exception as exc:  # noqa: BLE001
            self.get_logger().warning(f"Cosmos response parse failed, using mock detections: {exc}")
            return _mock_detections()

    def _camera_intrinsics_from_info(self, camera_info: CameraInfo | None, image_msg: Image | None = None) -> dict[str, float]:
        if camera_info is not None and len(camera_info.k) >= 6:
            return {
                "fx": float(camera_info.k[0]) if camera_info.k[0] else 1.0,
                "fy": float(camera_info.k[4]) if camera_info.k[4] else 1.0,
                "cx": float(camera_info.k[2]),
                "cy": float(camera_info.k[5]),
            }

        width = float(image_msg.width if image_msg is not None and image_msg.width > 0 else 1280.0)
        height = float(image_msg.height if image_msg is not None and image_msg.height > 0 else 720.0)
        return {"fx": 800.0, "fy": 800.0, "cx": width / 2.0, "cy": height / 2.0}

    def _project_robot_3d(self, detection_2d: Detection2D) -> Detection3D | None:
        depth_image = None
        if self.latest_robot_depth is not None:
            try:
                depth_image = self.bridge.imgmsg_to_cv2(self.latest_robot_depth, desired_encoding="passthrough")
            except CvBridgeError as exc:
                self.get_logger().warning(f"depth conversion failed: {exc}")

        intrinsics = self._camera_intrinsics_from_info(self.latest_camera_info, self.latest_robot_image)
        transform = self._lookup_transform(self.camera_frame)
        return project_2d_to_3d(detection_2d, depth_image, intrinsics, transform)

    def _estimate_cctv_3d(self, detection_2d: Detection2D, image_msg: Image) -> Detection3D | None:
        camera_frame = image_msg.header.frame_id.strip() if image_msg.header.frame_id else detection_2d.source_camera_id
        intrinsics = self._camera_intrinsics_from_info(None, image_msg)
        transform = self._lookup_transform(camera_frame)
        return project_2d_to_3d(detection_2d, None, intrinsics, transform)

    def _lookup_transform(self, source_frame: str) -> dict[str, Any] | None:
        if source_frame == self.map_frame:
            return {
                "translation": {"x": 0.0, "y": 0.0, "z": 0.0},
                "rotation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
            }
        try:
            transform_stamped = self.tf_buffer.lookup_transform(
                self.map_frame,
                source_frame,
                rclpy.time.Time(),
                timeout=Duration(seconds=1.0),
            )
            t = transform_stamped.transform.translation
            r = transform_stamped.transform.rotation
            return {
                "translation": {"x": t.x, "y": t.y, "z": t.z},
                "rotation": {"x": r.x, "y": r.y, "z": r.z, "w": r.w},
            }
        except TransformException as exc:
            self.get_logger().warning(f"TF lookup failed for {source_frame}->{self.map_frame}: {exc}")
            return None

    def _publish_json(self, publisher, payload: dict[str, Any]) -> None:
        msg = String()
        msg.data = json.dumps(payload)
        publisher.publish(msg)

    def _handle_get_stats(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        stats = dict(self.stats)
        stats["tracked_assets"] = len(self.tracker.get_all_assets())
        response.success = True
        response.message = json.dumps(stats)
        return response


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = SpatialObjectRecognitionNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
