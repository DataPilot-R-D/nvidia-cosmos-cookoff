# WebRTC Implementation Evidence - Isaac Sim Camera Streaming

> **Date:** 2026-01-28
> **Researcher:** Deep Research Agent
> **Status:** CONFIRMED - Full WebRTC implementation found

---

## Executive Summary

Repozytorium zawiera **pełną implementację WebRTC** do streamingu wideo z kamery robota Isaac Sim. Architektura wykorzystuje:

- **go2rtc** jako WebRTC media server (bridge RTSP → WebRTC)
- **Socket.IO** do sygnalizacji WebRTC (SDP offer/answer, ICE candidates)
- **ROS Bridge** do odbioru klatek z sensorów Isaac Sim

---

## 1. Główne Komponenty WebRTC

### 1.1 WebRTC Signaling Handler (Server-Side)

**File:** `apps/websocket-server/src/handlers/webrtc.ts`
**Lines:** 1-500

```typescript
// Line 1-16: Documentation header explaining two modes
/**
 * WebRTC Signaling Handlers
 *
 * Handles WebRTC signaling for video streaming, supporting two modes:
 *
 * 1. **go2rtc Mode (Primary)**: Direct WebRTC from go2rtc server
 *    - Client sends webrtc_request -> Server creates session with go2rtc
 *    - go2rtc sends SDP answer -> Server forwards to client
 *    - Lower latency, better quality, 30 FPS
 *
 * 2. **Legacy Mode (Fallback)**: Relay via ROS bridge
 *    - Original implementation for backwards compatibility
 *    - Used when go2rtc is unavailable
 */
```

**Key Evidence (Lines 116-194):**

```typescript
// WebRTC session request handler
async function handleWebRTCRequest(
  _io: SocketIOServer,
  socket: Socket,
  registry: WebRTCRegistry,
  logger: Logger,
  data: WebRTCRequestMessage
): Promise<void> {
  const { cameraId, clientId, action } = data.data
  // ... session management with go2rtc
}
```

**Key Evidence (Lines 202-289):**

```typescript
// go2rtc SDP exchange - handles client offer, returns go2rtc answer
async function handleWebRTCOfferGo2RTC(): Promise<void> {
  // ...
  // Line 229: Creates session with go2rtc
  const go2rtcSession = await registry.go2rtcClient.createSession(streamName, sdp)

  // Line 240-249: Sends SDP answer back to client
  const answerMsg: WebRTCAnswerMessage = {
    type: 'webrtc_answer',
    timestamp: Date.now(),
    data: {
      cameraId,
      clientId,
      sdp: go2rtcSession.sdpAnswer,
    },
  }
  socket.emit('webrtc_answer', answerMsg)
}
```

---

### 1.2 go2rtc REST Client

**File:** `apps/websocket-server/src/services/go2rtc-client.ts`
**Lines:** 1-407

**Key Evidence - Configuration (Lines 84-88):**

```typescript
const DEFAULT_CONFIG: Partial<Go2RTCClientConfig> = {
  baseUrl: process.env.GO2RTC_URL ?? 'http://localhost:1984',
  timeout: 10000,
}
```

**Key Evidence - Session Creation (Lines 221-255):**

```typescript
async function createSession(streamName: string, clientSdpOffer: string): Promise<Go2RTCSession> {
  // Line 232-237: WHEP-style WebRTC endpoint
  const sdpAnswer = await request<string>(
    'POST',
    `/api/webrtc?src=${encodeURIComponent(streamName)}`,
    clientSdpOffer,
    'application/sdp'
  )
  // ...
}
```

**Key Evidence - Camera Mapping (Lines 369-387):**

```typescript
function mapCameraToStream(cameraId: string): string {
  const cameraMap: Record<string, string> = {
    'robot0-front-cam': 'robot0_camera',
    'robot0-front_cam-rgb': 'robot0_camera',
    robot0_front_cam: 'robot0_camera',
    robot0_front_cam_rgb: 'robot0_camera',
    front_cam: 'robot0_camera',
    robot0_camera: 'robot0_camera',
  }
  // ...
}
```

---

### 1.3 useWebRTC React Hook (Client-Side)

**File:** `apps/web-client/lib/hooks/use-webrtc.ts`
**Lines:** 1-601

**Key Evidence - RTCPeerConnection Setup (Lines 353-503):**

```typescript
const connect = useCallback(async () => {
  // Line 398: Create RTCPeerConnection
  const pc = new RTCPeerConnection({ iceServers })
  peerConnectionRef.current = pc

  // Line 402-414: Handle remote video track
  pc.ontrack = (event: RTCTrackEvent) => {
    if (event.streams && event.streams[0]) {
      setMediaStream(event.streams[0])
      setConnectionState('connected')
      // Start FPS tracking
    }
  }

  // Line 465: Add video transceiver (receive-only)
  pc.addTransceiver('video', { direction: 'recvonly' })

  // Line 468-481: Create and send SDP offer
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  socket.emit('webrtc_offer', offerMessage)
}, [...])
```

