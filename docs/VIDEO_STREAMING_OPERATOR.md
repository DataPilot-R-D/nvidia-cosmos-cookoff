# Operator Video Streaming (Isaac Sim / Go2 -> PAIC2 Dashboard)

Last verified: 2026-02-10

## Architecture

```
Isaac Sim Camera (1280x720, rgb8, ~17 Hz)
    |
    v
ROS2 Topic: /robot0/front_cam/rgb
    |
    v
ros2_to_rtsp.py (Python ROS2 subscriber)
    |  pipes raw frames to ffmpeg stdin
    v
FFmpeg (h264_nvenc, NVIDIA L4 GPU, ~5% GPU load)
    |  RTSP push (tcp)
    v
go2rtc (rtsp://127.0.0.1:8554/robot0_camera)
    |  WebRTC fan-out (single encode, many viewers)
    |  Port: UDP 10000 (ICE lite)
    v
Browser 1..6 (hardware H.264 decode, <video> element)
```

### Why this architecture

- **Single GPU encode** for all viewers (no per-viewer JPEG conversion)
- **Hardware decode** in browsers (WebRTC + H.264)
- **~50ms latency** (vs ~150ms+ in WebSocket fallback)
- **Full resolution** at source FPS
- **Low CPU** (NVENC offloads encoding to L4 GPU)

## Goal

- Target FPS: 30-60 (limited by simulation publish rate)
- Resolution: 1280x720 (can reduce for higher FPS)
- Viewers: up to 5-6 concurrent
- Encoding: NVENC H.264 on L4 GPU
- Delivery: WebRTC via go2rtc

## Key Finding (Important)

Viewing the PAIC2 dashboard inside **VNC on the EC2 instance** is not a reliable way to judge camera FPS/latency.

VNC re-encodes the entire desktop, adding its own compression and frame drops. Even if the camera stream is perfect, VNC makes it look choppy.

**Always validate from a browser on your laptop directly.**

## Components

### Source Camera (Isaac Sim)

On `isaac-sim-1`:

- ROS2 topic: `/robot0/front_cam/rgb`
- Type: `sensor_msgs/msg/Image`
- Encoding: `rgb8`
- Resolution: `1280x720`
- Publish rate: ~17 Hz (update_period=0.033 in ros2.py)
- Config: `/home/ubuntu/go2_omniverse/ros2.py` -> `add_camera()` -> `update_period`

Throttled topic (for VLM/memory, NOT for operator view):
- `/robot0/front_cam/rgb_throttled` at 2 Hz

### ROS-to-RTSP Bridge (`ros2_to_rtsp.py`)

Location: `/home/ubuntu/ros2_to_rtsp.py` (server), `Dashboard_Robotics/scripts/ros2_to_rtsp.py` (repo)

Subscribes to the raw camera topic and pipes frames to FFmpeg NVENC, which pushes H.264 RTSP to go2rtc.

Start:
```bash
source /opt/ros/humble/setup.bash
python3 /home/ubuntu/ros2_to_rtsp.py
```

Custom parameters:
```bash
python3 /home/ubuntu/ros2_to_rtsp.py --ros-args \
  -p topic:=/robot0/front_cam/rgb \
  -p width:=1280 -p height:=720 \
  -p fps:=30 -p bitrate:=4M \
  -p rtsp_url:=rtsp://127.0.0.1:8554/robot0_camera
```

Runs in tmux session `ros2_bridge`:
```bash
tmux attach -t ros2_bridge
```

### go2rtc

Config: `/opt/go2rtc/go2rtc.yaml` (server), `Dashboard_Robotics/config/go2rtc.yaml` (repo)

Key settings:
- API: port `1984` (used by dashboard backend for signaling)
- RTSP: port `8554` (used by bridge to push RTSP)
- WebRTC: port `10000` (UDP, used by browsers for media)
- ICE candidates: `63.182.177.92:10000` + Google STUN
- Stream: `robot0_camera` sourced from `rtsp://127.0.0.1:8554/robot0_camera`

Restart:
```bash
sudo kill $(pgrep go2rtc)
sudo /opt/go2rtc/go2rtc -config /opt/go2rtc/go2rtc.yaml -d
```

