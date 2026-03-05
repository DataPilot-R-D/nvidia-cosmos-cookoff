# Video Streaming Fix Plan

Created: 2026-02-10
Status: **DRAFT - Awaiting approval**

## Executive Summary

The operator video stream is broken because **go2rtc has no stream sources configured** and the **WebRTC UDP port is firewalled**. All viewers are forced into the slow WebSocket JPEG fallback path (15 FPS, 640x360, 70% JPEG quality). Additionally, the camera publishes at only ~17 Hz instead of the target 60 FPS.

This plan fixes the entire pipeline end-to-end:
1. Bridge ROS camera frames to go2rtc via FFmpeg NVENC
2. Fix networking (UDP port)
3. Increase camera FPS to 60
4. Validate from external browsers

## Current State (Diagnosed 2026-02-10)

| Component | Status | Problem |
|-----------|--------|---------|
| go2rtc v1.9.14 | Running, **0 streams** | `streams:` section missing from config |
| NVIDIA L4 GPU | 33% util, **0 NVENC sessions** | Not used for video encoding |
| Camera `/robot0/front_cam/rgb` | 1280x720, rgb8, ~17 Hz | Below 30/60 FPS target |
| Compressed image topics | **None exist** | No `/compressed` ROS topic |
| Security Group UDP | Only 10000-20000 open | go2rtc WebRTC port 8555 is **blocked** |
| Dashboard fallback | WebSocket JPEG | Always in fallback mode (go2rtc has nothing to serve) |
| VNC/DCV viewing | Double-encoding | Makes everything look worse than it is |

## Architecture (Target)

```
Isaac Sim Camera (60 FPS, 1280x720, rgb8)
    |
    v
ROS2 Topic: /robot0/front_cam/rgb
    |
    v
ros2_to_rtsp.py (Python ROS2 subscriber)
    |  pipes raw frames to ffmpeg stdin
    v
FFmpeg (h264_nvenc, NVIDIA L4 GPU)
    |  RTSP push
    v
go2rtc (rtsp://127.0.0.1:8554/robot0_camera)
    |  WebRTC fan-out (single encode, many viewers)
    v
Browser 1, Browser 2, ... Browser 6
    (hardware H.264 decode, <video> element)
```

Benefits:
- **Single GPU encode** for all viewers (not per-viewer JPEG conversion)
- **Hardware decode** in browsers (WebRTC + H.264)
- **~50ms latency** (vs ~150ms+ in fallback)
- **Full resolution** (1280x720 or higher) at target FPS
- **No CPU bottleneck** (NVENC offloads encoding to GPU)

---

## Phase 0: Fix go2rtc Networking (5 min)

### Problem
go2rtc WebRTC listens on UDP 8555, but the Security Group only allows UDP 10000-20000.

### Option A: Change go2rtc to use port 10000 (Recommended)
Edit `/opt/go2rtc/go2rtc.yaml`:
```yaml
webrtc:
  listen: ":10000"        # Was :8555, now in allowed UDP range
  ice_lite: true
  candidates:
    - "63.182.177.92:10000"  # Public IP + new port
    - "stun:stun.l.google.com:19302"
    - "stun:stun1.l.google.com:19302"
  audio: false
  video_codecs: [H264]
```

### Option B: Open UDP 8555 in Security Group
```bash
aws ec2 authorize-security-group-ingress \
  --region eu-central-1 \
  --group-id sg-0fd741f3ed3a5df90 \
  --ip-permissions '[{"IpProtocol":"udp","FromPort":8555,"ToPort":8555,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"go2rtc WebRTC"}]}]'
```

### Validation
```bash
# From external machine:
nc -zuv 63.182.177.92 10000   # (or 8555 if Option B)
```

---

## Phase 1: Create ROS-to-RTSP Bridge via FFmpeg NVENC (30 min)

### 1.1 Create the bridge script

Create `/home/ubuntu/ros2_to_rtsp.py`:

