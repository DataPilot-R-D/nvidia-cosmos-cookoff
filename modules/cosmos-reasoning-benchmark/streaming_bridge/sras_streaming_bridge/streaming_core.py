from __future__ import annotations

import json
from dataclasses import asdict, dataclass


@dataclass(slots=True)
class StreamConfig:
    stream_id: str
    image_topic: str
    fps: int = 15
    width: int = 640
    height: int = 480
    encoding: str = "h264"
    rtsp_path: str = ""


DEFAULT_STREAMS: list[StreamConfig] = [
    StreamConfig(
        stream_id="front_camera",
        image_topic="/camera/front/image_raw",
        rtsp_path="front_camera",
    ),
    StreamConfig(
        stream_id="rear_camera",
        image_topic="/camera/rear/image_raw",
        rtsp_path="rear_camera",
    ),
]


@dataclass(slots=True)
class FrameStats:
    stream_id: str
    frames_sent: int
    frames_dropped: int
    last_frame_s: float
    avg_latency_ms: float


def validate_stream_config(config: StreamConfig) -> tuple[bool, str]:
    if config.fps < 1 or config.fps > 60:
        return False, "fps must be in range [1, 60]"
    if config.width <= 0 or config.height <= 0:
        return False, "width and height must be > 0"
    return True, "ok"


def _encoder_for(encoding: str) -> str:
    lowered = (encoding or "").lower()
    if lowered == "h265":
        return "libx265"
    return "libx264"


def build_ffmpeg_command(config: StreamConfig, rtsp_url: str) -> list[str]:
    encoder = _encoder_for(config.encoding)
    return [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-nostdin",
        "-f",
        "rawvideo",
        "-pixel_format",
        "bgr24",
        "-video_size",
        f"{config.width}x{config.height}",
        "-framerate",
        str(config.fps),
        "-i",
        "-",
        "-an",
        "-c:v",
        encoder,
        "-preset",
        "veryfast",
        "-tune",
        "zerolatency",
        "-pix_fmt",
        "yuv420p",
        "-f",
        "rtsp",
        "-rtsp_transport",
        "tcp",
        rtsp_url,
    ]


def compute_frame_stats(sent: int, dropped: int, last_s: float, latencies: list[float]) -> FrameStats:
    avg_latency_ms = (sum(latencies) / len(latencies) * 1000.0) if latencies else 0.0
    return FrameStats(
        stream_id="",
        frames_sent=sent,
        frames_dropped=dropped,
        last_frame_s=last_s,
        avg_latency_ms=avg_latency_ms,
    )


def stream_status_to_json(stats: list[FrameStats]) -> str:
    return json.dumps([asdict(item) for item in stats], sort_keys=True)
