# Isaac → RTSP Exporter

Standalone process that captures camera frames from Isaac Sim (via ROSBridge WebSocket)
and publishes them as H.264 RTSP streams using GStreamer + NVENC.

## Architecture

```
Isaac Sim → ROSBridge (ws://host:9090) → exporter → GStreamer NVENC → RTSP Server (:8557)
                                                                         ↓
                                                              go2rtc (:8554) consumes
                                                                         ↓
                                                              WebRTC to dashboard
```

## Requirements

- Python 3.10+
- GStreamer 1.20+ with NVENC plugins (`gstreamer1.0-plugins-bad` for `nvh264enc`)
- NVIDIA GPU with NVENC support (L4, RTX, etc.)
- ROSBridge running on Isaac Sim host

## Quick Start

```bash
pip install -r requirements.txt
python exporter.py --rosbridge ws://100.76.147.31:9090 --port 8557
```

## Configuration

Environment variables or CLI args:

| Variable            | CLI                   | Default               | Description                            |
| ------------------- | --------------------- | --------------------- | -------------------------------------- |
| `ROSBRIDGE_URL`     | `--rosbridge`         | `ws://localhost:9090` | ROSBridge WebSocket URL                |
| `RTSP_PORT`         | `--port`              | `8557`                | RTSP server listen port                |
| `RESOLUTION`        | `--resolution`        | `1280x720`            | Output resolution                      |
| `FPS`               | `--fps`               | `15`                  | Target framerate                       |
| `KEYFRAME_INTERVAL` | `--keyframe-interval` | `15`                  | Keyframe every N frames (~1s at 15fps) |

## Streams

Default streams (configurable via `streams.yaml`):

| RTSP Path         | ROS Topic                           | Description            |
| ----------------- | ----------------------------------- | ---------------------- |
| `/isaac/entrance` | `/sim/warehouse/entrance/image_raw` | Warehouse entrance cam |
| `/isaac/dock`     | `/sim/warehouse/dock/image_raw`     | Loading dock cam       |
