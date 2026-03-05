from sras_streaming_bridge.streaming_core import (
    DEFAULT_STREAMS,
    StreamConfig,
    build_ffmpeg_command,
    compute_frame_stats,
    stream_status_to_json,
    validate_stream_config,
)


def test_default_streams_count() -> None:
    assert len(DEFAULT_STREAMS) == 2


def test_validate_stream_config_valid() -> None:
    valid, reason = validate_stream_config(StreamConfig(stream_id="s0", image_topic="/cam"))
    assert valid is True
    assert reason == "ok"


def test_validate_stream_config_invalid_fps() -> None:
    valid, _ = validate_stream_config(StreamConfig(stream_id="s0", image_topic="/cam", fps=0))
    assert valid is False


def test_validate_stream_config_invalid_dimensions() -> None:
    valid, _ = validate_stream_config(StreamConfig(stream_id="s0", image_topic="/cam", width=0, height=480))
    assert valid is False


def test_build_ffmpeg_command_contains_rtsp_url() -> None:
    rtsp_url = "rtsp://localhost:8554/front_camera"
    cmd = build_ffmpeg_command(StreamConfig(stream_id="front_camera", image_topic="/cam"), rtsp_url)
    assert rtsp_url in cmd


def test_build_ffmpeg_command_contains_resolution() -> None:
    cmd = build_ffmpeg_command(
        StreamConfig(stream_id="front_camera", image_topic="/cam", width=1280, height=720),
        "rtsp://localhost:8554/front_camera",
    )
    assert "1280x720" in cmd


def test_build_ffmpeg_command_encoding() -> None:
    cmd = build_ffmpeg_command(
        StreamConfig(stream_id="front_camera", image_topic="/cam", encoding="h264"),
        "rtsp://localhost:8554/front_camera",
    )
    idx = cmd.index("-c:v")
    assert cmd[idx + 1] == "libx264"


def test_compute_frame_stats() -> None:
    stats = compute_frame_stats(sent=5, dropped=2, last_s=123.4, latencies=[0.1, 0.2, 0.3])
    assert stats.frames_sent == 5
    assert stats.frames_dropped == 2
    assert stats.last_frame_s == 123.4
    assert round(stats.avg_latency_ms, 2) == 200.0


def test_stream_status_to_json() -> None:
    stats = compute_frame_stats(sent=1, dropped=0, last_s=10.0, latencies=[0.05])
    stats.stream_id = "front_camera"
    payload = stream_status_to_json([stats])
    assert "front_camera" in payload
    assert "frames_sent" in payload


def test_stream_config_defaults() -> None:
    cfg = StreamConfig(stream_id="stream_a", image_topic="/camera/a")
    assert cfg.fps == 15
    assert cfg.width == 640
    assert cfg.height == 480
    assert cfg.encoding == "h264"
    assert cfg.rtsp_path == ""
