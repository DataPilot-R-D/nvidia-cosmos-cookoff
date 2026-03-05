"""ROS2 camera bridge to Cosmos + dashboard Socket.IO events."""

from __future__ import annotations

import argparse
import base64
import json
import logging
import signal
import sys
import time
from typing import Any

import httpx
import numpy as np
import socketio
from PIL import Image as PILImage

from src.agents.v3.runtime import SurveillanceAgentV3
from src.connectors.cosmos_client import CosmosClient

try:
    import rclpy
    from sensor_msgs.msg import Image

    ROS2_AVAILABLE = True
except ImportError:  # pragma: no cover - exercised via unit tests with mocked imports
    rclpy = None  # type: ignore[assignment]
    Image = Any  # type: ignore[misc,assignment]
    ROS2_AVAILABLE = False


LOGGER = logging.getLogger(__name__)

DEFAULT_TOPIC = "/camera/image_raw"
DEFAULT_WS_URL = "http://localhost:8081"
DEFAULT_INTERVAL = 2.0
DEFAULT_COSMOS_URL = "http://63.182.177.92:8899"


class ROS2CosmosBridge:
    """Bridge ROS2 Image frames to Cosmos C2 analysis and dashboard events."""

    def __init__(
        self,
        ros_topic: str = DEFAULT_TOPIC,
        ws_url: str = DEFAULT_WS_URL,
        dashboard_url: str | None = None,
        interval: float = DEFAULT_INTERVAL,
        cosmos_url: str = DEFAULT_COSMOS_URL,
        socket_client: socketio.Client | None = None,
        cosmos_client: CosmosClient | None = None,
        agent: SurveillanceAgentV3 | None = None,
    ) -> None:
        self.ros_topic = ros_topic
        self.ws_url = ws_url
        self.dashboard_url = dashboard_url or ws_url
        self.interval = max(float(interval), 0.1)
        self.cosmos_url = cosmos_url
        self.running = True

        self._node: Any = None
        self._subscription: Any = None
        self._latest_image: Any = None
        self._last_processed_at = 0.0
        self._last_connect_attempt = 0.0
        self._connect_retry_seconds = 1.0
        self._ros_retry_seconds = 1.0
        self._last_ros_error_at = 0.0

        base_url = cosmos_url.rstrip("/")
        if not base_url.endswith("/v1"):
            base_url = f"{base_url}/v1"

        self.cosmos_client = cosmos_client or CosmosClient(base_url=base_url)
        self.agent = agent or SurveillanceAgentV3(cosmos=self.cosmos_client)

        self.sio = socket_client or socketio.Client(
            reconnection=True,
            reconnection_attempts=0,
            reconnection_delay=1,
            reconnection_delay_max=10,
        )
        self._register_socket_handlers()

    def _register_socket_handlers(self) -> None:
        @self.sio.event
        def connect() -> None:
            LOGGER.info("Connected to dashboard Socket.IO: %s", self.ws_url)

        @self.sio.event
        def disconnect() -> None:
            LOGGER.warning("Disconnected from dashboard Socket.IO")

        @self.sio.event
        def connect_error(data: Any) -> None:
            LOGGER.error("Socket.IO connection error: %s", data)

        @self.sio.on("reconnect")
        def on_reconnect() -> None:
            LOGGER.info("Socket.IO reconnected")

    def _ensure_socket_connected(self) -> None:
        if self.sio.connected:
            return
        now = time.monotonic()
        if now - self._last_connect_attempt < self._connect_retry_seconds:
            return
        self._last_connect_attempt = now
        try:
            self.sio.connect(self.ws_url, transports=["websocket", "polling"])
        except Exception as exc:  # pragma: no cover - depends on runtime network
            LOGGER.error("Socket.IO connect failed: %s", exc)

    def _init_ros(self) -> None:
        if not ROS2_AVAILABLE:
            raise RuntimeError("ROS2 dependencies unavailable. Install rclpy + sensor_msgs.")

        if self._node is not None:
            return

        if not rclpy.ok():
            rclpy.init(args=None)

        self._node = rclpy.create_node("ros2_cosmos_bridge")
        self._subscription = self._node.create_subscription(
            Image,
            self.ros_topic,
            self._on_image,
            10,
        )
        LOGGER.info("Subscribed to ROS2 image topic: %s", self.ros_topic)

    def _shutdown_ros(self) -> None:
        try:
            if self._node is not None:
                self._node.destroy_node()
        except Exception:
            LOGGER.debug("Ignored ROS2 node destroy failure", exc_info=True)
        finally:
            self._node = None
            self._subscription = None

        if ROS2_AVAILABLE:
            try:
                if rclpy.ok():
                    rclpy.shutdown()
            except Exception:
                LOGGER.debug("Ignored ROS2 shutdown failure", exc_info=True)

    def _on_image(self, msg: Any) -> None:
        self._latest_image = msg

    @staticmethod
    def ros_image_to_base64_jpeg(msg: Any) -> str:
        """Convert ROS2 sensor_msgs/Image (bgr8) to base64 JPEG."""
        encoding = str(getattr(msg, "encoding", "")).lower()
        if encoding not in ("bgr8", "rgb8"):
            raise ValueError(f"Unsupported ROS image encoding: {encoding or 'missing'}")

        height = int(getattr(msg, "height"))
        width = int(getattr(msg, "width"))
        step = int(getattr(msg, "step", width * 3))
        data = getattr(msg, "data")
        if not isinstance(data, (bytes, bytearray, memoryview)):
            # Isaac Sim may publish image data as a numpy array or list.
            data = bytes(data)

        raw = np.frombuffer(data, dtype=np.uint8)
        expected = height * step
        if raw.size < expected:
            raise ValueError("ROS image payload shorter than height*step")

        frame = raw.reshape((height, step))[:, : width * 3].reshape((height, width, 3))
        rgb_frame = frame if encoding == "rgb8" else frame[:, :, ::-1]
        image = PILImage.fromarray(rgb_frame, mode="RGB")
        from io import BytesIO

        buf = BytesIO()
        image.save(buf, format="JPEG", quality=85)
        return base64.b64encode(buf.getvalue()).decode("ascii")

    def _analyze_and_emit(self, frame_b64_jpeg: str) -> None:
        result = self.agent.analyze_frame(frame_b64_jpeg)
        payload = {
            "timestamp": time.time(),
            "topic": self.ros_topic,
            "analysis": result,
        }
        self.sio.emit("cosmos_event", payload)
        self._post_incident(result)

    def _post_incident(self, analysis_result: dict) -> None:
        anomalies = analysis_result.get("anomalies")
        if not isinstance(anomalies, list) or not anomalies:
            return

        first_anomaly = anomalies[0]
        if isinstance(first_anomaly, dict):
            title = (
                first_anomaly.get("description")
                or first_anomaly.get("message")
                or "Cosmos Alert: anomaly detected"
            )
        elif isinstance(first_anomaly, str):
            title = first_anomaly
        else:
            title = "Cosmos Alert: anomaly detected"

        severity_raw = str(analysis_result.get("severity", "low")).lower()
        severity_map = {
            "low": "Low",
            "medium": "Medium",
            "high": "High",
            "critical": "Critical",
        }

        payload = {
            "title": title,
            "description": json.dumps(analysis_result),
            "status": "New",
            "severity": severity_map.get(severity_raw, "Low"),
            "cameraSourceId": analysis_result.get("cameraSourceId")
            or analysis_result.get("camera_source_id"),
            "robotId": analysis_result.get("robotId") or analysis_result.get("robot_id"),
        }
        incident_url = f"{self.dashboard_url.rstrip('/')}/api/incidents"

        try:
            response = httpx.post(incident_url, json=payload, timeout=5.0)
            response.raise_for_status()
            LOGGER.info(
                "Posted incident to dashboard API: status=%s anomalies=%d",
                response.status_code,
                len(anomalies),
            )
        except Exception as exc:
            LOGGER.error("Failed to post incident to dashboard API: %s", exc)

    def _process_latest_frame(self, now: float | None = None) -> None:
        now = now if now is not None else time.monotonic()
        if now - self._last_processed_at < self.interval:
            return
        if self._latest_image is None:
            return

        msg = self._latest_image
        self._latest_image = None
        try:
            frame_b64 = self.ros_image_to_base64_jpeg(msg)
            self._analyze_and_emit(frame_b64)
            self._last_processed_at = now
        except Exception as exc:
            LOGGER.error("Frame processing failed: %s", exc)

    def spin_once(self) -> None:
        self._ensure_socket_connected()
        try:
            self._init_ros()
        except Exception as exc:
            now = time.monotonic()
            if now - self._last_ros_error_at >= self._ros_retry_seconds:
                LOGGER.error("ROS2 init failed (retrying): %s", exc)
                self._last_ros_error_at = now
            return

        try:
            rclpy.spin_once(self._node, timeout_sec=0.1)
        except Exception as exc:
            LOGGER.error("ROS2 spin_once failed, resetting node: %s", exc)
            self._shutdown_ros()
            return

        self._process_latest_frame(now=time.monotonic())

    def request_shutdown(self, *_args: Any) -> None:
        self.running = False

    def run(self) -> int:
        signal.signal(signal.SIGINT, self.request_shutdown)
        signal.signal(signal.SIGTERM, self.request_shutdown)
        LOGGER.info(
            "Starting ROS2↔Cosmos bridge (topic=%s, ws=%s, interval=%.2fs, cosmos=%s)",
            self.ros_topic,
            self.ws_url,
            self.interval,
            self.cosmos_url,
        )

        try:
            while self.running:
                self.spin_once()
                time.sleep(0.05)
            return 0
        finally:
            try:
                if self.sio.connected:
                    self.sio.disconnect()
            except Exception:
                LOGGER.debug("Ignored Socket.IO disconnect failure", exc_info=True)
            self._shutdown_ros()
            LOGGER.info("Bridge stopped")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="ROS2 camera bridge to Cosmos + Dashboard")
    parser.add_argument("--ros-topic", default=DEFAULT_TOPIC, help="ROS2 camera topic")
    parser.add_argument("--ws-url", default=DEFAULT_WS_URL, help="Socket.IO server URL")
    parser.add_argument(
        "--dashboard-url",
        default=None,
        help="Dashboard API base URL (defaults to --ws-url)",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL,
        help="Frame sampling interval in seconds",
    )
    parser.add_argument("--cosmos-url", default=DEFAULT_COSMOS_URL, help="Cosmos API base URL")
    return parser.parse_args(argv)


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def main(argv: list[str] | None = None) -> int:
    _configure_logging()
    args = parse_args(argv)
    bridge = ROS2CosmosBridge(
        ros_topic=args.ros_topic,
        ws_url=args.ws_url,
        dashboard_url=args.dashboard_url or args.ws_url,
        interval=args.interval,
        cosmos_url=args.cosmos_url,
    )
    return bridge.run()


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