**STUN Server Configuration (Lines 108-111):**

```typescript
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]
```

---

### 1.4 WebRTC Signaling Types

**File:** `packages/shared-types/src/video.ts`
**Lines:** 107-206

```typescript
// WebRTC SDP Offer (Lines 115-124)
export const WebRTCOfferMessageSchema = BaseMessageSchema.extend({
  type: z.literal('webrtc_offer'),
  data: z.object({
    cameraId: z.string().min(1),
    clientId: z.string().min(1),
    sdp: z.string().min(1),
  }),
})

// WebRTC SDP Answer (Lines 130-139)
export const WebRTCAnswerMessageSchema = BaseMessageSchema.extend({
  type: z.literal('webrtc_answer'),
  data: z.object({
    cameraId: z.string().min(1),
    clientId: z.string().min(1),
    sdp: z.string().min(1),
  }),
})

// WebRTC ICE Candidate (Lines 145-159)
export const WebRTCIceCandidateMessageSchema = BaseMessageSchema.extend({
  type: z.literal('webrtc_ice'),
  data: z.object({
    cameraId: z.string().min(1),
    clientId: z.string().min(1),
    candidate: z.string().nullable(),
    sdpMid: z.string().optional(),
    sdpMLineIndex: z.number().int().nonnegative().optional(),
  }),
})

// go2rtc Session Request (Lines 172-182)
export const WebRTCRequestMessageSchema = BaseMessageSchema.extend({
  type: z.literal('webrtc_request'),
  data: z.object({
    cameraId: z.string().min(1),
    clientId: z.string().min(1),
    action: z.enum(['start', 'stop']),
  }),
})
```

---

## 2. Isaac Sim Camera Integration

### 2.1 ROS Bridge Camera Handler

**File:** `apps/websocket-server/src/handlers/rosbridge/client.ts`
**Lines:** 306-337 (Isaac Sim topic subscriptions)\*\*

```typescript
function subscribeToTopics(): void {
  // Line 306-311: Robot0 (Go2 Unitree / Isaac Sim) Topics
  // ===== Robot0 (Go2 Unitree / Isaac Sim) Topics =====
  // Odometry and state
  subscribe(DEFAULT_TOPICS.robot0Odom, 'nav_msgs/Odometry')

  // Line 314: Camera subscription
  subscribe(DEFAULT_TOPICS.robot0Camera, 'sensor_msgs/Image')

  // Line 317-318: LIDAR (PointCloud2)
  subscribe(DEFAULT_TOPICS.robot0Lidar, 'sensor_msgs/PointCloud2')

  logger.info('Subscribed to Isaac Sim robot topics')
}
```

**Raw Image Handler (Lines 1188-1284):**

```typescript
async function handleRawImage(msg: Record<string, unknown>, topic?: string): Promise<void> {
  // sensor_msgs/Image - raw RGB image from Isaac Sim
  const width = msg.width as number
  const height = msg.height as number
  const encoding = msg.encoding as string // e.g., 'rgb8', 'bgr8', 'rgba8'

  // Line 1245-1254: Convert to JPEG using Sharp
  const jpegBuffer = await sharp(rawBuffer, {
    raw: {
      width: width || 640,
      height: height || 480,
      channels,
    },
  })
    .resize(640, 360, { fit: 'inside' })
    .jpeg({ quality: 70 })
    .toBuffer()

  // Line 1258-1280: Emit as binary (no Base64)
  io.emit('video_frame', {
    type: 'video_frame',
    timestamp: now,
    metadata: { cameraId, robotId: 'robot0', ... },
    data: jpegBuffer, // Binary Buffer - no .toString('base64')
  })
}
```

---

## 3. EC2 Backend Configuration

**File:** `scripts/setup_backend_ec2.sh`
**Lines:** 75-89

```bash
# Line 84-88: .env configuration with go2rtc URL
cat > .env << 'EOF'
# Server Configuration
PORT=8080
NODE_ENV=production
LOG_LEVEL=info

# ROS Bridge Connection (localhost since ROS is on same machine)
ROS_BRIDGE_URL=ws://localhost:9090

# go2rtc WebRTC Server (localhost since running on same machine)
GO2RTC_URL=http://localhost:1984
EOF
```

---

