from __future__ import annotations

import json
import math
from typing import Any

import rclpy
from rclpy.duration import Duration
from rclpy.node import Node
from rclpy.time import Time
from sensor_msgs.msg import CameraInfo, Image, PointCloud2
from std_msgs.msg import String
from std_srvs.srv import Trigger
from tf2_ros import Buffer, TransformException, TransformListener

from .fusion_core import (
    BenchmarkResult,
    CameraIntrinsics,
    FusionConfig,
    Point3D,
    compute_benchmark,
    filter_points_by_range,
    fuse_detection,
    fused_detection_to_dict,
    project_point_to_pixel,
)


class LidarCameraFusionNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_lidar_camera_fusion")
        self._declare_parameters()
        self._load_parameters()

        self.tf_buffer = Buffer()
        self.tf_listener = TransformListener(self.tf_buffer, self)

        self.latest_cloud: PointCloud2 | None = None
        self.latest_intrinsics: CameraIntrinsics | None = None
        self.latest_detections_2d: list[dict[str, Any]] = []
        self.last_fused: list[dict[str, Any]] = []
        self.last_benchmark = BenchmarkResult(0, 0, 0.0, 0.0, 0.0)

        self.fused_pub = self.create_publisher(String, "~/fused_detections", 10)
        self.benchmark_pub = self.create_publisher(String, "~/fusion_benchmark", 10)

        self.create_subscription(PointCloud2, self.pointcloud_topic, self._on_pointcloud, 10)
        self.create_subscription(Image, self.image_topic, self._on_image, 10)
        self.create_subscription(CameraInfo, self.camera_info_topic, self._on_camera_info, 10)
        self.create_subscription(String, self.detections_2d_topic, self._on_detections_2d, 10)

        self.create_timer(self.benchmark_interval_s, self._publish_benchmark)
        self.create_service(Trigger, "~/get_benchmark", self._handle_get_benchmark)

    def _declare_parameters(self) -> None:
        self.declare_parameter("pointcloud_topic", "/robot0/point_cloud2_L1")
        self.declare_parameter("image_topic", "/robot0/front_cam/rgb")
        self.declare_parameter("camera_info_topic", "/robot0/front_cam/camera_info")
        self.declare_parameter("detections_2d_topic", "/perception/detections_2d")
        self.declare_parameter("lidar_frame", "lidar_frame")
        self.declare_parameter("camera_optical_frame", "camera_optical_frame")
        self.declare_parameter("max_range_m", 50.0)
        self.declare_parameter("min_range_m", 0.3)
        self.declare_parameter("depth_tolerance_m", 0.5)
        self.declare_parameter("min_points_in_bbox", 3)
        self.declare_parameter("image_width", 640)
        self.declare_parameter("image_height", 480)
        self.declare_parameter("benchmark_interval_s", 10.0)

    def _load_parameters(self) -> None:
        self.pointcloud_topic = str(self.get_parameter("pointcloud_topic").value)
        self.image_topic = str(self.get_parameter("image_topic").value)
        self.camera_info_topic = str(self.get_parameter("camera_info_topic").value)
        self.detections_2d_topic = str(self.get_parameter("detections_2d_topic").value)
        self.lidar_frame = str(self.get_parameter("lidar_frame").value)
        self.camera_optical_frame = str(self.get_parameter("camera_optical_frame").value)
        self.benchmark_interval_s = float(self.get_parameter("benchmark_interval_s").value)
        self.fusion_config = FusionConfig(
            max_range_m=float(self.get_parameter("max_range_m").value),
            min_range_m=float(self.get_parameter("min_range_m").value),
            depth_tolerance_m=float(self.get_parameter("depth_tolerance_m").value),
            min_points_in_bbox=int(self.get_parameter("min_points_in_bbox").value),
            image_width=int(self.get_parameter("image_width").value),
            image_height=int(self.get_parameter("image_height").value),
        )

    def _on_pointcloud(self, msg: PointCloud2) -> None:
        self.latest_cloud = msg

    def _on_camera_info(self, msg: CameraInfo) -> None:
        if len(msg.k) >= 6 and msg.k[0] > 0.0 and msg.k[4] > 0.0:
            self.latest_intrinsics = CameraIntrinsics(
                fx=float(msg.k[0]),
                fy=float(msg.k[4]),
                cx=float(msg.k[2]),
                cy=float(msg.k[5]),
            )

    def _on_detections_2d(self, msg: String) -> None:
        try:
            payload = json.loads(msg.data)
        except json.JSONDecodeError:
            self.get_logger().warning("Invalid detections_2d JSON; ignoring message")
            return

        if isinstance(payload, list):
            self.latest_detections_2d = [item for item in payload if isinstance(item, dict)]
            return
        if isinstance(payload, dict):
            detections = payload.get("detections", [])
            if isinstance(detections, list):
                self.latest_detections_2d = [item for item in detections if isinstance(item, dict)]

    def _on_image(self, _msg: Image) -> None:
        if self.latest_cloud is None or self.latest_intrinsics is None or not self.latest_detections_2d:
            return

        points_lidar = self._extract_points_from_cloud(self.latest_cloud)
        if not points_lidar:
            return

        transformed = self._transform_points_to_camera(points_lidar, self.latest_cloud.header.frame_id)
        if not transformed:
            return

        in_range = filter_points_by_range(transformed, self.fusion_config)
        if not in_range:
            return

        projected: list[tuple[Point3D, Any]] = []
        for point in in_range:
            pixel = project_point_to_pixel(point, self.latest_intrinsics)
            if pixel is None:
                continue
            if pixel.u >= self.fusion_config.image_width or pixel.v >= self.fusion_config.image_height:
                continue
            projected.append((point, pixel))

        fused_objects = []
        for det in self.latest_detections_2d:
            bbox = self._parse_bbox(det)
            if bbox is None:
                continue
            fused = fuse_detection(
                label=str(det.get("label", "unknown")),
                confidence=float(det.get("confidence", 0.0)),
                bbox=bbox,
                projected_points=projected,
                config=self.fusion_config,
            )
            if fused is not None:
                fused_objects.append(fused)

        self.last_benchmark = compute_benchmark(len(self.latest_detections_2d), fused_objects)
        self.last_fused = [fused_detection_to_dict(item) for item in fused_objects]

        payload = {
            "frame_id": self.camera_optical_frame,
            "fused_count": len(self.last_fused),
            "fused_detections": self.last_fused,
        }
        msg = String()
        msg.data = json.dumps(payload)
        self.fused_pub.publish(msg)

    def _extract_points_from_cloud(self, cloud: PointCloud2) -> list[Point3D]:
        try:
            from sensor_msgs_py import point_cloud2
        except ImportError:
            self.get_logger().warning("sensor_msgs_py not available; cannot parse PointCloud2")
            return []

        points: list[Point3D] = []
        try:
            iterator = point_cloud2.read_points(cloud, field_names=("x", "y", "z", "intensity"), skip_nans=True)
            for x, y, z, intensity in iterator:
                points.append(Point3D(float(x), float(y), float(z), float(intensity)))
            return points
        except Exception:
            pass

        try:
            iterator = point_cloud2.read_points(cloud, field_names=("x", "y", "z"), skip_nans=True)
            for x, y, z in iterator:
                points.append(Point3D(float(x), float(y), float(z), 0.0))
        except Exception as exc:  # noqa: BLE001
            self.get_logger().warning(f"Failed reading point cloud: {exc}")
        return points

    def _transform_points_to_camera(self, points: list[Point3D], source_frame: str) -> list[Point3D]:
        src = source_frame or self.lidar_frame
        try:
            transform = self.tf_buffer.lookup_transform(
                self.camera_optical_frame,
                src,
                Time(),
                timeout=Duration(seconds=1.0),
            )
        except TransformException as exc:
            self.get_logger().warning(f"TF lookup failed {src}->{self.camera_optical_frame}: {exc}")
            return []

        t = transform.transform.translation
        q = transform.transform.rotation

        tx = float(t.x)
        ty = float(t.y)
        tz = float(t.z)
        qx = float(q.x)
        qy = float(q.y)
        qz = float(q.z)
        qw = float(q.w)

        transformed: list[Point3D] = []
        for point in points:
            rx, ry, rz = self._rotate_vector(point.x, point.y, point.z, qx, qy, qz, qw)
            transformed.append(Point3D(rx + tx, ry + ty, rz + tz, point.intensity))
        return transformed

    def _rotate_vector(
        self,
        x: float,
        y: float,
        z: float,
        qx: float,
        qy: float,
        qz: float,
        qw: float,
    ) -> tuple[float, float, float]:
        tx = 2.0 * (qy * z - qz * y)
        ty = 2.0 * (qz * x - qx * z)
        tz = 2.0 * (qx * y - qy * x)
        rx = x + qw * tx + (qy * tz - qz * ty)
        ry = y + qw * ty + (qz * tx - qx * tz)
        rz = z + qw * tz + (qx * ty - qy * tx)
        return rx, ry, rz

    def _parse_bbox(self, det: dict[str, Any]) -> tuple[float, float, float, float] | None:
        if "bbox" in det and isinstance(det["bbox"], (list, tuple)) and len(det["bbox"]) == 4:
            values = det["bbox"]
        else:
            keys = ("bbox_x", "bbox_y", "bbox_w", "bbox_h")
            if not all(key in det for key in keys):
                return None
            values = [det[key] for key in keys]

        try:
            bbox_x, bbox_y, bbox_w, bbox_h = [float(value) for value in values]
        except (TypeError, ValueError):
            return None

        if bbox_w <= 0.0 or bbox_h <= 0.0:
            return None
        return (bbox_x, bbox_y, bbox_w, bbox_h)

    def _publish_benchmark(self) -> None:
        msg = String()
        msg.data = json.dumps(
            {
                "detection_count_2d": self.last_benchmark.detection_count_2d,
                "detection_count_fused": self.last_benchmark.detection_count_fused,
                "avg_depth_m": self.last_benchmark.avg_depth_m,
                "avg_point_count": self.last_benchmark.avg_point_count,
                "fusion_rate_pct": self.last_benchmark.fusion_rate_pct,
            }
        )
        self.benchmark_pub.publish(msg)

    def _handle_get_benchmark(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        response.success = True
        response.message = json.dumps(
            {
                "detection_count_2d": self.last_benchmark.detection_count_2d,
                "detection_count_fused": self.last_benchmark.detection_count_fused,
                "avg_depth_m": self.last_benchmark.avg_depth_m,
                "avg_point_count": self.last_benchmark.avg_point_count,
                "fusion_rate_pct": self.last_benchmark.fusion_rate_pct,
            }
        )
        return response


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = LidarCameraFusionNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
