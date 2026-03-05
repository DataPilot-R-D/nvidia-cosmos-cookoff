from __future__ import annotations

import json
import subprocess
from dataclasses import asdict
from typing import Any

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image
from std_msgs.msg import String
from std_srvs.srv import Trigger

from .streaming_core import (
    DEFAULT_STREAMS,
    FrameStats,
    StreamConfig,
    build_ffmpeg_command,
    compute_frame_stats,
    stream_status_to_json,
    validate_stream_config,
)


class _StreamRuntime:
    def __init__(self, config: StreamConfig) -> None:
        self.config = config
        self.process: subprocess.Popen[bytes] | None = None
        self.frames_sent = 0
        self.frames_dropped = 0
        self.last_frame_s = 0.0
        self.last_emit_s = 0.0
        self.latencies_s: list[float] = []


class StreamingBridgeNode(Node):
    def __init__(self) -> None:
        super().__init__("sras_streaming_bridge")

        self.declare_parameter(
            "streams",
            [json.dumps(asdict(cfg), separators=(",", ":")) for cfg in DEFAULT_STREAMS],
        )
        self.declare_parameter("rtsp_base_url", "rtsp://localhost:8554")
        self.declare_parameter("status_interval_s", 5.0)

        self.rtsp_base_url = str(self.get_parameter("rtsp_base_url").value)
        self.status_interval_s = float(self.get_parameter("status_interval_s").value)
        self.streams = self._parse_streams_parameter()
        self.stream_runtime: dict[str, _StreamRuntime] = {}

        self.status_pub = self.create_publisher(String, "~/stream_status", 10)
        self.status_srv = self.create_service(Trigger, "~/get_status", self._handle_get_status)

        for config in self.streams:
            runtime = _StreamRuntime(config)
            self.stream_runtime[config.stream_id] = runtime
            self.create_subscription(Image, config.image_topic, self._make_image_callback(runtime), 10)
            self._start_ffmpeg(runtime)

        self.create_timer(self.status_interval_s, self._publish_status)

    def _parse_streams_parameter(self) -> list[StreamConfig]:
        raw_streams = self.get_parameter("streams").value
        if not isinstance(raw_streams, list):
            return list(DEFAULT_STREAMS)

        resolved: list[StreamConfig] = []
        for raw in raw_streams:
            try:
                payload = json.loads(str(raw))
                config = StreamConfig(
                    stream_id=str(payload["stream_id"]),
                    image_topic=str(payload["image_topic"]),
                    fps=int(payload.get("fps", 15)),
                    width=int(payload.get("width", 640)),
                    height=int(payload.get("height", 480)),
                    encoding=str(payload.get("encoding", "h264")),
                    rtsp_path=str(payload.get("rtsp_path", "")),
                )
                valid, reason = validate_stream_config(config)
                if not valid:
                    self.get_logger().error(f"invalid stream config for {config.stream_id}: {reason}")
                    continue
                resolved.append(config)
            except Exception as exc:  # noqa: BLE001
                self.get_logger().error(f"failed to parse stream config '{raw}': {exc}")

        if not resolved:
            self.get_logger().warning("no valid streams configured; using defaults")
            return list(DEFAULT_STREAMS)
        return resolved

    def _start_ffmpeg(self, runtime: _StreamRuntime) -> None:
        rtsp_path = runtime.config.rtsp_path or runtime.config.stream_id
        rtsp_url = f"{self.rtsp_base_url.rstrip('/')}/{rtsp_path}"
        cmd = build_ffmpeg_command(runtime.config, rtsp_url)
        try:
            runtime.process = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            self.get_logger().info(f"started ffmpeg for {runtime.config.stream_id}: {rtsp_url}")
        except Exception as exc:  # noqa: BLE001
            runtime.process = None
            self.get_logger().error(f"failed to start ffmpeg for {runtime.config.stream_id}: {exc}")

    def _make_image_callback(self, runtime: _StreamRuntime):
        def _callback(msg: Image) -> None:
            now_s = self.get_clock().now().nanoseconds / 1e9
            frame_interval_s = 1.0 / max(1, runtime.config.fps)
            if runtime.last_emit_s > 0.0 and (now_s - runtime.last_emit_s) < frame_interval_s:
                runtime.frames_dropped += 1
                return

            if runtime.process is None or runtime.process.stdin is None or runtime.process.poll() is not None:
                runtime.frames_dropped += 1
                self._start_ffmpeg(runtime)
                return

            if msg.width != runtime.config.width or msg.height != runtime.config.height:
                runtime.frames_dropped += 1
                return

            if msg.encoding != "bgr8":
                runtime.frames_dropped += 1
                return

            expected_size = runtime.config.width * runtime.config.height * 3
            frame_bytes = bytes(msg.data)
            if len(frame_bytes) < expected_size:
                runtime.frames_dropped += 1
                return

            try:
                runtime.process.stdin.write(frame_bytes[:expected_size])
                runtime.process.stdin.flush()
            except Exception:  # noqa: BLE001
                runtime.frames_dropped += 1
                self._restart_ffmpeg(runtime)
                return

            runtime.frames_sent += 1
            runtime.last_frame_s = now_s
            runtime.last_emit_s = now_s
            msg_stamp_s = float(msg.header.stamp.sec) + float(msg.header.stamp.nanosec) / 1e9
            latency_s = max(0.0, now_s - msg_stamp_s)
            runtime.latencies_s.append(latency_s)
            if len(runtime.latencies_s) > 120:
                runtime.latencies_s = runtime.latencies_s[-120:]

        return _callback

    def _restart_ffmpeg(self, runtime: _StreamRuntime) -> None:
        if runtime.process is not None:
            try:
                runtime.process.kill()
                runtime.process.wait(timeout=1.0)
            except Exception:  # noqa: BLE001
                pass
            runtime.process = None
        self._start_ffmpeg(runtime)

    def _collect_status(self) -> list[FrameStats]:
        result: list[FrameStats] = []
        for stream_id, runtime in self.stream_runtime.items():
            stats = compute_frame_stats(
                sent=runtime.frames_sent,
                dropped=runtime.frames_dropped,
                last_s=runtime.last_frame_s,
                latencies=runtime.latencies_s,
            )
            stats.stream_id = stream_id
            result.append(stats)
        return result

    def _publish_status(self) -> None:
        status_msg = String()
        status_msg.data = stream_status_to_json(self._collect_status())
        self.status_pub.publish(status_msg)

    def _handle_get_status(self, _request: Trigger.Request, response: Trigger.Response) -> Trigger.Response:
        response.success = True
        response.message = stream_status_to_json(self._collect_status())
        return response

    def destroy_node(self) -> bool:
        for runtime in self.stream_runtime.values():
            if runtime.process is None:
                continue
            try:
                if runtime.process.stdin is not None:
                    runtime.process.stdin.close()
                runtime.process.terminate()
                runtime.process.wait(timeout=1.0)
            except Exception:  # noqa: BLE001
                try:
                    runtime.process.kill()
                except Exception:  # noqa: BLE001
                    pass
        return super().destroy_node()


def main(args: list[str] | None = None) -> None:
    rclpy.init(args=args)
    node = StreamingBridgeNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
