#!/usr/bin/env python3
"""
Isaac Sim → RTSP Exporter (H.264 / NVENC)

Captures camera frames from Isaac Sim via ROSBridge WebSocket,
encodes them with GStreamer NVENC H.264, and serves RTSP streams.

Usage:
    python exporter.py --rosbridge ws://100.76.147.31:9090 --port 8557

Architecture:
    ROSBridge (sensor_msgs/Image) → frame buffer → GStreamer appsrc → nvh264enc → RTSP server
"""

import argparse
import base64
import logging
import os
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Optional

import numpy as np
import roslibpy
import yaml

# GStreamer imports — lazy to allow testing without GStreamer installed
Gst = None
GstRtspServer = None
GLib = None

def _init_gstreamer():
    global Gst, GstRtspServer, GLib
    if Gst is not None:
        return
    import gi
    gi.require_version("Gst", "1.0")
    gi.require_version("GstRtspServer", "1.0")
    from gi.repository import GLib as _GLib, Gst as _Gst, GstRtspServer as _GstRtspServer
    Gst = _Gst
    GstRtspServer = _GstRtspServer
    GLib = _GLib

# =============================================================================
# Logging
# =============================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("isaac-rtsp")

# =============================================================================
# Configuration
# =============================================================================

DEFAULT_ROSBRIDGE = os.getenv("ROSBRIDGE_URL", "ws://localhost:9090")
DEFAULT_PORT = int(os.getenv("RTSP_PORT", "8557"))
DEFAULT_RESOLUTION = os.getenv("RESOLUTION", "1280x720")
DEFAULT_FPS = int(os.getenv("FPS", "15"))
DEFAULT_KEYFRAME_INTERVAL = int(os.getenv("KEYFRAME_INTERVAL", "15"))
DEFAULT_STREAMS_FILE = Path(__file__).parent / "streams.yaml"


def load_streams_config(path: Path) -> list[dict]:
    """Load stream definitions from YAML."""
    with open(path) as f:
        config = yaml.safe_load(f)
    return config.get("streams", [])


# =============================================================================
# Stream Pipeline
# =============================================================================

class CameraStream:
    """
    Single camera stream: ROS topic → GStreamer NVENC → RTSP mount point.

    Uses GStreamer appsrc to push raw frames into an encoding pipeline.
    The pipeline encodes with nvh264enc (NVENC) and outputs to an RTSP
    media factory.
    """

    def __init__(
        self,
        name: str,
        topic: str,
        topic_type: str,
        width: int,
        height: int,
        fps: int,
        keyframe_interval: int,
        encoding: str = "rgb8",
    ):
        self.name = name
        self.topic = topic
        self.topic_type = topic_type
        self.width = width
        self.height = height
        self.fps = fps
        self.keyframe_interval = keyframe_interval
        self.encoding = encoding

        self._frame_count = 0
        self._last_frame_time = 0.0
        self._frame_interval = 1.0 / fps
        self._lock = threading.Lock()
        self._latest_frame: Optional[bytes] = None

        # GStreamer pipeline string for the RTSP factory
        # appsrc pushes raw RGB → videoconvert → nvh264enc → rtph264pay
        caps = f"video/x-raw,format=RGB,width={width},height={height},framerate={fps}/1"
        self.pipeline_str = (
            f"( appsrc name=src is-live=true block=false format=time "
            f"caps=\"{caps}\" "
            f"! videoconvert "
            f"! video/x-raw,format=NV12 "
            f"! nvh264enc "
            f"  preset=low-latency-hq "
            f"  bitrate=2000 "
            f"  gop-size={keyframe_interval} "
            f"  rc-mode=cbr "
            f"! video/x-h264,profile=baseline "
            f"! rtph264pay name=pay0 pt=96 config-interval=1 )"
        )

        log.info(
            "Stream '%s': %dx%d@%dfps, keyframe=%d, topic=%s",
            name, width, height, fps, keyframe_interval, topic,
        )

    def on_ros_message(self, msg: dict) -> None:
        """
        ROS image callback. Decodes the frame and stores it for GStreamer.

        Rate-limits to target FPS to avoid overwhelming the encoder.
        """
        now = time.monotonic()
        if now - self._last_frame_time < self._frame_interval:
            return  # Skip — too soon

        try:
            # ROS sensor_msgs/Image: data is base64-encoded in roslibpy
            raw_data = base64.b64decode(msg["data"])

            # Convert to numpy for potential format conversion
            expected_size = self.width * self.height * 3  # RGB8
            if len(raw_data) < expected_size:
                log.warning(
                    "Stream '%s': frame too small (%d < %d), skipping",
                    self.name, len(raw_data), expected_size,
                )
                return

            # If encoding is bgr8 (common in sim), convert to RGB
            if self.encoding == "bgr8":
                frame = np.frombuffer(raw_data[:expected_size], dtype=np.uint8)
                frame = frame.reshape((self.height, self.width, 3))
                frame = frame[:, :, ::-1]  # BGR → RGB
                raw_data = frame.tobytes()
            else:
                raw_data = raw_data[:expected_size]

            with self._lock:
                self._latest_frame = raw_data
                self._last_frame_time = now
                self._frame_count += 1

            if self._frame_count % (self.fps * 10) == 0:
                log.info("Stream '%s': %d frames captured", self.name, self._frame_count)

        except Exception:
            log.exception("Stream '%s': error processing frame", self.name)

    def get_frame(self) -> Optional[bytes]:
        """Get the latest frame (thread-safe)."""
        with self._lock:
            return self._latest_frame


