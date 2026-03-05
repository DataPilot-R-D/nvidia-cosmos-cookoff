# Camera Source Registry — Spec / RFC

> **Issue:** #13 — T1.1 Spec: Camera Source Registry contract
> **Status:** Draft
> **Author:** Forge
> **Date:** 2026-02-19

## 1. Overview

The Camera Source Registry is the single source of truth for all camera streams available to the dashboard. It tracks camera metadata, connection details, health status, and integrates with go2rtc (#11) for stream proxying.

## 2. Data Model

### CameraSource

| Field            | Type               | Required | Description                                       |
| ---------------- | ------------------ | -------- | ------------------------------------------------- |
| `id`             | `string`           | ✅       | Unique identifier (UUID v4)                       |
| `name`           | `string`           | ✅       | Human-readable display name                       |
| `slug`           | `string`           | ✅       | Machine-friendly name following naming convention |
| `type`           | `CameraSourceType` | ✅       | Source category                                   |
| `protocol`       | `CameraProtocol`   | ✅       | Stream protocol                                   |
| `url`            | `string`           | ✅       | Source stream URL (RTSP/HTTP)                     |
| `go2rtcStreamId` | `string \| null`   | ❌       | Mapped stream ID in go2rtc                        |
| `status`         | `CameraStatus`     | ✅       | Current health status                             |
| `lastSeen`       | `number`           | ❌       | Unix timestamp of last successful healthcheck     |
| `metadata`       | `CameraMetadata`   | ❌       | Additional properties                             |
| `createdAt`      | `number`           | ✅       | Unix timestamp                                    |
| `updatedAt`      | `number`           | ✅       | Unix timestamp                                    |

### Enums

```typescript
type CameraSourceType = 'isaac-sim' | 'rtsp-physical' | 'usb' | 'webrtc' | 'test'

type CameraProtocol = 'rtsp' | 'http-mjpeg' | 'webrtc' | 'hls'

type CameraStatus = 'online' | 'offline' | 'error' | 'unknown'
```

### CameraMetadata

```typescript
interface CameraMetadata {
  location?: string // e.g. "warehouse-north", "dock-bay-3"
  resolution?: string // e.g. "1920x1080"
  fps?: number // e.g. 30
  codec?: string // e.g. "h264", "h265"
  scene?: string // Isaac Sim scene name
  tags?: string[] // Free-form tags for filtering
}
```

## 3. Naming Convention

Source slugs follow the pattern: `{type}.{location}.{name}`

**Examples:**

- `isaac.warehouse.entrance` — Isaac Sim warehouse entrance camera
- `isaac.warehouse.dock` — Isaac Sim dock camera
- `rtsp.office.lobby` — Physical RTSP camera in office lobby
- `usb.robot.front` — USB camera on robot front
- `test.mock.static` — Test/mock camera

Rules:

- Lowercase alphanumeric + dots + hyphens only
- Max 64 characters
- Must be unique within the registry
- Regex: `^[a-z0-9]+(\.[a-z0-9-]+){1,4}$`

## 4. API Contract

### 4.1 REST Endpoints

All endpoints are prefixed with `/api/cameras`.

#### List Sources

```
GET /api/cameras
Query: ?type=isaac-sim&status=online&tag=warehouse
Response: { sources: CameraSource[], total: number }
```

#### Get Source

```
GET /api/cameras/:id
Response: CameraSource
404: { error: "Camera source not found" }
```

#### Create Source

```
POST /api/cameras
Body: CreateCameraSourceRequest
Response: CameraSource (201)
409: { error: "Slug already exists" }
```

#### Update Source

```
PATCH /api/cameras/:id
Body: UpdateCameraSourceRequest (partial)
Response: CameraSource
404: { error: "Camera source not found" }
```

#### Delete Source

```
DELETE /api/cameras/:id
Response: 204
404: { error: "Camera source not found" }
```

### 4.2 WebSocket Messages (MessagePack)

For real-time status updates over the existing WS connection:

```typescript
// Server → Client: status broadcast
{
  topic: "camera:status",
  payload: {
    id: string;
    status: CameraStatus;
    lastSeen: number;
  }
}

// Server → Client: registry changed (source added/removed/updated)
{
  topic: "camera:registry:changed",
  payload: {
    action: "added" | "removed" | "updated";
    source: CameraSource;
  }
}

// Client → Server: request full registry
{
  topic: "camera:registry:list",
  payload: {}
}

// Server → Client: full registry response
{
  topic: "camera:registry:snapshot",
  payload: {
    sources: CameraSource[];
  }
}
```

## 5. go2rtc Integration

### How Registry Knows About Streams

1. **Static config**: Sources defined in `infra/go2rtc/go2rtc.yaml` are loaded at startup
2. **go2rtc API polling**: Registry queries `GET http://go2rtc:1984/api/streams` periodically (every 30s) to discover available streams
3. **Manual registration**: Sources added via REST API with explicit `go2rtcStreamId`

### Sync Flow

```
                    ┌─────────────────┐
                    │   go2rtc API    │
                    │  :1984/api      │
                    └────────┬────────┘
                             │ poll /api/streams
                             ▼
┌──────────────┐    ┌─────────────────┐    ┌──────────────┐
│  REST API    │───▶│ Camera Registry │───▶│  WS Broadcast│
│  /api/cameras│    │   (in-memory +  │    │  camera:*    │
└──────────────┘    │    persist)     │    └──────────────┘
                    └─────────────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Healthcheck    │
                    │  Loop (30s)     │
                    └─────────────────┘
```

### Stream Mapping

When a `CameraSource` has a `go2rtcStreamId`, the frontend uses:

- WebRTC: `http://go2rtc:1984/api/webrtc?src={go2rtcStreamId}`
- MSE: `http://go2rtc:1984/api/stream.mp4?src={go2rtcStreamId}`

## 6. Healthcheck Flow

1. Every **30 seconds**, the registry iterates all registered sources
2. For sources with `go2rtcStreamId`: query `GET http://go2rtc:1984/api/streams` and check if stream exists and has active producers
3. For direct RTSP sources (no go2rtc): attempt TCP connection to RTSP port (timeout 5s)
4. Update `status` and `lastSeen` accordingly
5. Broadcast `camera:status` via WebSocket on status change

### Status Transitions

```
unknown → online    (first successful healthcheck)
unknown → offline   (first failed healthcheck)
online  → offline   (3 consecutive failed checks)
online  → error     (connection error / malformed response)
offline → online    (successful healthcheck)
error   → online    (successful healthcheck)
```

## 7. Request/Response Types

```typescript
interface CreateCameraSourceRequest {
  name: string
  slug: string
  type: CameraSourceType
  protocol: CameraProtocol
  url: string
  go2rtcStreamId?: string
  metadata?: CameraMetadata
}

interface UpdateCameraSourceRequest {
  name?: string
  slug?: string
  type?: CameraSourceType
  protocol?: CameraProtocol
  url?: string
  go2rtcStreamId?: string | null
  metadata?: CameraMetadata
}
```

## 8. Error Codes

| Code                 | Status | Description                                   |
| -------------------- | ------ | --------------------------------------------- |
| `CAMERA_NOT_FOUND`   | 404    | Camera source with given ID not found         |
| `SLUG_CONFLICT`      | 409    | Slug already in use by another source         |
| `INVALID_SLUG`       | 400    | Slug doesn't match naming convention          |
| `INVALID_URL`        | 400    | URL is not a valid stream URL                 |
| `GO2RTC_UNREACHABLE` | 503    | Cannot reach go2rtc API for stream validation |

## 9. Future Considerations

- **Persistence**: Initially in-memory with JSON file backup; migrate to SQLite if needed
- **Authentication**: Camera URLs may contain credentials — store securely, never expose in API responses to unprivileged users
- **Multi-go2rtc**: Support multiple go2rtc instances for scaling
- **Auto-discovery**: mDNS/ONVIF discovery of physical cameras
