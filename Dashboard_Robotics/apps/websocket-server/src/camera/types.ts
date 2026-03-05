/**
 * Camera Source Registry — Type Definitions
 *
 * Spec: docs/specs/camera-source-registry.md
 * Issue: #13 — T1.1 Spec: Camera Source Registry contract
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type CameraSourceType = 'isaac-sim' | 'rtsp-physical' | 'usb' | 'webrtc' | 'test'

export type CameraProtocol = 'rtsp' | 'http-mjpeg' | 'webrtc' | 'hls'

export type CameraStatus = 'online' | 'offline' | 'error' | 'unknown'

// ---------------------------------------------------------------------------
// Core model
// ---------------------------------------------------------------------------

export interface CameraMetadata {
  /** Physical or virtual location, e.g. "warehouse-north" */
  location?: string
  /** Resolution string, e.g. "1920x1080" */
  resolution?: string
  /** Frames per second */
  fps?: number
  /** Video codec, e.g. "h264", "h265" */
  codec?: string
  /** Isaac Sim scene name (for type "isaac-sim") */
  scene?: string
  /** Free-form tags for filtering */
  tags?: string[]
}

export interface CameraSource {
  /** Unique identifier (UUID v4) */
  id: string
  /** Human-readable display name */
  name: string
  /** Machine-friendly slug: {type}.{location}.{name} */
  slug: string
  /** Source category */
  type: CameraSourceType
  /** Stream protocol */
  protocol: CameraProtocol
  /** Source stream URL (RTSP/HTTP) */
  url: string
  /** Mapped stream ID in go2rtc (null if not proxied) */
  go2rtcStreamId: string | null
  /** Current health status */
  status: CameraStatus
  /** Unix timestamp (ms) of last successful healthcheck */
  lastSeen: number | null
  /** Additional properties */
  metadata: CameraMetadata
  /** Unix timestamp (ms) */
  createdAt: number
  /** Unix timestamp (ms) */
  updatedAt: number
}

// ---------------------------------------------------------------------------
// API request/response types
// ---------------------------------------------------------------------------

export interface CreateCameraSourceRequest {
  name: string
  slug: string
  type: CameraSourceType
  protocol: CameraProtocol
  url: string
  go2rtcStreamId?: string
  metadata?: CameraMetadata
}

export interface UpdateCameraSourceRequest {
  name?: string
  slug?: string
  type?: CameraSourceType
  protocol?: CameraProtocol
  url?: string
  go2rtcStreamId?: string | null
  metadata?: CameraMetadata
}

export interface CameraListResponse {
  sources: CameraSource[]
  total: number
}

export interface CameraListQuery {
  type?: CameraSourceType
  status?: CameraStatus
  tag?: string
}

// ---------------------------------------------------------------------------
// WebSocket message payloads (MessagePack)
// ---------------------------------------------------------------------------

export interface CameraStatusPayload {
  id: string
  status: CameraStatus
  lastSeen: number
}

export interface CameraRegistryChangedPayload {
  action: 'added' | 'removed' | 'updated'
  source: CameraSource
}

export interface CameraRegistrySnapshotPayload {
  sources: CameraSource[]
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export type CameraErrorCode =
  | 'CAMERA_NOT_FOUND'
  | 'SLUG_CONFLICT'
  | 'INVALID_SLUG'
  | 'INVALID_URL'
  | 'GO2RTC_UNREACHABLE'

export interface CameraErrorResponse {
  error: string
  code: CameraErrorCode
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/** Slug validation regex: lowercase alphanumeric + dots + hyphens, 2-5 segments */
export const CAMERA_SLUG_REGEX = /^[a-z0-9]+(\.[a-z0-9-]+){1,4}$/

/** Maximum slug length */
export const CAMERA_SLUG_MAX_LENGTH = 64

/**
 * Validate a camera source slug.
 * Returns null if valid, or an error message string.
 */
export function validateCameraSlug(slug: string): string | null {
  if (slug.length > CAMERA_SLUG_MAX_LENGTH) {
    return `Slug exceeds maximum length of ${CAMERA_SLUG_MAX_LENGTH} characters`
  }
  if (!CAMERA_SLUG_REGEX.test(slug)) {
    return 'Slug must be lowercase alphanumeric with dot-separated segments (e.g. isaac.warehouse.entrance)'
  }
  return null
}