# =============================================================================
# RTSP Media Factory (per stream)
# =============================================================================

def create_media_factory(stream: CameraStream):
    """
    Create a GStreamer RTSP media factory for a CameraStream.

    Uses appsrc → nvh264enc → rtph264pay pipeline.
    Requires GStreamer with NVENC plugins.
    """
    _init_gstreamer()

    class IsaacMediaFactory(GstRtspServer.RTSPMediaFactory):
        def __init__(self, stream: CameraStream):
            super().__init__()
            self.stream = stream
            self.set_launch(stream.pipeline_str)
            self.set_shared(True)
            self.set_latency(100)
            log.info("Factory created for stream '%s'", stream.name)

        def do_configure(self, media):
            appsrc = media.get_element().get_child_by_name("src")
            if appsrc is None:
                log.error("Stream '%s': appsrc not found!", self.stream.name)
                return

            duration = Gst.SECOND // self.stream.fps
            ctx = {"timestamp": 0, "duration": duration}

            def need_data(src, length):
                frame = self.stream.get_frame()
                if frame is None:
                    frame = b"\x00" * (self.stream.width * self.stream.height * 3)

                buf = Gst.Buffer.new_allocate(None, len(frame), None)
                buf.fill(0, frame)
                buf.pts = ctx["timestamp"]
                buf.duration = ctx["duration"]
                ctx["timestamp"] += ctx["duration"]

                retval = src.emit("push-buffer", buf)
                if retval != Gst.FlowReturn.OK:
                    log.warning("Stream '%s': push-buffer returned %s", self.stream.name, retval)

            appsrc.connect("need-data", need_data)

    return IsaacMediaFactory(stream)


# =============================================================================
# Main Exporter
# =============================================================================