```python
#!/usr/bin/env python3
"""
Bridge: ROS2 camera topic -> FFmpeg NVENC -> RTSP -> go2rtc -> WebRTC

Subscribes to a ROS2 Image topic (raw rgb8), pipes frames to ffmpeg
which encodes with h264_nvenc (GPU) and pushes to go2rtc's RTSP server.
"""

import subprocess
import sys
import signal

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy
from sensor_msgs.msg import Image


class CameraToRTSP(Node):
    def __init__(self):
        super().__init__('camera_to_rtsp')

        # Parameters
        self.declare_parameter('topic', '/robot0/front_cam/rgb')
        self.declare_parameter('width', 1280)
        self.declare_parameter('height', 720)
        self.declare_parameter('fps', 30)
        self.declare_parameter('bitrate', '4M')
        self.declare_parameter('rtsp_url', 'rtsp://127.0.0.1:8554/robot0_camera')
        self.declare_parameter('preset', 'p4')       # p1=fastest, p7=best quality
        self.declare_parameter('gpu', '0')

        topic = self.get_parameter('topic').value
        self.width = self.get_parameter('width').value
        self.height = self.get_parameter('height').value
        fps = self.get_parameter('fps').value
        bitrate = self.get_parameter('bitrate').value
        rtsp_url = self.get_parameter('rtsp_url').value
        preset = self.get_parameter('preset').value
        gpu = self.get_parameter('gpu').value

        self.expected_frame_size = self.width * self.height * 3  # rgb8

        # FFmpeg command: raw RGB input -> NVENC H.264 -> RTSP output
        ffmpeg_cmd = [
            'ffmpeg',
            '-hide_banner',
            '-loglevel', 'warning',
            # Input: raw RGB frames from stdin
            '-f', 'rawvideo',
            '-pix_fmt', 'rgb24',
            '-s', f'{self.width}x{self.height}',
            '-r', str(fps),
            '-i', 'pipe:0',
            # Encoder: NVIDIA NVENC H.264
            '-c:v', 'h264_nvenc',
            '-gpu', gpu,
            '-preset', preset,
            '-tune', 'll',              # Low latency
            '-zerolatency', '1',        # No reordering delay
            '-rc', 'cbr',               # Constant bitrate (stable for WebRTC)
            '-b:v', bitrate,
            '-maxrate', bitrate,
            '-bufsize', bitrate,         # 1-second buffer
            '-profile:v', 'main',
            '-level', '4.1',
            '-g', str(fps * 2),         # Keyframe every 2 seconds
            '-bf', '0',                  # No B-frames (lower latency)
            # Output: RTSP push to go2rtc
            '-f', 'rtsp',
            '-rtsp_transport', 'tcp',
            rtsp_url,
        ]

        self.get_logger().info(f'Starting FFmpeg: {" ".join(ffmpeg_cmd)}')
        self.ffmpeg_proc = subprocess.Popen(
            ffmpeg_cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

        # Subscribe to camera topic
        qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=1,
        )
        self.subscription = self.create_subscription(
            Image, topic, self.image_callback, qos
        )

        self.frame_count = 0
        self.get_logger().info(
            f'Bridge started: {topic} ({self.width}x{self.height}) '
            f'-> NVENC H.264 @ {bitrate} -> {rtsp_url}'
        )

    def image_callback(self, msg: Image):
        if self.ffmpeg_proc.poll() is not None:
            self.get_logger().error('FFmpeg process died!')
            return

        # Validate frame size
        raw_data = bytes(msg.data)
        if len(raw_data) != self.expected_frame_size:
            self.get_logger().warn(
                f'Frame size mismatch: got {len(raw_data)}, '
                f'expected {self.expected_frame_size}'
            )
            return

        try:
            self.ffmpeg_proc.stdin.write(raw_data)
            self.ffmpeg_proc.stdin.flush()
            self.frame_count += 1
            if self.frame_count % 300 == 0:  # Log every ~10s at 30fps
                self.get_logger().info(f'Frames sent: {self.frame_count}')
        except (BrokenPipeError, IOError) as e:
            self.get_logger().error(f'FFmpeg pipe broken: {e}')

    def destroy_node(self):
        if self.ffmpeg_proc and self.ffmpeg_proc.poll() is None:
            self.ffmpeg_proc.stdin.close()
            self.ffmpeg_proc.terminate()
            self.ffmpeg_proc.wait(timeout=5)
        super().destroy_node()


def main():
    rclpy.init()
    node = CameraToRTSP()

    def signal_handler(sig, frame):
        node.get_logger().info('Shutting down...')
        node.destroy_node()
        rclpy.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
```

### 1.2 Update go2rtc config

Edit `/opt/go2rtc/go2rtc.yaml` to add stream source:

```yaml
# go2rtc configuration for PAIC2
streams:
  robot0_camera:
    - rtsp://127.0.0.1:8554/robot0_camera

webrtc:
  listen: ":10000"
  ice_lite: true
  candidates:
    - "63.182.177.92:10000"
    - "stun:stun.l.google.com:19302"
    - "stun:stun1.l.google.com:19302"
  audio: false
  video_codecs: [H264]

api:
  listen: ":1984"
  origin: "*"

rtsp:
  listen: ":8554"
  default_query: "video"

log:
  level: info
```

