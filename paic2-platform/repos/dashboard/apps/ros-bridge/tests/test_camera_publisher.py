"""
Camera Publisher Tests

TDD tests for camera frame publishing to WebSocket.
"""

from __future__ import annotations

import asyncio
import base64
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import numpy as np

from src.camera_publisher import CameraPublisher, VideoEncoder


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
def camera_publisher(mock_ws_client: AsyncMock) -> CameraPublisher:
    """Create CameraPublisher instance with mock client."""
    return CameraPublisher(ws_client=mock_ws_client)


@pytest.fixture
def sample_image() -> np.ndarray:
    """Create sample 640x480 RGB image."""
    return np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)


# =============================================================================
# VideoEncoder Tests
# =============================================================================


class TestVideoEncoder:
    """Tests for video encoding functionality."""

    def test_encode_jpeg_returns_bytes(self, sample_image: np.ndarray) -> None:
        """Should encode image to JPEG bytes."""
        result = VideoEncoder.encode_jpeg(sample_image)

        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_encode_jpeg_starts_with_ffd8(self, sample_image: np.ndarray) -> None:
        """JPEG bytes should start with FFD8 magic bytes."""
        result = VideoEncoder.encode_jpeg(sample_image)

        assert result[:2] == b"\xff\xd8"

    def test_encode_jpeg_quality_affects_size(self, sample_image: np.ndarray) -> None:
        """Higher quality should produce larger files."""
        low_quality = VideoEncoder.encode_jpeg(sample_image, quality=10)
        high_quality = VideoEncoder.encode_jpeg(sample_image, quality=95)

        assert len(high_quality) > len(low_quality)

    def test_encode_jpeg_default_quality_75(self, sample_image: np.ndarray) -> None:
        """Default quality should be 75."""
        default = VideoEncoder.encode_jpeg(sample_image)
        quality_75 = VideoEncoder.encode_jpeg(sample_image, quality=75)

        # Should produce similar sizes (within 10% tolerance)
        assert abs(len(default) - len(quality_75)) < len(default) * 0.1

    def test_encode_webp_returns_bytes(self, sample_image: np.ndarray) -> None:
        """Should encode image to WebP bytes."""
        result = VideoEncoder.encode_webp(sample_image)

        assert isinstance(result, bytes)
        assert len(result) > 0

    def test_encode_webp_starts_with_riff(self, sample_image: np.ndarray) -> None:
        """WebP bytes should start with RIFF header."""
        result = VideoEncoder.encode_webp(sample_image)

        assert result[:4] == b"RIFF"

    def test_encode_to_base64_returns_string(self, sample_image: np.ndarray) -> None:
        """Should encode image to base64 string."""
        result = VideoEncoder.encode_to_base64(sample_image, format="jpeg")

        assert isinstance(result, str)
        # Should be valid base64
        decoded = base64.b64decode(result)
        assert decoded[:2] == b"\xff\xd8"


# =============================================================================
# Subscription Tests
# =============================================================================


class TestSubscriptionManagement:
    """Tests for camera subscription management."""

    @pytest.mark.asyncio
    async def test_subscribe_adds_to_subscriptions(
        self, camera_publisher: CameraPublisher
    ) -> None:
        """Should add camera to active subscriptions."""
        camera_id = "cam-001"
        robot_id = "robot-001"
        topic = "/camera/image"

        await camera_publisher.subscribe(camera_id, robot_id, topic, quality=75, max_fps=30)

        assert camera_id in camera_publisher.subscriptions
        assert camera_publisher.subscriptions[camera_id].quality == 75

    @pytest.mark.asyncio
    async def test_unsubscribe_removes_subscription(
        self, camera_publisher: CameraPublisher
    ) -> None:
        """Should remove camera from subscriptions."""
        camera_id = "cam-001"
        await camera_publisher.subscribe(camera_id, "robot-001", "/camera/image")

        await camera_publisher.unsubscribe(camera_id)

        assert camera_id not in camera_publisher.subscriptions

    @pytest.mark.asyncio
    async def test_unsubscribe_nonexistent_camera_no_error(
        self, camera_publisher: CameraPublisher
    ) -> None:
        """Should handle unsubscribe of non-existent camera gracefully."""
        await camera_publisher.unsubscribe("nonexistent-camera")
        # Should not raise

    def test_is_subscribed_returns_correct_status(
        self, camera_publisher: CameraPublisher
    ) -> None:
        """Should correctly report subscription status."""
        camera_publisher.subscriptions["cam-001"] = MagicMock()

        assert camera_publisher.is_subscribed("cam-001") is True
        assert camera_publisher.is_subscribed("cam-002") is False


# =============================================================================
# Frame Publishing Tests
# =============================================================================


