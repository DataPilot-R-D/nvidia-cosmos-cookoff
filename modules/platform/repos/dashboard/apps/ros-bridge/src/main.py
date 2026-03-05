"""
ROS 2 Bridge Main Entry Point

This module initializes the ROS 2 node and WebSocket client,
managing bidirectional communication between robots and the dashboard.

Features:
- Auto-discovery of camera topics from ROS 2
- Video frame publishing to WebSocket
- Bidirectional command handling
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
from datetime import datetime
from typing import Any

import websockets
from dotenv import load_dotenv
from pydantic import BaseModel, Field

from camera_discovery import CameraDiscovery
from camera_publisher import CameraPublisher

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Configuration
WS_SERVER_URL = os.getenv("WS_SERVER_URL", "ws://localhost:8080")
RECONNECT_DELAY = int(os.getenv("RECONNECT_DELAY", "5"))
ROBOT_ID = os.getenv("ROBOT_ID", "robot-001")
CAMERA_SCAN_INTERVAL = float(os.getenv("CAMERA_SCAN_INTERVAL", "5.0"))


# =============================================================================
# Data Models (matching shared-types)
# =============================================================================


class RobotPosition(BaseModel):
    """Robot position in 3D space."""

    x: float
    y: float
    z: float
    heading: float | None = None


class RobotStateData(BaseModel):
    """Robot state data payload."""

    robot_id: str = Field(alias="robotId")
    name: str | None = None
    position: RobotPosition
    battery: float = Field(ge=0, le=100)
    status: str
    velocity: float | None = None
    last_seen: int = Field(alias="lastSeen")

    class Config:
        populate_by_name = True


class RobotStateMessage(BaseModel):
    """Robot state WebSocket message."""

    type: str = "robot_state"
    timestamp: int
    data: RobotStateData


class CommandData(BaseModel):
    """Command data payload."""

    robot_id: str = Field(alias="robotId")
    action: str
    params: dict[str, Any] | None = None
    priority: str = "normal"

    class Config:
        populate_by_name = True


class CommandMessage(BaseModel):
    """Command WebSocket message."""

    type: str = "command"
    timestamp: int
    data: CommandData


# =============================================================================
# WebSocket Client
# =============================================================================


class WebSocketBridgeClient:
    """WebSocket client for communication with the central server."""

    def __init__(self, url: str) -> None:
        self.url = url
        self.websocket: websockets.WebSocketClientProtocol | None = None
        self._running = False
        self._message_handlers: dict[str, list[Any]] = {}

    async def connect(self) -> None:
        """Establish WebSocket connection with auto-reconnect."""
        self._running = True
        while self._running:
            try:
                logger.info(f"Connecting to WebSocket server: {self.url}")
                async with websockets.connect(self.url) as ws:
                    self.websocket = ws
                    logger.info("WebSocket connected successfully")
                    await self._handle_messages()
            except websockets.ConnectionClosed as e:
                logger.warning(f"WebSocket connection closed: {e}")
            except Exception as e:
                logger.error(f"WebSocket error: {e}")

            if self._running:
                logger.info(f"Reconnecting in {RECONNECT_DELAY} seconds...")
                await asyncio.sleep(RECONNECT_DELAY)

    async def _handle_messages(self) -> None:
        """Process incoming WebSocket messages."""
        if self.websocket is None:
            return

        async for message in self.websocket:
            try:
                data = json.loads(message)
                msg_type = data.get("type")
                logger.debug(f"Received message: {msg_type}")

                # Call registered handlers
                handlers = self._message_handlers.get(msg_type, [])
                for handler in handlers:
                    await handler(data)

            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse message: {e}")
            except Exception as e:
                logger.error(f"Error handling message: {e}")

    async def send(self, message: dict[str, Any]) -> None:
        """Send message to WebSocket server."""
        if self.websocket is None:
            logger.warning("Cannot send: WebSocket not connected")
            return

        try:
            await self.websocket.send(json.dumps(message))
            logger.debug(f"Sent message: {message.get('type')}")
        except Exception as e:
            logger.error(f"Failed to send message: {e}")

    def on_message(self, msg_type: str, handler: Any) -> None:
        """Register a message handler."""
        if msg_type not in self._message_handlers:
            self._message_handlers[msg_type] = []
        self._message_handlers[msg_type].append(handler)

    async def close(self) -> None:
        """Close the WebSocket connection."""
        self._running = False
        if self.websocket is not None:
            await self.websocket.close()
            logger.info("WebSocket connection closed")


# =============================================================================
# ROS 2 Bridge (Placeholder)
# =============================================================================


class ROSBridge:
    """
    ROS 2 Bridge for robot communication.

    Features:
    - Camera auto-discovery from ROS 2 topics
    - Video frame publishing
    - Command handling from dashboard
    """

    def __init__(self, ws_client: WebSocketBridgeClient, robot_id: str = ROBOT_ID) -> None:
        self.ws_client = ws_client
        self.robot_id = robot_id
        self._robots: dict[str, RobotStateData] = {}

        # Camera modules
        self.camera_discovery = CameraDiscovery(
            ws_client=ws_client,
            robot_id=robot_id,
            scan_interval=CAMERA_SCAN_INTERVAL,
        )
        self.camera_publisher = CameraPublisher(ws_client=ws_client)

        # ROS 2 node (set when ROS is initialized)
        self.node = None
        self._watch_task: asyncio.Task | None = None

    async def start(self) -> None:
        """Initialize ROS 2 node and subscriptions."""
        logger.info(f"Starting ROS 2 bridge for robot: {self.robot_id}")

        # Register message handlers
        self.ws_client.on_message("command", self._handle_command)
        self.ws_client.on_message("camera_subscribe", self._handle_camera_subscribe)
        self.ws_client.on_message("camera_unsubscribe", self._handle_camera_unsubscribe)

        # TODO: Initialize ROS 2 node when rclpy is available
        # rclpy.init()
        # self.node = rclpy.create_node('security_robot_bridge')
        # self.camera_discovery.set_node(self.node)

        # Start camera discovery (placeholder mode without ROS)
        # When ROS is available, uncomment to start watching:
        # self._watch_task = asyncio.create_task(self.camera_discovery.watch_topics())

        logger.info("ROS 2 bridge started (placeholder mode - no ROS node)")

    async def _handle_command(self, message: dict[str, Any]) -> None:
        """Handle incoming commands from dashboard."""
        try:
            cmd = CommandMessage(**message)
            logger.info(f"Received command: {cmd.data.action} for robot {cmd.data.robot_id}")

            # TODO: Forward command to ROS 2
            # self.node.publish(...)

        except Exception as e:
            logger.error(f"Failed to handle command: {e}")

    async def _handle_camera_subscribe(self, message: dict[str, Any]) -> None:
        """Handle camera subscription request from dashboard."""
        try:
            data = message.get("data", {})
            camera_id = data.get("cameraId")
            robot_id = data.get("robotId", self.robot_id)
            quality = data.get("quality", 75)
            max_fps = data.get("maxFps", 30)

            if not camera_id:
                logger.warning("Camera subscribe missing cameraId")
                return

            # Find camera topic from discovery
            cameras = self.camera_discovery.get_known_cameras()
            camera = next((c for c in cameras if c.id == camera_id), None)

            if camera:
                await self.camera_publisher.subscribe(
                    camera_id=camera_id,
                    robot_id=robot_id,
                    topic=camera.topic,
                    quality=quality,
                    max_fps=max_fps,
                )
                logger.info(f"Subscribed to camera: {camera_id}")

                # TODO: Create ROS subscription when rclpy available
                # self.node.create_subscription(...)
            else:
                logger.warning(f"Camera not found: {camera_id}")

        except Exception as e:
            logger.error(f"Failed to handle camera_subscribe: {e}")

    async def _handle_camera_unsubscribe(self, message: dict[str, Any]) -> None:
        """Handle camera unsubscription request from dashboard."""
        try:
            data = message.get("data", {})
            camera_id = data.get("cameraId")

            if camera_id:
                await self.camera_publisher.unsubscribe(camera_id)
                logger.info(f"Unsubscribed from camera: {camera_id}")

        except Exception as e:
            logger.error(f"Failed to handle camera_unsubscribe: {e}")

    async def publish_robot_state(self, robot_id: str, state: RobotStateData) -> None:
        """Publish robot state to WebSocket server."""
        message = RobotStateMessage(
            timestamp=int(datetime.now().timestamp() * 1000),
            data=state,
        )
        await self.ws_client.send(message.model_dump(by_alias=True))

    async def stop(self) -> None:
        """Shutdown ROS 2 node and camera modules."""
        logger.info("Stopping ROS 2 bridge")

        # Stop camera discovery watcher
        if self._watch_task:
            self.camera_discovery.stop()
            self._watch_task.cancel()
            try:
                await self._watch_task
            except asyncio.CancelledError:
                pass

        # TODO: Cleanup ROS 2
        # rclpy.shutdown()


# =============================================================================
# Main Entry Point
# =============================================================================


async def main_async() -> None:
    """Async main function."""
    # Initialize WebSocket client
    ws_client = WebSocketBridgeClient(WS_SERVER_URL)

    # Initialize ROS bridge
    ros_bridge = ROSBridge(ws_client)

    # Handle shutdown signals
    loop = asyncio.get_event_loop()
    stop_event = asyncio.Event()

    def signal_handler() -> None:
        logger.info("Shutdown signal received")
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)

    try:
        # Start ROS bridge
        await ros_bridge.start()

        # Start WebSocket connection
        ws_task = asyncio.create_task(ws_client.connect())

        # Wait for shutdown
        await stop_event.wait()

    finally:
        # Cleanup
        await ws_client.close()
        await ros_bridge.stop()
        ws_task.cancel()

        logger.info("ROS 2 Bridge shutdown complete")


def main() -> None:
    """Main entry point."""
    logger.info("Starting Security Robot ROS 2 Bridge")
    logger.info(f"WebSocket Server: {WS_SERVER_URL}")

    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        logger.info("Interrupted by user")


if __name__ == "__main__":
    main()
