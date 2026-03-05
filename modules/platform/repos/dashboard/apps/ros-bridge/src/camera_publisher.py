"""
Camera Publisher Module

Publishes video frames from ROS 2 camera topics to WebSocket.
Supports JPEG/WebP encoding with quality control and FPS limiting.

Features:
- Frame encoding (JPEG, WebP)
- Rate limiting (max FPS)
- Quality control
- Binary or base64 transport
"""

from __future__ import annotations

import asyncio
import base64
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Protocol

import cv2
import numpy as np

logger = logging.getLogger(__name__)


# =============================================================================
# Protocols
# =============================================================================


class WebSocketClient(Protocol):
    """Protocol for WebSocket client."""

    async def send(self, message: dict[str, Any]) -> None:
        """Send message to WebSocket server."""
        ...


# =============================================================================
# Video Encoder
# =============================================================================


class VideoEncoder:
    """Static methods for encoding video frames."""

    @staticmethod
    def encode_jpeg(image: np.ndarray, quality: int = 75) -> bytes:
        """
        Encode image to JPEG bytes.

        Args:
            image: RGB or BGR numpy array
            quality: JPEG quality (1-100)

        Returns:
            JPEG encoded bytes
        """
        # Convert RGB to BGR if needed (OpenCV uses BGR)
        if len(image.shape) == 3 and image.shape[2] == 3:
            # Assume RGB input, convert to BGR for OpenCV
            bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
        else:
            bgr = image

        encode_params = [cv2.IMWRITE_JPEG_QUALITY, quality]
        success, encoded = cv2.imencode(".jpg", bgr, encode_params)

        if not success:
            raise ValueError("Failed to encode image to JPEG")

        return encoded.tobytes()

    @staticmethod
    def encode_webp(image: np.ndarray, quality: int = 75) -> bytes:
        """
        Encode image to WebP bytes.

        Args:
            image: RGB or BGR numpy array
            quality: WebP quality (1-100)

        Returns:
            WebP encoded bytes
        """
        if len(image.shape) == 3 and image.shape[2] == 3:
            bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
        else:
            bgr = image

        encode_params = [cv2.IMWRITE_WEBP_QUALITY, quality]
        success, encoded = cv2.imencode(".webp", bgr, encode_params)

        if not success:
            raise ValueError("Failed to encode image to WebP")

        return encoded.tobytes()

    @staticmethod
    def encode_to_base64(
        image: np.ndarray,
        format: str = "jpeg",
        quality: int = 75,
    ) -> str:
        """
        Encode image to base64 string.

        Args:
            image: RGB or BGR numpy array
            format: 'jpeg' or 'webp'
            quality: Encoding quality (1-100)

        Returns:
            Base64 encoded string
        """
        if format == "webp":
            encoded_bytes = VideoEncoder.encode_webp(image, quality)
        else:
            encoded_bytes = VideoEncoder.encode_jpeg(image, quality)

        return base64.b64encode(encoded_bytes).decode("utf-8")


# =============================================================================
# Subscription Data
# =============================================================================


@dataclass
class CameraSubscription:
    """Active camera subscription."""

    camera_id: str
    robot_id: str
    topic: str
    quality: int = 75
    max_fps: float = 30.0
    format: str = "jpeg"

    # Runtime state
    frame_number: int = 0
    last_frame_time: float = 0.0


# =============================================================================
# Camera Publisher
# =============================================================================


