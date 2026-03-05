"""
Camera Discovery Tests

TDD tests for automatic camera discovery from ROS 2 topics.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.camera_discovery import CameraDiscovery, CameraEntity


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def mock_ws_client() -> AsyncMock:
    """Create mock WebSocket client."""
    client = AsyncMock()
    client.send = AsyncMock()
    return client


@pytest.fixture
def mock_ros_node() -> MagicMock:
    """Create mock ROS 2 node."""
    node = MagicMock()
    node.get_topic_names_and_types = MagicMock(return_value=[])
    return node


@pytest.fixture
def camera_discovery(mock_ws_client: AsyncMock, mock_ros_node: MagicMock) -> CameraDiscovery:
    """Create CameraDiscovery instance with mocks."""
    return CameraDiscovery(ws_client=mock_ws_client, node=mock_ros_node, robot_id="robot-001")


# =============================================================================
# Topic Detection Tests
# =============================================================================


class TestTopicDetection:
    """Tests for camera topic detection logic."""

    def test_is_camera_topic_with_compressed_image(
        self, camera_discovery: CameraDiscovery
    ) -> None:
        """Should detect compressed image topics as camera."""
        types = ["sensor_msgs/msg/CompressedImage"]
        assert camera_discovery._is_camera_topic(types) is True

    def test_is_camera_topic_with_raw_image(
        self, camera_discovery: CameraDiscovery
    ) -> None:
        """Should detect raw image topics as camera."""
        types = ["sensor_msgs/msg/Image"]
        assert camera_discovery._is_camera_topic(types) is True

    def test_is_camera_topic_with_non_image(
        self, camera_discovery: CameraDiscovery
    ) -> None:
        """Should not detect non-image topics as camera."""
        types = ["std_msgs/msg/String"]
        assert camera_discovery._is_camera_topic(types) is False

    def test_is_camera_topic_with_multiple_types(
        self, camera_discovery: CameraDiscovery
    ) -> None:
        """Should detect camera if any type is image."""
        types = ["sensor_msgs/msg/CameraInfo", "sensor_msgs/msg/CompressedImage"]
        assert camera_discovery._is_camera_topic(types) is True

    def test_is_camera_topic_ignores_camera_info_alone(
        self, camera_discovery: CameraDiscovery
    ) -> None:
        """Should not detect CameraInfo alone as camera topic."""
        types = ["sensor_msgs/msg/CameraInfo"]
        assert camera_discovery._is_camera_topic(types) is False


# =============================================================================
# Camera Entity Creation Tests
# =============================================================================


class TestCameraEntityCreation:
    """Tests for creating camera entities from topics."""

    def test_create_camera_entity_basic(
        self, camera_discovery: CameraDiscovery
    ) -> None:
        """Should create camera entity with correct fields."""
        topic = "/robot_001/camera_front/image_compressed"
        types = ["sensor_msgs/msg/CompressedImage"]

        camera = camera_discovery._create_camera_entity(topic, types)

        assert camera.id.startswith("robot-001-")
        assert camera.robotId == "robot-001"
        assert camera.topic == topic
        assert camera.status == "connecting"

    def test_create_camera_entity_extracts_name_from_topic(
        self, camera_discovery: CameraDiscovery
    ) -> None:
        """Should extract human-readable name from topic."""
        topic = "/robot_001/camera_front/image_raw"
        types = ["sensor_msgs/msg/Image"]

        camera = camera_discovery._create_camera_entity(topic, types)

        assert "Front" in camera.name or "camera_front" in camera.name.lower()

    def test_create_camera_entity_capabilities(
        self, camera_discovery: CameraDiscovery
    ) -> None:
        """Should set default capabilities."""
        topic = "/camera/image"
        types = ["sensor_msgs/msg/Image"]

        camera = camera_discovery._create_camera_entity(topic, types)

        # Capabilities is a dict when serialized
        assert camera.capabilities["supportsWebRTC"] is True
        assert camera.capabilities["supportsHLS"] is True
        assert camera.capabilities["maxFps"] == 30


# =============================================================================
# Topic Scanning Tests
# =============================================================================


class TestTopicScanning:
    """Tests for scanning ROS 2 topics."""

    @pytest.mark.asyncio
    async def test_scan_topics_returns_cameras(
        self, camera_discovery: CameraDiscovery, mock_ros_node: MagicMock
    ) -> None:
        """Should return list of discovered cameras."""
        mock_ros_node.get_topic_names_and_types.return_value = [
            ("/robot_001/camera_front/image_compressed", ["sensor_msgs/msg/CompressedImage"]),
            ("/robot_001/camera_rear/image_raw", ["sensor_msgs/msg/Image"]),
        ]

        cameras = await camera_discovery.scan_topics()

        assert len(cameras) == 2
        assert all(isinstance(c, CameraEntity) for c in cameras)

    @pytest.mark.asyncio
    async def test_scan_topics_ignores_non_camera_topics(
        self, camera_discovery: CameraDiscovery, mock_ros_node: MagicMock
    ) -> None:
        """Should ignore non-camera topics."""
        mock_ros_node.get_topic_names_and_types.return_value = [
            ("/robot_001/odom", ["nav_msgs/msg/Odometry"]),
            ("/robot_001/camera/image", ["sensor_msgs/msg/Image"]),
            ("/rosout", ["rcl_interfaces/msg/Log"]),
        ]

        cameras = await camera_discovery.scan_topics()

        assert len(cameras) == 1
        assert cameras[0].topic == "/robot_001/camera/image"

    @pytest.mark.asyncio
    async def test_scan_topics_emits_camera_discovered(
        self, camera_discovery: CameraDiscovery, mock_ros_node: MagicMock, mock_ws_client: AsyncMock
    ) -> None:
        """Should emit camera_discovered message for each camera."""
        mock_ros_node.get_topic_names_and_types.return_value = [
            ("/camera/image", ["sensor_msgs/msg/Image"]),
        ]

        await camera_discovery.scan_topics()

        mock_ws_client.send.assert_called()
        call_args = mock_ws_client.send.call_args[0][0]
        assert call_args["type"] == "camera_discovered"


# =============================================================================
# Topic Watching Tests
# =============================================================================


class TestTopicWatching:
    """Tests for continuous topic monitoring."""

    @pytest.mark.asyncio
    async def test_watch_detects_new_camera(
        self, camera_discovery: CameraDiscovery, mock_ros_node: MagicMock, mock_ws_client: AsyncMock
    ) -> None:
        """Should detect and emit when new camera appears."""
        # First scan: no cameras
        mock_ros_node.get_topic_names_and_types.return_value = []
        await camera_discovery.scan_topics()

        # Second scan: new camera
        mock_ros_node.get_topic_names_and_types.return_value = [
            ("/camera/image", ["sensor_msgs/msg/Image"]),
        ]

        added, removed = await camera_discovery._detect_changes()

        assert len(added) == 1
        assert len(removed) == 0

    @pytest.mark.asyncio
    async def test_watch_detects_removed_camera(
        self, camera_discovery: CameraDiscovery, mock_ros_node: MagicMock
    ) -> None:
        """Should detect when camera disappears."""
        # First scan: one camera
        mock_ros_node.get_topic_names_and_types.return_value = [
            ("/camera/image", ["sensor_msgs/msg/Image"]),
        ]
        await camera_discovery.scan_topics()

        # Second scan: camera gone
        mock_ros_node.get_topic_names_and_types.return_value = []

        added, removed = await camera_discovery._detect_changes()

        assert len(added) == 0
        assert len(removed) == 1

    @pytest.mark.asyncio
    async def test_watch_emits_camera_lost(
        self, camera_discovery: CameraDiscovery, mock_ros_node: MagicMock, mock_ws_client: AsyncMock
    ) -> None:
        """Should emit camera_lost when camera disappears."""
        # First scan: one camera
        mock_ros_node.get_topic_names_and_types.return_value = [
            ("/camera/image", ["sensor_msgs/msg/Image"]),
        ]
        await camera_discovery.scan_topics()
        mock_ws_client.send.reset_mock()

        # Second scan: camera gone
        mock_ros_node.get_topic_names_and_types.return_value = []
        added, removed = await camera_discovery._detect_changes()

        # Emit lost messages
        for camera_id in removed:
            await camera_discovery._emit_camera_lost(camera_id)

        mock_ws_client.send.assert_called()
        call_args = mock_ws_client.send.call_args[0][0]
        assert call_args["type"] == "camera_lost"


# =============================================================================
# Edge Cases
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    @pytest.mark.asyncio
    async def test_scan_handles_empty_topics(
        self, camera_discovery: CameraDiscovery, mock_ros_node: MagicMock
    ) -> None:
        """Should handle empty topic list."""
        mock_ros_node.get_topic_names_and_types.return_value = []

        cameras = await camera_discovery.scan_topics()

        assert cameras == []

    @pytest.mark.asyncio
    async def test_scan_handles_ros_exception(
        self, camera_discovery: CameraDiscovery, mock_ros_node: MagicMock
    ) -> None:
        """Should handle ROS exceptions gracefully."""
        mock_ros_node.get_topic_names_and_types.side_effect = Exception("ROS error")

        cameras = await camera_discovery.scan_topics()

        assert cameras == []

    def test_unique_camera_id_generation(
        self, camera_discovery: CameraDiscovery
    ) -> None:
        """Should generate unique camera IDs."""
        topic1 = "/robot_001/camera_front/image"
        topic2 = "/robot_001/camera_rear/image"

        camera1 = camera_discovery._create_camera_entity(topic1, ["sensor_msgs/msg/Image"])
        camera2 = camera_discovery._create_camera_entity(topic2, ["sensor_msgs/msg/Image"])

        assert camera1.id != camera2.id
