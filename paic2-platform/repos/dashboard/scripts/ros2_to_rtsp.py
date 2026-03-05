#!/usr/bin/env python3
"""
Bridge: ROS2 camera topic -> FFmpeg NVENC -> RTSP -> go2rtc -> WebRTC

Subscribes to a ROS2 Image topic (raw rgb8), pipes frames to ffmpeg
which encodes with h264_nvenc (GPU) and pushes to go2rtc RTSP server.

Deploy to: /home/ubuntu/ros2_to_rtsp.py on isaac-sim-1

Usage:
  source /opt/ros/humble/setup.bash
  python3 ros2_to_rtsp.py

  # With custom parameters:
  python3 ros2_to_rtsp.py --ros-args \
    -p topic:=/robot0/front_cam/rgb \
    -p width:=1280 -p height:=720 \
    -p fps:=30 -p bitrate:=4M \
    -p rtsp_url:=rtsp://127.0.0.1:8554/robot0_camera
"""

import subprocess
import sys
import signal
import time

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy
from sensor_msgs.msg import Image


class CameraToRTSP(Node):
    def __init__(self):
        super().__init__("camera_to_rtsp")

        # Parameters (configurable via --ros-args -p key:=value)
        self.declare_parameter("topic", "/robot0/front_cam/rgb")
        self.declare_parameter("width", 1280)
        self.declare_parameter("height", 720)
        self.declare_parameter("fps", 30)
        self.declare_parameter("bitrate", "4M")
        self.declare_parameter("rtsp_url", "rtsp://127.0.0.1:8554/robot0_camera")
        self.declare_parameter("preset", "p4")  # p1=fastest .. p7=best quality
        self.declare_parameter("gpu", "0")

        topic = self.get_parameter("topic").value
        self.width = self.get_parameter("width").value
        self.height = self.get_parameter("height").value
        fps = self.get_parameter("fps").value
        bitrate = self.get_parameter("bitrate").value
        rtsp_url = self.get_parameter("rtsp_url").value
        preset = self.get_parameter("preset").value
        gpu = self.get_parameter("gpu").value

        self.input_encoding = "rgb8"
        self.input_pix_fmt = "rgb24"
        self.bytes_per_pixel = 3
        self.expected_frame_size = self.width * self.height * self.bytes_per_pixel
        self.ffmpeg_proc = None
        self.frame_count = 0
        self.drop_count = 0
        self.start_time = time.time()
        self.terminal_error = False

        # Build FFmpeg command
        ffmpeg_cmd = self._build_ffmpeg_cmd(fps, bitrate, rtsp_url, preset, gpu)

        self.get_logger().info("Starting FFmpeg NVENC pipeline:")
        self.get_logger().info(
            f"  Input:  {topic} ({self.width}x{self.height} {self.input_encoding}/{self.input_pix_fmt})"
        )
        self.get_logger().info(f"  Encode: h264_nvenc preset={preset} bitrate={bitrate}")
        self.get_logger().info(f"  Output: {rtsp_url}")

        self.ffmpeg_proc = subprocess.Popen(
            ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        # Subscribe to camera topic with BEST_EFFORT QoS (matches Isaac Sim)
        qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=1,  # Only keep latest frame
        )
        self.subscription = self.create_subscription(
            Image, topic, self.image_callback, qos
        )

        self.get_logger().info("Bridge started. Waiting for camera frames...")

    @staticmethod
    def _encoding_to_ffmpeg_format(encoding):
        mapping = {
            "rgb8": ("rgb24", 3),
            "bgr8": ("bgr24", 3),
            "rgba8": ("rgba", 4),
            "bgra8": ("bgra", 4),
        }
        return mapping.get(encoding)

    @staticmethod
    def _pack_rows_if_padded(raw_data, height, step, packed_row_bytes):
        """Remove row padding when ROS image step is wider than packed width."""
        if step == packed_row_bytes:
            return raw_data

        src = memoryview(raw_data)
        packed = bytearray(packed_row_bytes * height)
        src_offset = 0
        dst_offset = 0
        for _ in range(height):
            packed[dst_offset:dst_offset + packed_row_bytes] = src[src_offset:src_offset + packed_row_bytes]
            src_offset += step
            dst_offset += packed_row_bytes
        return bytes(packed)

    def _stop_with_terminal_error(self, message):
        if self.terminal_error:
            return
        self.terminal_error = True
        self.get_logger().error(message)
        self.get_logger().error("Stopping bridge due to non-recoverable input format.")
        self.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()

    def _build_ffmpeg_cmd(self, fps, bitrate, rtsp_url, preset, gpu):
        return [
            "ffmpeg",
            "-hide_banner",
            "-loglevel", "warning",
            # Input: raw RGB frames from stdin
            "-f", "rawvideo",
            "-pix_fmt", self.input_pix_fmt,
            "-s", f"{self.width}x{self.height}",
            "-r", str(fps),
            "-i", "pipe:0",
            # Encoder: NVIDIA NVENC H.264
            "-c:v", "h264_nvenc",
            "-gpu", str(gpu),
            "-preset", preset,
            "-tune", "ll",           # Low latency tuning
            "-zerolatency", "1",     # No reordering delay
            "-rc", "cbr",            # Constant bitrate (stable for WebRTC)
            "-b:v", bitrate,
            "-maxrate", bitrate,
            "-bufsize", bitrate,     # 1-second buffer
            "-profile:v", "main",
            "-level", "4.1",
            "-g", str(fps * 2),      # Keyframe every 2 seconds
            "-bf", "0",              # No B-frames (lower latency)
            # Output: RTSP push to go2rtc
            "-f", "rtsp",
            "-rtsp_transport", "tcp",
            rtsp_url,
        ]

    def image_callback(self, msg: Image):
        if self.ffmpeg_proc is None or self.ffmpeg_proc.poll() is not None:
            self.get_logger().error("FFmpeg process died! Attempting restart...")
            self._restart_ffmpeg()
            return

        raw_data = bytes(msg.data)
        format_info = self._encoding_to_ffmpeg_format(msg.encoding)
        if format_info is None:
            self._stop_with_terminal_error(
                f"Unsupported image encoding: {msg.encoding}. "
                "Supported: rgb8, bgr8, rgba8, bgra8"
            )
            return

        msg_pix_fmt, msg_bpp = format_info
        packed_row_bytes = msg.width * msg_bpp
        if msg.step < packed_row_bytes:
            self.drop_count += 1
            self.get_logger().warn(
                f"Invalid step for {msg.encoding}: step={msg.step}, "
                f"min_required={packed_row_bytes}. Dropping frame."
            )
            return

        # Validate frame payload against message metadata.
        actual_size = len(raw_data)
        expected_size_from_step = msg.step * msg.height
        if actual_size != expected_size_from_step:
            self.drop_count += 1
            self.get_logger().warn(
                f"Frame size mismatch for {msg.encoding}: "
                f"expected {expected_size_from_step} (step*height), "
                f"got {actual_size}. Dropping frame."
            )
            return

        stream_changed = (
            msg.width != self.width
            or msg.height != self.height
            or msg_pix_fmt != self.input_pix_fmt
        )
        if stream_changed:
            self.get_logger().warn(
                f"Detected stream format change: "
                f"{self.width}x{self.height} {self.input_encoding}/{self.input_pix_fmt} -> "
                f"{msg.width}x{msg.height} {msg.encoding}/{msg_pix_fmt}. "
                "Restarting FFmpeg with updated input format."
            )
            self.width = msg.width
            self.height = msg.height
            self.input_encoding = msg.encoding
            self.input_pix_fmt = msg_pix_fmt
            self.bytes_per_pixel = msg_bpp
            self.expected_frame_size = msg.width * msg.height * msg_bpp
            self._restart_ffmpeg()
            return

        frame_data = self._pack_rows_if_padded(
            raw_data=raw_data,
            height=msg.height,
            step=msg.step,
            packed_row_bytes=packed_row_bytes,
        )

        try:
            self.ffmpeg_proc.stdin.write(frame_data)
            self.ffmpeg_proc.stdin.flush()
            self.frame_count += 1

            if self.frame_count % 300 == 0:
                elapsed = time.time() - self.start_time
                avg_fps = self.frame_count / elapsed if elapsed > 0 else 0
                self.get_logger().info(
                    f"Frames: {self.frame_count} | "
                    f"Dropped: {self.drop_count} | "
                    f"Avg FPS: {avg_fps:.1f} | "
                    f"Uptime: {elapsed:.0f}s"
                )
        except (BrokenPipeError, IOError) as e:
            self.get_logger().error(f"FFmpeg pipe broken: {e}")
            self._restart_ffmpeg()

    def _restart_ffmpeg(self):
        """Restart FFmpeg process after a failure."""
        if self.ffmpeg_proc and self.ffmpeg_proc.poll() is None:
            self.ffmpeg_proc.stdin.close()
            self.ffmpeg_proc.terminate()
            try:
                self.ffmpeg_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.ffmpeg_proc.kill()

        fps = self.get_parameter("fps").value
        bitrate = self.get_parameter("bitrate").value
        rtsp_url = self.get_parameter("rtsp_url").value
        preset = self.get_parameter("preset").value
        gpu = self.get_parameter("gpu").value

        ffmpeg_cmd = self._build_ffmpeg_cmd(fps, bitrate, rtsp_url, preset, gpu)

        self.get_logger().info(
            f"Restarting FFmpeg ({self.width}x{self.height}, {self.input_pix_fmt})..."
        )
        self.ffmpeg_proc = subprocess.Popen(
            ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    def destroy_node(self):
        if self.ffmpeg_proc and self.ffmpeg_proc.poll() is None:
            self.get_logger().info("Shutting down FFmpeg...")
            self.ffmpeg_proc.stdin.close()
            self.ffmpeg_proc.terminate()
            try:
                self.ffmpeg_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.ffmpeg_proc.kill()
        super().destroy_node()


def main():
    rclpy.init()
    node = CameraToRTSP()

    def signal_handler(sig, frame):
        node.get_logger().info("Received shutdown signal")
        node.destroy_node()
        rclpy.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == "__main__":
    main()
