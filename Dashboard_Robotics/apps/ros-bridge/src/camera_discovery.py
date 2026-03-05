"""
Camera Discovery Module

Automatic discovery of camera topics from ROS 2.
Uses rclpy to scan topics and detect sensor_msgs/Image types.

Features:
- Auto-discovery via get_topic_names_and_types()
- Continuous monitoring for new/removed cameras
- WebSocket notification of camera changes
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# =============================================================================
# Protocols
# =============================================================================


class WebSocketClient(Protocol):
    """Protocol for WebSocket client."""

    async def send(self, message: dict[str, Any]) -> None:
        """Send message to WebSocket server."""
        ...


class ROSNode(Protocol):
    """Protocol for ROS 2 node."""

    def get_topic_names_and_types(self) -> list[tuple[str, list[str]]]:
        """Get list of all topics and their types."""
        ...


# =============================================================================
# Data Models
# =============================================================================


@dataclass
class CameraCapabilities:
    """Camera streaming capabilities."""

    supportsWebRTC: bool = True
    supportsHLS: bool = True
    supportsPTZ: bool = False
    maxResolution: dict[str, int] = None
    maxFps: int = 30

    def __post_init__(self) -> None:
        if self.maxResolution is None:
            self.maxResolution = {"width": 1920, "height": 1080}

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "supportsWebRTC": self.supportsWebRTC,
            "supportsHLS": self.supportsHLS,
            "supportsPTZ": self.supportsPTZ,
            "maxResolution": self.maxResolution,
            "maxFps": self.maxFps,
        }


class CameraEntity(BaseModel):
    """Camera entity discovered from ROS 2."""

    model_config = {"populate_by_name": True}

    id: str
    robotId: str = Field(alias="robotId")
    name: str
    topic: str
    status: str = "connecting"
    capabilities: dict[str, Any]
    hlsUrl: str | None = None
    webrtcEnabled: bool = False


# =============================================================================
# Camera Discovery
# =============================================================================


class CameraDiscovery:
    """
    Automatic camera discovery from ROS 2 topics.

    Scans ROS 2 topics for camera image types and emits
    camera_discovered/camera_lost messages via WebSocket.
    """

    # ROS message types that indicate a camera topic
    CAMERA_TOPIC_TYPES = [
        "sensor_msgs/msg/Image",
        "sensor_msgs/msg/CompressedImage",
    ]

    def __init__(
        self,
        ws_client: WebSocketClient,
        node: ROSNode | None = None,
        robot_id: str = "robot-001",
        scan_interval: float = 5.0,
    ) -> None:
        """
        Initialize camera discovery.

        Args:
            ws_client: WebSocket client for sending messages
            node: ROS 2 node (optional, can be set later)
            robot_id: ID of the robot this bridge represents
            scan_interval: Seconds between topic scans
        """
        self.ws_client = ws_client
        self.node = node
        self.robot_id = robot_id
        self.scan_interval = scan_interval

        # Track known cameras
        self._known_cameras: dict[str, CameraEntity] = {}
        self._running = False

    def set_node(self, node: ROSNode) -> None:
        """Set the ROS 2 node after initialization."""
        self.node = node

    def _is_camera_topic(self, types: list[str]) -> bool:
        """
        Check if topic types indicate a camera.

        Args:
            types: List of message type strings

        Returns:
            True if any type is a camera image type
        """
        return any(t in self.CAMERA_TOPIC_TYPES for t in types)

    def _generate_camera_id(self, topic: str) -> str:
        """
        Generate unique camera ID from topic.

        Args:
            topic: ROS topic path

        Returns:
            Unique camera identifier
        """
        # Hash the topic for uniqueness
        topic_hash = hashlib.md5(topic.encode()).hexdigest()[:8]
        return f"{self.robot_id}-{topic_hash}"

    def _extract_camera_name(self, topic: str) -> str:
        """
        Extract human-readable camera name from topic.

        Args:
            topic: ROS topic path (e.g., /robot_001/camera_front/image)

        Returns:
            Human-readable name (e.g., "Front Camera")
        """
        parts = topic.split("/")

        # Find camera-related segment
        for part in parts:
            if "camera" in part.lower():
                # Extract position (front, rear, left, right, etc.)
                match = re.search(r"camera[_-]?(\w+)", part, re.IGNORECASE)
                if match:
                    position = match.group(1)
                    return f"{position.capitalize()} Camera"
                return "Camera"

        return "Camera"

    def _create_camera_entity(
        self, topic: str, types: list[str]
    ) -> CameraEntity:
        """
        Create camera entity from topic information.

        Args:
            topic: ROS topic path
            types: List of message types

        Returns:
            CameraEntity instance
        """
        capabilities = CameraCapabilities()

        return CameraEntity(
            id=self._generate_camera_id(topic),
            robotId=self.robot_id,
            name=self._extract_camera_name(topic),
            topic=topic,
            status="connecting",
            capabilities=capabilities.to_dict(),
            webrtcEnabled=True,
        )

    async def scan_topics(self) -> list[CameraEntity]:
        """
        Scan ROS 2 topics for cameras.

        Returns:
            List of discovered camera entities
        """
        if self.node is None:
            logger.warning("Cannot scan topics: ROS node not set")
            return []

        try:
            topics = self.node.get_topic_names_and_types()
        except Exception as e:
            logger.error(f"Failed to get topic names: {e}")
            return []

        cameras: list[CameraEntity] = []

        for topic, types in topics:
            if self._is_camera_topic(types):
                camera = self._create_camera_entity(topic, types)
                cameras.append(camera)

                # Update known cameras
                if camera.id not in self._known_cameras:
                    self._known_cameras[camera.id] = camera
                    await self._emit_camera_discovered(camera)

        return cameras

    async def _detect_changes(self) -> tuple[list[CameraEntity], list[str]]:
        """
        Detect added and removed cameras since last scan.

        Returns:
            Tuple of (added cameras, removed camera IDs)
        """
        if self.node is None:
            return [], []

        try:
            topics = self.node.get_topic_names_and_types()
        except Exception as e:
            logger.error(f"Failed to get topic names: {e}")
            return [], []

        # Build current camera set
        current_cameras: dict[str, CameraEntity] = {}
        for topic, types in topics:
            if self._is_camera_topic(types):
                camera = self._create_camera_entity(topic, types)
                current_cameras[camera.id] = camera

        # Find added cameras
        added = [
            cam for cam_id, cam in current_cameras.items()
            if cam_id not in self._known_cameras
        ]

        # Find removed cameras
        removed = [
            cam_id for cam_id in self._known_cameras
            if cam_id not in current_cameras
        ]

        # Update known cameras
        self._known_cameras = current_cameras

        return added, removed

    async def _emit_camera_discovered(self, camera: CameraEntity) -> None:
        """
        Emit camera_discovered message.

        Args:
            camera: Discovered camera entity
        """
        message = {
            "type": "camera_discovered",
            "timestamp": int(datetime.now().timestamp() * 1000),
            "data": camera.model_dump(by_alias=True),
        }

        try:
            await self.ws_client.send(message)
            logger.info(f"Camera discovered: {camera.name} ({camera.topic})")
        except Exception as e:
            logger.error(f"Failed to emit camera_discovered: {e}")

    async def _emit_camera_lost(self, camera_id: str) -> None:
        """
        Emit camera_lost message.

        Args:
            camera_id: ID of lost camera
        """
        message = {
            "type": "camera_lost",
            "timestamp": int(datetime.now().timestamp() * 1000),
            "data": {
                "cameraId": camera_id,
                "robotId": self.robot_id,
            },
        }

        try:
            await self.ws_client.send(message)
            logger.info(f"Camera lost: {camera_id}")
        except Exception as e:
            logger.error(f"Failed to emit camera_lost: {e}")

    async def watch_topics(self) -> None:
        """
        Continuously monitor topics for camera changes.

        Runs until stop() is called.
        """
        self._running = True
        logger.info(f"Starting topic watch (interval: {self.scan_interval}s)")

        while self._running:
            added, removed = await self._detect_changes()

            # Emit events for changes
            for camera in added:
                await self._emit_camera_discovered(camera)

            for camera_id in removed:
                await self._emit_camera_lost(camera_id)

            await asyncio.sleep(self.scan_interval)

    def stop(self) -> None:
        """Stop the topic watcher."""
        self._running = False
        logger.info("Topic watch stopped")

    def get_known_cameras(self) -> list[CameraEntity]:
        """
        Get list of currently known cameras.

        Returns:
            List of known camera entities
        """
        return list(self._known_cameras.values())