## 4. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Isaac Sim (EC2)                               │
│  ┌─────────────────┐                                                 │
│  │  Go2 Robot      │                                                 │
│  │  front_cam/rgb  │ ──sensor_msgs/Image──► ┌──────────────┐        │
│  │  (640x480)      │                         │  rosbridge   │        │
│  └─────────────────┘                         │  (port 9090) │        │
│                                              └──────┬───────┘        │
│                                                     │                │
│  ┌──────────────────────────────────────────────────┼───────────────┤
│  │              WebSocket Server (Bun)              │               │
│  │                                                  ▼               │
│  │  ┌─────────────────┐   ┌─────────────────────────────┐           │
│  │  │  ROS Bridge     │   │  go2rtc (port 1984)         │           │
│  │  │  Handler        │──►│  RTSP → WebRTC bridge       │           │
│  │  │  (JPEG encode)  │   │  /api/webrtc endpoint       │           │
│  │  └────────┬────────┘   └─────────────┬───────────────┘           │
│  │           │                          │                           │
│  │           ▼ (fallback)               ▼ (primary)                 │
│  │  ┌─────────────────────────────────────────────────────┐         │
│  │  │           WebRTC Signaling Handler                  │         │
│  │  │  - webrtc_request → create go2rtc session           │         │
│  │  │  - webrtc_offer → forward to go2rtc                 │         │
│  │  │  - webrtc_answer ← receive from go2rtc              │         │
│  │  │  - webrtc_ice ← ICE candidates                      │         │
│  │  └────────────────────────┬────────────────────────────┘         │
│  │                           │ Socket.IO                            │
└──┼───────────────────────────┼──────────────────────────────────────┘
   │                           │
   │                           ▼
┌──┼───────────────────────────────────────────────────────────────────┐
│  │            Web Client (Next.js)                                   │
│  │                                                                   │
│  │  ┌─────────────────────────────────────────────────────────────┐ │
│  │  │                  useWebRTC Hook                              │ │
│  │  │  - RTCPeerConnection                                         │ │
│  │  │  - createOffer() → webrtc_offer                              │ │
│  │  │  - setRemoteDescription(answer)                              │ │
│  │  │  - ontrack → MediaStream                                     │ │
│  │  └──────────────────────────┬──────────────────────────────────┘ │
│  │                             │                                    │
│  │                             ▼                                    │
│  │  ┌─────────────────────────────────────────────────────────────┐ │
│  │  │  <video srcObject={mediaStream} autoPlay playsInline />     │ │
│  │  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 5. Summary of Files

| File                                                     | Lines              | Role                               | Status       |
| -------------------------------------------------------- | ------------------ | ---------------------------------- | ------------ |
| `apps/websocket-server/src/handlers/webrtc.ts`           | 1-500              | WebRTC signaling (go2rtc + legacy) | ✅ Confirmed |
| `apps/websocket-server/src/services/go2rtc-client.ts`    | 1-407              | go2rtc REST API client             | ✅ Confirmed |
| `apps/web-client/lib/hooks/use-webrtc.ts`                | 1-601              | RTCPeerConnection hook             | ✅ Confirmed |
| `packages/shared-types/src/video.ts`                     | 107-206            | WebRTC message schemas             | ✅ Confirmed |
| `apps/websocket-server/src/handlers/rosbridge/client.ts` | 306-337, 1188-1284 | Isaac Sim camera frames            | ✅ Confirmed |
| `scripts/setup_backend_ec2.sh`                           | 75-89              | go2rtc URL configuration           | ✅ Confirmed |

---

## 6. Dependencies (from package.json/requirements.txt)

### WebSocket Server (Node.js/Bun)

- No explicit WebRTC library (uses go2rtc as external service)
- `socket.io` - WebSocket signaling
- `sharp` - JPEG encoding for fallback

### ROS Bridge (Python)

- `opencv-python` - Image encoding
- `websockets` - WebSocket client
- No WebRTC library (uses ROS→WebSocket→go2rtc pipeline)

### go2rtc (External Service)

- Binary server: https://github.com/AlexxIT/go2rtc
- Runs on port 1984
- Bridges RTSP sources to WebRTC

---

## 7. Conclusion

Implementacja WebRTC w tym projekcie jest **kompletna i produkcyjna**:

1. **go2rtc Mode (Primary)**: Bezpośrednie WebRTC z go2rtc server (30 FPS, niskie latency)
2. **Legacy Mode (Fallback)**: Relay przez ROS bridge gdy go2rtc niedostępny
3. **Isaac Sim Integration**: Kamery robota emitują `sensor_msgs/Image`, przetwarzane przez ROS Bridge
4. **Signaling**: Pełna implementacja SDP offer/answer + ICE candidates przez Socket.IO
5. **Client-Side**: React hook `useWebRTC` z pełnym lifecycle RTCPeerConnection

**Brak aiortc/pion** - projekt używa **go2rtc** jako zewnętrznego serwera WebRTC, co jest bardziej skalowalne i wydajne niż implementacja w Pythonie.
