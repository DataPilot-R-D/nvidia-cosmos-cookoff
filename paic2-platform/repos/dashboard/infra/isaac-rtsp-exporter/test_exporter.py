#!/usr/bin/env python3
"""
Tests for Isaac RTSP Exporter.

Run: python -m pytest test_exporter.py -v
"""

import base64
import time
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
import yaml

from exporter import CameraStream, IsaacRTSPExporter, load_streams_config


# =============================================================================
# Config loading
# =============================================================================

class TestLoadStreamsConfig:
    def test_loads_yaml(self, tmp_path):
        config = {
            "streams": [
                {
                    "name": "test",
                    "path": "/isaac/test",
                    "topic": "/test/image_raw",
                    "topic_type": "sensor_msgs/Image",
                    "width": 640,
                    "height": 480,
                    "fps": 10,
                }
            ]
        }
        f = tmp_path / "streams.yaml"
        f.write_text(yaml.dump(config))
        result = load_streams_config(f)
        assert len(result) == 1
        assert result[0]["name"] == "test"
        assert result[0]["width"] == 640

    def test_empty_config(self, tmp_path):
        f = tmp_path / "empty.yaml"
        f.write_text("streams: []")
        result = load_streams_config(f)
        assert result == []

    def test_default_streams_file_exists(self):
        default = Path(__file__).parent / "streams.yaml"
        assert default.exists(), "streams.yaml must exist"
        config = load_streams_config(default)
        assert len(config) >= 2, "MVP requires at least 2 streams"


# =============================================================================
# CameraStream
# =============================================================================

class TestCameraStream:
    def setup_method(self):
        self.stream = CameraStream(
            name="test",
            topic="/test/image_raw",
            topic_type="sensor_msgs/Image",
            width=320,
            height=240,
            fps=10,
            keyframe_interval=10,
            encoding="rgb8",
        )

    def test_initial_state(self):
        assert self.stream.name == "test"
        assert self.stream.width == 320
        assert self.stream.height == 240
        assert self.stream.fps == 10
        assert self.stream.get_frame() is None
        assert self.stream._frame_count == 0

    def test_on_ros_message_rgb8(self):
        """Test that a valid RGB8 frame is stored."""
        frame_data = np.zeros((240, 320, 3), dtype=np.uint8)
        frame_data[0, 0] = [255, 0, 0]  # Red pixel at (0,0)
        raw = frame_data.tobytes()

        msg = {"data": base64.b64encode(raw).decode()}
        self.stream.on_ros_message(msg)

        result = self.stream.get_frame()
        assert result is not None
        assert len(result) == 320 * 240 * 3
        assert self.stream._frame_count == 1

    def test_on_ros_message_bgr8_conversion(self):
        """Test BGR8 → RGB conversion."""
        stream = CameraStream(
            name="bgr_test",
            topic="/test",
            topic_type="sensor_msgs/Image",
            width=2,
            height=1,
            fps=10,
            keyframe_interval=10,
            encoding="bgr8",
        )
        # BGR pixel: B=10, G=20, R=30
        bgr_data = bytes([10, 20, 30, 40, 50, 60])
        msg = {"data": base64.b64encode(bgr_data).decode()}
        stream.on_ros_message(msg)

        result = stream.get_frame()
        assert result is not None
        # Should be RGB: R=30, G=20, B=10
        assert result[0] == 30
        assert result[1] == 20
        assert result[2] == 10

    def test_rate_limiting(self):
        """Test that frames are rate-limited to target FPS."""
        frame_data = b"\x00" * (320 * 240 * 3)
        msg = {"data": base64.b64encode(frame_data).decode()}

        # First frame should be accepted
        self.stream.on_ros_message(msg)
        assert self.stream._frame_count == 1

        # Immediate second frame should be dropped (rate limit)
        self.stream.on_ros_message(msg)
        assert self.stream._frame_count == 1

        # After waiting, frame should be accepted
        self.stream._last_frame_time -= 0.2  # Fake time passing
        self.stream.on_ros_message(msg)
        assert self.stream._frame_count == 2

    def test_undersized_frame_rejected(self):
        """Test that frames smaller than expected are rejected."""
        small_data = b"\x00" * 100
        msg = {"data": base64.b64encode(small_data).decode()}
        self.stream.on_ros_message(msg)
        assert self.stream.get_frame() is None
        assert self.stream._frame_count == 0

    def test_pipeline_str_format(self):
        """Test that the GStreamer pipeline string is well-formed."""
        assert "appsrc" in self.stream.pipeline_str
        assert "nvh264enc" in self.stream.pipeline_str
        assert "rtph264pay" in self.stream.pipeline_str
        assert "width=320" in self.stream.pipeline_str
        assert "height=240" in self.stream.pipeline_str
        assert "framerate=10/1" in self.stream.pipeline_str
        assert "gop-size=10" in self.stream.pipeline_str

    def test_thread_safety(self):
        """Test concurrent frame access doesn't crash."""
        frame_data = b"\x00" * (320 * 240 * 3)
        msg = {"data": base64.b64encode(frame_data).decode()}

        import threading
        errors = []

        def writer():
            for i in range(50):
                try:
                    self.stream._last_frame_time = 0  # Reset rate limiter
                    self.stream.on_ros_message(msg)
                except Exception as e:
                    errors.append(e)

        def reader():
            for i in range(50):
                try:
                    self.stream.get_frame()
                except Exception as e:
                    errors.append(e)

        t1 = threading.Thread(target=writer)
        t2 = threading.Thread(target=reader)
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        assert len(errors) == 0, f"Thread safety errors: {errors}"


# =============================================================================
# Exporter initialization (no GStreamer required)
# =============================================================================

class TestExporterConfig:
    def test_streams_yaml_has_minimum_streams(self):
        """MVP requirement: at least 2 RTSP streams."""
        config = load_streams_config(Path(__file__).parent / "streams.yaml")
        assert len(config) >= 2

    def test_streams_have_required_fields(self):
        config = load_streams_config(Path(__file__).parent / "streams.yaml")
        for stream in config:
            assert "name" in stream
            assert "topic" in stream
            assert "width" in stream
            assert "height" in stream
            assert "fps" in stream

    def test_resolution_720p(self):
        """All streams should be 720p per spec."""
        config = load_streams_config(Path(__file__).parent / "streams.yaml")
        for stream in config:
            assert stream["width"] == 1280, f"{stream['name']} width != 1280"
            assert stream["height"] == 720, f"{stream['name']} height != 720"

    def test_fps_in_range(self):
        """FPS should be 15-20 per spec."""
        config = load_streams_config(Path(__file__).parent / "streams.yaml")
        for stream in config:
            assert 15 <= stream["fps"] <= 20, f"{stream['name']} fps={stream['fps']} out of range"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
