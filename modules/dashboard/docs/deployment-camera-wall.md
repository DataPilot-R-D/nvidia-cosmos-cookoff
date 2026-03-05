# Camera Wall Deployment Checklist

## Prerequisites

- [ ] Node.js 22+, pnpm, Bun runtime
- [ ] go2rtc binary (auto-downloaded by Docker setup or manual)
- [ ] FFmpeg with H.264 support (NVENC for GPU, libx264 for CPU)
- [ ] MediaMTX RTSP server (auto-downloaded by `run_rtsp_exporter.sh`)
- [ ] ROS2 Humble (for Isaac Sim camera topics)

## Step-by-Step Deployment

### 1. Start go2rtc (RTSP→WebRTC gateway)

```bash
cd /srv/robot-dashboard/repo
docker compose -f docker/docker-compose.camera.yml up -d go2rtc
# Verify: curl http://localhost:1984/api
```

Or standalone:

```bash
./infra/go2rtc/go2rtc -config infra/go2rtc/go2rtc.yaml
```

**Health check:** `http://<host>:1984/api` should return JSON.

### 2. Start RTSP Exporter (Isaac Sim → RTSP)

On the AWS instance (`operator@63.182.177.92`):

```bash
cd go2_omniverse/rtsp_exporter
./run_rtsp_exporter.sh
```

This will:

- Download MediaMTX if not present
- Start MediaMTX on port 8554
- Launch `ros2_rtsp_bridge.py` subscribing to Isaac Sim camera topics
- Encode to H.264 via NVENC (or libx264 fallback)

**Verify streams:**

```bash
ffprobe rtsp://127.0.0.1:8554/warehouse-entrance
```

### 3. Configure go2rtc Sources

In `infra/go2rtc/go2rtc.yaml`, point to RTSP streams:

```yaml
streams:
  warehouse-entrance:
    - rtsp://63.182.177.92:8554/warehouse-entrance
  warehouse-overview:
    - rtsp://63.182.177.92:8554/warehouse-overview
```

### 4. Start WebSocket Server

```bash
cd apps/websocket-server
setsid bun src/index.ts </dev/null >/tmp/ws-server.log 2>&1 & disown -a
# Verify: ss -tlnp | grep 8081
```

### 5. Start Frontend

```bash
cd apps/web-client
pnpm build
setsid node_modules/.bin/next start -p 3002 -H 0.0.0.0 </dev/null >/tmp/frontend.log 2>&1 & disown -a
# Verify: curl http://localhost:3002
```

### 6. Verify End-to-End

1. Open Dashboard at `http://<host>:3002`
2. Camera Wall widget should show discovered cameras
3. Click a camera tile → should attempt WebRTC connection
4. Check HealthIndicator (bottom-right) for system status

## Troubleshooting

| Issue                          | Fix                                                       |
| ------------------------------ | --------------------------------------------------------- |
| "No cameras" in Camera Wall    | Check WS server is running, go2rtc has sources configured |
| WebRTC fails, falls back to WS | Verify go2rtc is reachable from browser (port 1984)       |
| Black video tiles              | Check RTSP exporter is receiving ROS2 frames              |
| "Max 4 streams"                | Deselect a camera before adding new one                   |
| go2rtc offline in Health panel | Check go2rtc container/process, port 1984                 |
| High latency                   | Check NVENC is being used (not libx264), reduce bitrate   |

## E2E Test Scenarios

### Scenario 1: Basic Stream Verification

1. Start Isaac Sim with warehouse scene (4 CCTV cameras)
2. Start RTSP exporter → verify 4 RTSP streams on :8554
3. Start go2rtc → verify streams appear in go2rtc UI (:1984)
4. Open Dashboard → Camera Wall should show 4 tiles with LIVE status

### Scenario 2: WebRTC Fallback

1. Stop go2rtc while streaming
2. Camera Wall should show "CONNECTING" → "FALLBACK" status
3. Frames should continue via WebSocket (lower quality)
4. Restart go2rtc → tiles should auto-reconnect to WebRTC

### Scenario 3: Guardrail Enforcement

1. Select 4 cameras in Camera Wall
2. Try to add 5th camera → should show "Max 4 streams" or be disabled
3. Deselect one camera → 5th slot should become available
4. Stream counter in toolbar should update in real-time

### Scenario 4: Camera Hot-Plug

1. Start with 2 cameras streaming
2. Start 2 more RTSP streams on the exporter
3. Dashboard should discover new cameras via WS events or polling
4. New cameras should appear in CameraSourcePicker

### Scenario 5: RBAC Gating

1. Log in as viewer role
2. Camera Wall should be view-only (no source changes)
3. Log in as operator → full control
4. E-STOP should always be available for operator/admin