class CameraPublisher:
    """
    Publishes video frames to WebSocket.

    Manages camera subscriptions and handles frame encoding,
    rate limiting, and WebSocket transmission.
    """

    def __init__(self, ws_client: WebSocketClient) -> None:
        """
        Initialize camera publisher.

        Args:
            ws_client: WebSocket client for sending frames
        """
        self.ws_client = ws_client
        self.subscriptions: dict[str, CameraSubscription] = {}

    async def subscribe(
        self,
        camera_id: str,
        robot_id: str,
        topic: str,
        quality: int = 75,
        max_fps: float = 30.0,
        format: str = "jpeg",
    ) -> None:
        """
        Subscribe to camera stream.

        Args:
            camera_id: Unique camera identifier
            robot_id: Robot that owns the camera
            topic: ROS topic to subscribe to
            quality: JPEG/WebP quality (1-100)
            max_fps: Maximum frames per second
            format: 'jpeg' or 'webp'
        """
        self.subscriptions[camera_id] = CameraSubscription(
            camera_id=camera_id,
            robot_id=robot_id,
            topic=topic,
            quality=quality,
            max_fps=max_fps,
            format=format,
        )

        logger.info(
            f"Subscribed to camera {camera_id} "
            f"(quality={quality}, max_fps={max_fps})"
        )

    async def unsubscribe(self, camera_id: str) -> None:
        """
        Unsubscribe from camera stream.

        Args:
            camera_id: Camera to unsubscribe from
        """
        if camera_id in self.subscriptions:
            del self.subscriptions[camera_id]
            logger.info(f"Unsubscribed from camera {camera_id}")

    def is_subscribed(self, camera_id: str) -> bool:
        """
        Check if camera is subscribed.

        Args:
            camera_id: Camera to check

        Returns:
            True if subscribed
        """
        return camera_id in self.subscriptions

    def _should_publish(self, camera_id: str) -> bool:
        """
        Check if frame should be published (rate limiting).

        Args:
            camera_id: Camera to check

        Returns:
            True if enough time has passed since last frame
        """
        if camera_id not in self.subscriptions:
            return False

        sub = self.subscriptions[camera_id]
        current_time = time.time()
        min_interval = 1.0 / sub.max_fps

        if sub.last_frame_time == 0:
            return True

        return (current_time - sub.last_frame_time) >= min_interval

    def _update_last_frame_time(self, camera_id: str) -> None:
        """Update last frame time for rate limiting."""
        if camera_id in self.subscriptions:
            self.subscriptions[camera_id].last_frame_time = time.time()

    async def publish_frame(
        self,
        camera_id: str,
        image: np.ndarray,
    ) -> None:
        """
        Publish video frame to WebSocket.

        Args:
            camera_id: Camera that produced this frame
            image: RGB/BGR numpy array
        """
        if not self.is_subscribed(camera_id):
            return

        if not self._should_publish(camera_id):
            return

        sub = self.subscriptions[camera_id]

        try:
            # Encode frame
            if sub.format == "webp":
                frame_bytes = VideoEncoder.encode_webp(image, sub.quality)
            else:
                frame_bytes = VideoEncoder.encode_jpeg(image, sub.quality)

            # Get image dimensions
            height, width = image.shape[:2]

            # Increment frame number
            sub.frame_number += 1

            # Create message with base64 encoded frame
            message = {
                "type": "video_frame",
                "timestamp": int(datetime.now().timestamp() * 1000),
                "data": {
                    "cameraId": camera_id,
                    "robotId": sub.robot_id,
                    "format": sub.format,
                    "width": width,
                    "height": height,
                    "frameNumber": sub.frame_number,
                    "quality": sub.quality,
                    "frameData": base64.b64encode(frame_bytes).decode("utf-8"),
                },
            }

            await self.ws_client.send(message)
            self._update_last_frame_time(camera_id)

            logger.debug(
                f"Published frame {sub.frame_number} for camera {camera_id} "
                f"({width}x{height}, {len(frame_bytes)} bytes)"
            )

        except Exception as e:
            logger.error(f"Failed to publish frame for camera {camera_id}: {e}")

    async def publish_frame_binary(
        self,
        camera_id: str,
        image: np.ndarray,
    ) -> bytes | None:
        """
        Encode frame and return binary data.

        For use with binary WebSocket transport.

        Args:
            camera_id: Camera that produced this frame
            image: RGB/BGR numpy array

        Returns:
            Encoded bytes or None if not subscribed/rate limited
        """
        if not self.is_subscribed(camera_id):
            return None

        if not self._should_publish(camera_id):
            return None

        sub = self.subscriptions[camera_id]

        try:
            if sub.format == "webp":
                frame_bytes = VideoEncoder.encode_webp(image, sub.quality)
            else:
                frame_bytes = VideoEncoder.encode_jpeg(image, sub.quality)

            sub.frame_number += 1
            self._update_last_frame_time(camera_id)

            return frame_bytes

        except Exception as e:
            logger.error(f"Failed to encode frame for camera {camera_id}: {e}")
            return None

    def get_subscription(self, camera_id: str) -> CameraSubscription | None:
        """
        Get subscription details.

        Args:
            camera_id: Camera to get subscription for

        Returns:
            CameraSubscription or None
        """
        return self.subscriptions.get(camera_id)
