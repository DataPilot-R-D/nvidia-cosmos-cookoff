/**
 * Video Frame Store
 *
 * Zustand store for managing video frame state.
 * Receives frames from WebSocket and provides them to camera stream hooks.
 *
 * OPTIMIZED: Uses Record instead of Map, Blob URLs for better performance.
 *
 * @see plan.md Phase 4: Camera streaming integration
 */

import { create } from 'zustand'
import type { VideoFrameMetadata } from '@workspace/shared-types'

// =============================================================================
// Types
// =============================================================================

/**
 * Frame data stored for each camera
 */
export interface CameraFrameState {
  /** Latest frame metadata */
  metadata: VideoFrameMetadata | null
  /** Latest frame data as blob URL or data URL (for JPEG) */
  dataUrl: string | null
  /** Raw frame data for Canvas rendering (for raw format) */
  rawData: Uint8Array | null
  /** Previous blob URL (for cleanup) */
  previousBlobUrl: string | null
  /** Frame count for FPS calculation */
  frameCount: number
  /** Last FPS update timestamp */
  lastFpsUpdate: number
  /** Calculated FPS */
  fps: number
  /** Last frame timestamp */
  lastFrameTime: number
}

/**
 * Video frame store state
 */
interface VideoFrameState {
  /** Frames by camera ID (Record for faster access) */
  frames: Record<string, CameraFrameState>
}

/**
 * Video frame store actions
 */
interface VideoFrameActions {
  /** Add a new frame for a camera */
  addFrame: (cameraId: string, metadata: VideoFrameMetadata, data: ArrayBuffer | string) => void
  /** Clear frames for a camera */
  clearFrames: (cameraId: string) => void
  /** Get current frame for a camera */
  getFrame: (cameraId: string) => CameraFrameState | undefined
  /** Get FPS for a camera */
  getFps: (cameraId: string) => number
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create initial frame state
 */
function createInitialFrameState(): CameraFrameState {
  return {
    metadata: null,
    dataUrl: null,
    rawData: null,
    previousBlobUrl: null,
    frameCount: 0,
    lastFpsUpdate: Date.now(),
    fps: 0,
    lastFrameTime: 0,
  }
}

/**
 * Decode base64 to Uint8Array (fast)
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

// =============================================================================
// Store Implementation
// =============================================================================

/**
 * Video Frame Store
 *
 * Manages video frame state for all cameras.
 * Used for base64/fallback mode streaming.
 */
export const useVideoFrameStore = create<VideoFrameState & VideoFrameActions>((set, get) => ({
  // Initial state - use Record instead of Map for better performance
  frames: {},

  // Actions
  addFrame: (cameraId: string, metadata: VideoFrameMetadata, data: ArrayBuffer | string) => {
    const state = get()
    const existing = state.frames[cameraId] ?? createInitialFrameState()

    const now = Date.now()
    const elapsed = now - existing.lastFpsUpdate
    const newFrameCount = existing.frameCount + 1

    // Calculate FPS every second
    let newFps = existing.fps
    let newLastFpsUpdate = existing.lastFpsUpdate
    let newFrameCountReset = newFrameCount

    if (elapsed >= 1000) {
      newFps = Math.round((newFrameCount * 1000) / elapsed)
      newLastFpsUpdate = now
      newFrameCountReset = 0
    }

    // Handle raw format (for Canvas rendering) vs JPEG (for img tag)
    let dataUrl: string | null = null
    let rawData: Uint8Array | null = null
    let previousBlobUrl: string | null = existing.previousBlobUrl

    const extendedMetadata = metadata as VideoFrameMetadata & { encoding?: string }
    const isRawFormat = (metadata.format as string) === 'raw' || extendedMetadata.encoding

    if (isRawFormat && typeof data === 'string') {
      // Raw RGB data - decode base64 to Uint8Array for Canvas rendering
      rawData = base64ToUint8Array(data)
    } else if (typeof data === 'string') {
      // JPEG data - use as data URL
      if (data.startsWith('data:')) {
        dataUrl = data
      } else {
        dataUrl = `data:image/${metadata.format};base64,${data}`
      }
    } else {
      // ArrayBuffer - create Blob URL
      const blob = new Blob([data], { type: `image/${metadata.format}` })
      dataUrl = URL.createObjectURL(blob)

      if (existing.dataUrl?.startsWith('blob:')) {
        previousBlobUrl = existing.dataUrl
        setTimeout(() => URL.revokeObjectURL(previousBlobUrl!), 100)
      }
    }

    // Update state with new frame
    set({
      frames: {
        ...state.frames,
        [cameraId]: {
          metadata,
          dataUrl,
          rawData,
          previousBlobUrl,
          frameCount: newFrameCountReset,
          lastFpsUpdate: newLastFpsUpdate,
          fps: newFps,
          lastFrameTime: now,
        },
      },
    })
  },

  clearFrames: (cameraId: string) => {
    const state = get()
    const existing = state.frames[cameraId]

    // Revoke blob URL if exists
    if (existing?.dataUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(existing.dataUrl)
    }

    // Remove camera from frames
    const { [cameraId]: _, ...rest } = state.frames
    set({ frames: rest })
  },

  getFrame: (cameraId: string) => {
    return get().frames[cameraId]
  },

  getFps: (cameraId: string) => {
    return get().frames[cameraId]?.fps ?? 0
  },
}))