### PAIC2 Dashboard

- Frontend WebRTC: `apps/web-client/lib/hooks/use-camera-stream.ts`, `use-webrtc.ts`
- Backend signaling: `apps/websocket-server/src/handlers/webrtc.ts`
- go2rtc client: `apps/websocket-server/src/services/go2rtc-client.ts`
- Fallback pipeline: `apps/websocket-server/src/handlers/rosbridge/client.ts`
- Fallback FPS cap: `apps/websocket-server/src/handlers/rosbridge/types.ts` (`targetVideoFps: 30`)

Camera-to-stream mapping in go2rtc-client.ts:
```
robot0-front-cam    -> robot0_camera
robot0-front_cam-rgb -> robot0_camera
robot0_front_cam    -> robot0_camera
```

## Networking

### Security Group (`isaac-sim-1-sg`)

Required ports:

| Port | Protocol | Direction | Purpose |
|------|----------|-----------|---------|
| 1984 | TCP | Internal | go2rtc API (dashboard backend) |
| 8554 | TCP | Internal | go2rtc RTSP (bridge -> go2rtc) |
| 10000 | UDP | **Inbound 0.0.0.0/0** | go2rtc WebRTC media (browsers) |
| 9090 | TCP | Internal | rosbridge WebSocket |
| 8080 | TCP | Inbound | Dashboard WebSocket server |

UDP 10000 is within the existing allowed range (10000-20000).

### ICE / NAT traversal

go2rtc uses ICE lite with:
- Direct candidate: `63.182.177.92:10000`
- STUN fallback: `stun.l.google.com:19302`

For viewers behind restrictive corporate NATs, a TURN server may be needed (not yet configured).

## Quick Diagnostic Checklist

### Check if go2rtc has the stream
```bash
curl -s http://localhost:1984/api/streams | python3 -m json.tool
```
Expected: `robot0_camera` with `medias: ["video, recvonly, H264"]`

### Check NVENC is encoding
```bash
nvidia-smi --query-gpu=encoder.stats.sessionCount,encoder.stats.averageFps --format=csv,noheader
```
Expected: `1, 15` (or higher FPS if camera rate increased)

### Check camera FPS
```bash
source /opt/ros/humble/setup.bash
ros2 topic hz /robot0/front_cam/rgb --window 20
```

### Check bridge is running
```bash
tmux ls | grep ros2_bridge
tail -20 /tmp/ros2_to_rtsp.log
```

### Categorize an issue

| Symptom | Cause | Fix |
|---------|-------|-----|
| Bad video only in VNC/DCV | VNC re-encoding | Test from laptop browser |
| Dashboard shows `websocket_fallback` | go2rtc has no stream or bridge not running | Start bridge, check go2rtc |
| WebRTC connected but 15 FPS | Camera publish rate ~17 Hz | Increase `update_period` in Isaac Sim |
| WebRTC fails from laptops | UDP 10000 blocked or ICE issue | Check security group, check ICE candidates |
| NVENC session count = 0 | Bridge not running | Start `ros2_to_rtsp.py` |

## Changing Camera FPS

To increase from ~17 Hz toward 60 FPS:

1. Edit `/home/ubuntu/go2_omniverse/ros2.py`, function `add_camera()`:
   ```python
   update_period=0.0167,  # 60 FPS (1/60)
   ```

2. Restart the simulation (requires stopping and restarting `main.py`)

3. Update bridge parameters to match:
   ```bash
   python3 /home/ubuntu/ros2_to_rtsp.py --ros-args -p fps:=60 -p bitrate:=6M
   ```

4. If GPU can't sustain 60 FPS at 1280x720, reduce resolution:
   ```python
   height=540, width=960,  # or 640x360
   ```

## FFmpeg NVENC Bitrate Guide

| Resolution | FPS | Bitrate | NVENC load (L4) |
|------------|-----|---------|-----------------|
| 1280x720   | 30  | 4 Mbps  | ~5%            |
| 1280x720   | 60  | 6 Mbps  | ~8%            |
| 960x540    | 60  | 4 Mbps  | ~5%            |
| 640x480    | 60  | 3 Mbps  | ~3%            |
