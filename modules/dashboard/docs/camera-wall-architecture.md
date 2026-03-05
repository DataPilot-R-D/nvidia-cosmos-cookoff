# Camera Wall Architecture

## Overview

The Camera Wall is a SOC-style multi-camera viewer widget that displays up to 4 concurrent video feeds. It supports WebRTC (low-latency) and WebSocket fallback streaming modes.

## Pipeline

```
Isaac Sim → ROS2 Topics → ros2_rtsp_bridge.py → FFmpeg H.264 → MediaMTX (RTSP)
                                                                    ↓
Dashboard ← WebRTC/WebSocket ← WS Server ← go2rtc ← RTSP pull ←──┘
```

## Component Hierarchy

```
CameraWallModule (main widget)
├── CameraWallToolbar
│   ├── Layout selector (2×2 / 1×1)
│   ├── Stream counter (X/4)
│   └── CameraSourcePicker (dropdown)
│       ├── Kind filter tabs (All / Sim / CCTV)
│       ├── Search box
│       └── Source list with status dots
└── CameraTile (×4 max)
    ├── VideoPlayer (renders WebRTC MediaStream or WS frames)
    └── Status overlay (name, LIVE/FALLBACK, FPS, latency)
```

## Key Files

| File                                                    | Purpose                                       |
| ------------------------------------------------------- | --------------------------------------------- |
| `components/widgets/CameraWallModule.tsx`               | Main widget, source merging, selection state  |
| `components/widgets/camera-wall/CameraTile.tsx`         | Individual camera tile with stream management |
| `components/widgets/camera-wall/CameraWallToolbar.tsx`  | Layout + source selector + stream counter     |
| `components/widgets/camera-wall/CameraSourcePicker.tsx` | Dropdown picker with filtering                |
| `lib/hooks/use-camera-stream.ts`                        | Stream lifecycle (WebRTC → fallback)          |
| `lib/hooks/use-webrtc.ts`                               | RTCPeerConnection management                  |
| `lib/hooks/use-webrtc-guardrail.ts`                     | Max 4 connection enforcement                  |
| `lib/hooks/use-camera-source-polling.ts`                | API polling for camera sources                |
| `lib/stores/camera-source-store.ts`                     | Camera source registry (CRUD + API fetch)     |
| `lib/stores/webrtc-connection-store.ts`                 | Connection pool tracker                       |
| `lib/stores/camera-store.ts`                            | Discovered cameras from WS events             |

## Data Flow

1. **Discovery**: Cameras arrive via `camera_discovered` WS events → `camera-store`
2. **Source Registry**: Backend API (`/api/cameras/sources`) polled every 10s → `camera-source-store`
3. **Merging**: CameraWallModule merges both stores, deduplicates by ID
4. **Selection**: User picks up to 4 sources via CameraSourcePicker
5. **Streaming**: Each CameraTile uses `useCameraStream` → `useWebRTC` → RTCPeerConnection
6. **Guardrail**: `webrtc-connection-store` enforces max 4 concurrent connections
7. **Fallback**: After 3 WebRTC retries → automatic WebSocket frame fallback

## WebRTC Guardrail

- Max 4 concurrent RTCPeerConnection instances (browser performance limit)
- `webrtc-connection-store`: acquire/release pool with FIFO eviction
- Stream counter in toolbar: green (<3), yellow (3), red (4)
- CameraTile `enabled` prop gates stream creation

## RBAC

- Operator/Admin: full camera control
- Viewer: can watch but not change sources (via `usePermission('camera:control')`)

## Known Limitations

- WebRTC requires go2rtc running + RTSP sources configured
- Fallback to WebSocket sends JPEG frames (higher latency, lower quality)
- Max 4 streams is a soft limit in frontend only (backend has no limit)
- Hot-plugging cameras requires page refresh or WS reconnect