class IsaacRTSPExporter:
    """
    Main exporter process.

    1. Connects to ROSBridge
    2. Subscribes to camera topics
    3. Starts GStreamer RTSP server
    4. Serves encoded streams
    """

    def __init__(
        self,
        rosbridge_url: str,
        port: int,
        streams_config: list[dict],
        keyframe_interval: int = 15,
    ):
        self.rosbridge_url = rosbridge_url
        self.port = port
        self.keyframe_interval = keyframe_interval

        # Initialize GStreamer
        _init_gstreamer()
        Gst.init(None)

        # Create camera streams
        self.streams: list[CameraStream] = []
        for sc in streams_config:
            stream = CameraStream(
                name=sc["name"],
                topic=sc["topic"],
                topic_type=sc.get("topic_type", "sensor_msgs/Image"),
                width=sc.get("width", 1280),
                height=sc.get("height", 720),
                fps=sc.get("fps", 15),
                keyframe_interval=sc.get("keyframe_interval", keyframe_interval),
                encoding=sc.get("encoding", "rgb8"),
            )
            self.streams.append(stream)

        # RTSP server
        self.server = GstRtspServer.RTSPServer()
        self.server.set_service(str(port))
        self.mounts = self.server.get_mount_points()

        # Mount each stream
        for stream in self.streams:
            factory = create_media_factory(stream)
            path = f"/isaac/{stream.name}"
            self.mounts.add_factory(path, factory)
            log.info("Mounted RTSP stream: rtsp://0.0.0.0:%d%s", port, path)

        # Attach server to GLib main loop
        self.server.attach(None)

        # ROS client
        self.ros_client: Optional[roslibpy.Ros] = None
        self.subscribers: list[roslibpy.Topic] = []

        # Main loop
        self.loop = GLib.MainLoop()
        self._running = False

    def _connect_ros(self) -> None:
        """Connect to ROSBridge and subscribe to camera topics."""
        log.info("Connecting to ROSBridge: %s", self.rosbridge_url)
        self.ros_client = roslibpy.Ros(host=self.rosbridge_url)

        # roslibpy expects host without ws:// prefix for some versions
        # Parse URL properly
        from urllib.parse import urlparse
        parsed = urlparse(self.rosbridge_url)
        host = parsed.hostname or "localhost"
        port = parsed.port or 9090

        self.ros_client = roslibpy.Ros(host=host, port=port)
        self.ros_client.on_ready(self._on_ros_ready)

        try:
            self.ros_client.run()
        except Exception:
            log.exception("Failed to connect to ROSBridge")
            raise

    def _on_ros_ready(self) -> None:
        """Called when ROSBridge connection is established."""
        log.info("ROSBridge connected!")

        for stream in self.streams:
            topic = roslibpy.Topic(
                self.ros_client,
                stream.topic,
                stream.topic_type,
                throttle_rate=int(1000 / stream.fps),  # ms between messages
                queue_length=1,
                queue_size=1,
            )
            topic.subscribe(stream.on_ros_message)
            self.subscribers.append(topic)
            log.info("Subscribed to %s for stream '%s'", stream.topic, stream.name)

    def _connect_ros_background(self) -> None:
        """Connect to ROS in a background thread (non-blocking)."""
        def connect():
            retry_delay = 2
            max_delay = 30
            while self._running:
                try:
                    self._connect_ros()
                    return  # Connected successfully
                except Exception as e:
                    log.warning(
                        "ROSBridge connection failed (%s), retrying in %ds...",
                        e, retry_delay,
                    )
                    time.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, max_delay)

        thread = threading.Thread(target=connect, daemon=True, name="ros-connect")
        thread.start()

    def start(self) -> None:
        """Start the exporter."""
        self._running = True

        log.info("=" * 60)
        log.info("Isaac → RTSP Exporter starting")
        log.info("  ROSBridge: %s", self.rosbridge_url)
        log.info("  RTSP port: %d", self.port)
        log.info("  Streams:   %d", len(self.streams))
        for s in self.streams:
            log.info("    - rtsp://0.0.0.0:%d/isaac/%s ← %s", self.port, s.name, s.topic)
        log.info("=" * 60)

        # Connect to ROS in background (RTSP server starts immediately)
        self._connect_ros_background()

        # Run GLib main loop (blocks)
        try:
            self.loop.run()
        except KeyboardInterrupt:
            log.info("Shutting down...")
        finally:
            self.stop()

    def stop(self) -> None:
        """Stop the exporter."""
        self._running = False

        # Unsubscribe from ROS topics
        for sub in self.subscribers:
            try:
                sub.unsubscribe()
            except Exception:
                pass

        # Close ROS connection
        if self.ros_client and self.ros_client.is_connected:
            try:
                self.ros_client.close()
            except Exception:
                pass

        # Stop GLib loop
        if self.loop.is_running():
            self.loop.quit()

        log.info("Exporter stopped.")


# =============================================================================
# CLI
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description="Isaac Sim → RTSP Exporter (H.264 / NVENC)",
    )
    parser.add_argument(
        "--rosbridge", "-r",
        default=DEFAULT_ROSBRIDGE,
        help=f"ROSBridge WebSocket URL (default: {DEFAULT_ROSBRIDGE})",
    )
    parser.add_argument(
        "--port", "-p",
        type=int,
        default=DEFAULT_PORT,
        help=f"RTSP server port (default: {DEFAULT_PORT})",
    )
    parser.add_argument(
        "--streams", "-s",
        type=Path,
        default=DEFAULT_STREAMS_FILE,
        help=f"Streams config YAML (default: {DEFAULT_STREAMS_FILE})",
    )
    parser.add_argument(
        "--keyframe-interval", "-k",
        type=int,
        default=DEFAULT_KEYFRAME_INTERVAL,
        help=f"Keyframe interval in frames (default: {DEFAULT_KEYFRAME_INTERVAL})",
    )
    parser.add_argument(
        "--fps", "-f",
        type=int,
        default=None,
        help="Override FPS for all streams",
    )
    parser.add_argument(
        "--resolution",
        default=None,
        help="Override resolution for all streams (e.g., 1280x720)",
    )
    args = parser.parse_args()

    # Load streams config
    streams_config = load_streams_config(args.streams)

    # Apply CLI overrides
    if args.fps:
        for sc in streams_config:
            sc["fps"] = args.fps
    if args.resolution:
        w, h = args.resolution.split("x")
        for sc in streams_config:
            sc["width"] = int(w)
            sc["height"] = int(h)

    if not streams_config:
        log.error("No streams configured! Check %s", args.streams)
        sys.exit(1)

    # Handle signals
    exporter = IsaacRTSPExporter(
        rosbridge_url=args.rosbridge,
        port=args.port,
        streams_config=streams_config,
        keyframe_interval=args.keyframe_interval,
    )

    def shutdown(signum, frame):
        log.info("Signal %d received, shutting down...", signum)
        exporter.stop()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    exporter.start()


if __name__ == "__main__":
    main()