### 1.3 Restart and verify

```bash
# Restart go2rtc
sudo systemctl restart go2rtc  # or: sudo kill -HUP $(pgrep go2rtc)

# Start the bridge
source /opt/ros/humble/setup.bash
python3 /home/ubuntu/ros2_to_rtsp.py

# Verify stream exists in go2rtc
curl -s http://localhost:1984/api/streams | python3 -m json.tool
# Expected: robot0_camera stream with active producer

# Verify NVENC is being used
nvidia-smi  # Should show encoder session count > 0
```

### Validation
- `curl http://localhost:1984/api/streams` shows `robot0_camera` with `medias` populated
- `nvidia-smi` shows NVENC encoder session count >= 1
- Bridge logs show frames being sent

---

## Phase 2: Increase Camera FPS to 60 (15 min)

### Current State
- `update_period=0.033` (30 FPS target) in `/home/ubuntu/go2_omniverse/ros2.py`
- Actual publish rate: ~17 Hz (simulation can't keep up)

### Root Cause Investigation
The simulation publishes at ~17 Hz despite a 30 FPS target. Possible reasons:
1. Simulation real-time factor < 1.0
2. GPU rendering can't keep up with other render products (lidar, physics)
3. Isaac Sim rendering pipeline overhead

### Step 2.1: Check simulation real-time factor
```bash
# On isaac-sim-1, check if sim is running slower than real-time
source /opt/ros/humble/setup.bash
ros2 topic echo /clock --once  # Check sim time progression
```

### Step 2.2: Try 60 FPS with current resolution
Edit `/home/ubuntu/go2_omniverse/ros2.py`:
```python
update_period=0.0167,  # 60 FPS (1/60)
```

Monitor impact:
```bash
# GPU utilization
watch -n1 nvidia-smi

# Camera FPS
ros2 topic hz /robot0/front_cam/rgb --window 30
```

### Step 2.3: If 60 FPS fails at 1280x720, reduce resolution

Try these resolution/FPS combinations:

| Resolution | update_period | Target FPS | Raw frame size |
|------------|--------------|------------|----------------|
| 1280x720   | 0.0167       | 60         | 2.6 MB |
| 960x540    | 0.0167       | 60         | 1.5 MB |
| 640x480    | 0.0167       | 60         | 0.9 MB |
| 640x360    | 0.0167       | 60         | 0.7 MB |

In `/home/ubuntu/go2_omniverse/ros2.py`, change `add_camera()`:
```python
cameraCfg = CameraCfg(
    prim_path=f"/World/envs/env_{i}/Robot/base/front_cam",
    update_period=0.0167,   # 60 FPS
    height=540,             # Reduced from 720
    width=960,              # Reduced from 1280
    ...
)
```

**After any change**: restart the simulation (`main.py`) for changes to take effect.

### Step 2.4: Adjust FFmpeg bridge parameters
Update `/home/ubuntu/ros2_to_rtsp.py` parameters to match new resolution/FPS:
```bash
python3 /home/ubuntu/ros2_to_rtsp.py --ros-args \
  -p width:=960 -p height:=540 -p fps:=60 -p bitrate:=6M
```

### FFmpeg NVENC Bitrate Guidelines for WebRTC

| Resolution | FPS | Recommended bitrate | NVENC load (L4) |
|------------|-----|---------------------|-----------------|
| 1280x720   | 30  | 4 Mbps              | ~5%            |
| 1280x720   | 60  | 6 Mbps              | ~8%            |
| 960x540    | 60  | 4 Mbps              | ~5%            |
| 640x480    | 60  | 3 Mbps              | ~3%            |

### Validation
```bash
ros2 topic hz /robot0/front_cam/rgb --window 30
# Target: ~60 consistently

nvidia-smi --query-gpu=encoder.stats.sessionCount,encoder.stats.averageFps --format=csv,noheader
# Target: 1 session, ~60 FPS
```

---

## Phase 3: Update PAIC2 Dashboard Configuration (10 min)

### 3.1 Update go2rtc client URL (if port changed)

If go2rtc WebRTC moved to port 10000, update the environment variable:
```bash
# In the websocket-server .env or docker-compose:
GO2RTC_URL=http://localhost:1984  # API port stays the same
```

The API port (1984) stays the same; only the WebRTC UDP port (for browsers) changed.

### 3.2 Verify camera-to-stream mapping

The go2rtc client in the dashboard maps camera IDs to stream names. Verify the mapping matches:

In `Dashboard_Robotics/apps/websocket-server/src/services/go2rtc-client.ts`:
```typescript
// These mappings must match the go2rtc stream name "robot0_camera"
'robot0-front-cam'    -> 'robot0_camera'  // OK
'robot0-front_cam-rgb' -> 'robot0_camera'  // OK
```

### 3.3 Raise fallback FPS cap (optional safety net)

If fallback is still needed as a safety net, consider raising from 15 to 30 FPS:

In `Dashboard_Robotics/apps/websocket-server/src/handlers/rosbridge/types.ts`:
```typescript
targetVideoFps: 30,  // Was 15
```

---

## Phase 4: Validate End-to-End (15 min)

### 4.1 Test from laptop browser (NOT VNC/DCV)

1. Open `http://63.182.177.92:<dashboard-port>` from your laptop browser
2. Select the robot camera in the dashboard
3. Verify the stream connects via WebRTC (not fallback)

### 4.2 Check WebRTC internals

In Chrome on your laptop:
1. Open `chrome://webrtc-internals`
2. Confirm active PeerConnection
3. Check inbound video stats:
   - `framesPerSecond` should match target (30 or 60)
   - `bytesReceived` should be growing steadily
   - `codec` should show H264

### 4.3 Verify on the dashboard UI

- `useCameraStream` should report `activeMode === 'webrtc'`
- `isFallback` should be `false`
- FPS counter should show ~30 or ~60

### 4.4 Multi-viewer test

Open the dashboard in 3-5 browser tabs simultaneously:
```bash
# Monitor server-side during multi-viewer test:
nvidia-smi -l 2  # GPU should show 1 NVENC session (not N)
htop              # CPU should remain modest
```

### 4.5 Sustained stability test

Keep the stream running for 30 minutes:
- No periodic stalls
- No FPS drops
- No memory leaks (monitor ffmpeg RSS)

---

## Phase 5: Productionize (Later)

### 5.1 Create systemd service for the bridge

```ini
# /etc/systemd/system/ros2-to-rtsp.service
[Unit]
Description=ROS2 Camera to RTSP Bridge (NVENC)
After=network.target

[Service]
Type=simple
User=ubuntu
Environment=ROS_DOMAIN_ID=0
ExecStart=/bin/bash -c 'source /opt/ros/humble/setup.bash && python3 /home/ubuntu/ros2_to_rtsp.py'
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 5.2 Add TURN server for restrictive NATs

For viewers behind corporate firewalls:
```yaml
# go2rtc.yaml addition:
webrtc:
  candidates:
    - "63.182.177.92:10000"
    - "stun:stun.l.google.com:19302"
    # Add TURN for fallback:
    # - "turn:username:password@turn-server:3478"
```

### 5.3 Monitor and alert

- Add go2rtc health check to the operational snapshot script
- Monitor NVENC session count (should be >= 1 when bridge is running)
- Alert on FFmpeg process crash

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| FFmpeg pipe breaks | Stream stops | systemd auto-restart, fallback to WebSocket |
| 60 FPS overloads GPU | FPS drops | Reduce to 30 FPS or lower resolution |
| NVENC sessions exhausted | New viewers fail | L4 supports many sessions; monitor |
| UDP 10000 conflicts | WebRTC fails | Can use any port in 10000-20000 range |
| Sim can't hit 60 FPS | ~17 Hz persists | Reduce resolution first, then rendering quality |

## Quick Rollback

If anything goes wrong:
1. Kill the bridge: `pkill -f ros2_to_rtsp.py`
2. The dashboard automatically falls back to WebSocket JPEG mode
3. Restore original go2rtc.yaml: remove `streams:` section, change port back to 8555
4. Restart go2rtc: `sudo kill -HUP $(pgrep go2rtc)`

---

## Dependencies

- [x] SSH access to isaac-sim-1 (verified)
- [x] FFmpeg with NVENC (verified: h264_nvenc available)
- [x] go2rtc running (verified: v1.9.14, PID 29449)
- [x] ROS2 Humble (verified)
- [x] Camera topic publishing (verified: ~17 Hz, 1280x720, rgb8)
- [ ] AWS CLI on local machine (for security group changes)
- [ ] Laptop browser access to dashboard (for validation)