class TestFramePublishing:
    """Tests for publishing video frames."""

    @pytest.mark.asyncio
    async def test_publish_frame_sends_message(
        self, camera_publisher: CameraPublisher, sample_image: np.ndarray, mock_ws_client: AsyncMock
    ) -> None:
        """Should send frame via WebSocket."""
        camera_id = "cam-001"
        await camera_publisher.subscribe(camera_id, "robot-001", "/camera/image")

        await camera_publisher.publish_frame(camera_id, sample_image)

        mock_ws_client.send.assert_called()

    @pytest.mark.asyncio
    async def test_publish_frame_includes_metadata(
        self, camera_publisher: CameraPublisher, sample_image: np.ndarray, mock_ws_client: AsyncMock
    ) -> None:
        """Should include frame metadata in message."""
        camera_id = "cam-001"
        await camera_publisher.subscribe(camera_id, "robot-001", "/camera/image")

        await camera_publisher.publish_frame(camera_id, sample_image)

        call_args = mock_ws_client.send.call_args[0][0]
        assert call_args["type"] == "video_frame"
        assert call_args["data"]["cameraId"] == camera_id
        assert call_args["data"]["width"] == 640
        assert call_args["data"]["height"] == 480
        assert call_args["data"]["format"] == "jpeg"

    @pytest.mark.asyncio
    async def test_publish_frame_increments_frame_number(
        self, camera_publisher: CameraPublisher, sample_image: np.ndarray, mock_ws_client: AsyncMock
    ) -> None:
        """Should increment frame number with each publish."""
        camera_id = "cam-001"
        # Set very high FPS to avoid rate limiting in test
        await camera_publisher.subscribe(camera_id, "robot-001", "/camera/image", max_fps=1000)

        await camera_publisher.publish_frame(camera_id, sample_image)
        first_call = mock_ws_client.send.call_args[0][0]
        first_frame_number = first_call["data"]["frameNumber"]

        # Reset rate limiting by setting last_frame_time to 0
        camera_publisher.subscriptions[camera_id].last_frame_time = 0

        await camera_publisher.publish_frame(camera_id, sample_image)
        second_call = mock_ws_client.send.call_args[0][0]
        second_frame_number = second_call["data"]["frameNumber"]

        assert second_frame_number > first_frame_number

    @pytest.mark.asyncio
    async def test_publish_frame_skipped_if_not_subscribed(
        self, camera_publisher: CameraPublisher, sample_image: np.ndarray, mock_ws_client: AsyncMock
    ) -> None:
        """Should not publish if camera not subscribed."""
        await camera_publisher.publish_frame("unknown-camera", sample_image)

        mock_ws_client.send.assert_not_called()


# =============================================================================
# Rate Limiting Tests
# =============================================================================


class TestRateLimiting:
    """Tests for FPS rate limiting."""

    @pytest.mark.asyncio
    async def test_respects_max_fps(
        self, camera_publisher: CameraPublisher, sample_image: np.ndarray, mock_ws_client: AsyncMock
    ) -> None:
        """Should limit frames to max_fps."""
        camera_id = "cam-001"
        await camera_publisher.subscribe(camera_id, "robot-001", "/camera/image", max_fps=10)

        # Publish many frames quickly
        for _ in range(20):
            await camera_publisher.publish_frame(camera_id, sample_image)

        # At 10 FPS, only ~1-2 frames should be sent in first iteration
        # (depending on timing)
        assert mock_ws_client.send.call_count <= 5

    @pytest.mark.asyncio
    async def test_should_publish_returns_true_after_interval(
        self, camera_publisher: CameraPublisher
    ) -> None:
        """Should allow publish after frame interval passes."""
        camera_id = "cam-001"
        await camera_publisher.subscribe(camera_id, "robot-001", "/camera/image", max_fps=1)

        # First frame always allowed
        assert camera_publisher._should_publish(camera_id) is True
        camera_publisher._update_last_frame_time(camera_id)

        # Immediately after, should be blocked
        assert camera_publisher._should_publish(camera_id) is False


# =============================================================================
# Quality Settings Tests
# =============================================================================


class TestQualitySettings:
    """Tests for JPEG quality settings."""

    @pytest.mark.asyncio
    async def test_uses_subscription_quality(
        self, camera_publisher: CameraPublisher, sample_image: np.ndarray
    ) -> None:
        """Should use quality from subscription."""
        camera_id = "cam-001"
        await camera_publisher.subscribe(camera_id, "robot-001", "/camera/image", quality=50)

        subscription = camera_publisher.subscriptions[camera_id]
        assert subscription.quality == 50

    @pytest.mark.asyncio
    async def test_default_quality_is_75(
        self, camera_publisher: CameraPublisher
    ) -> None:
        """Default quality should be 75."""
        camera_id = "cam-001"
        await camera_publisher.subscribe(camera_id, "robot-001", "/camera/image")

        subscription = camera_publisher.subscriptions[camera_id]
        assert subscription.quality == 75
