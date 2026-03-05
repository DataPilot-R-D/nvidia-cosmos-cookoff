/**
 * Camera State Store
 *
 * Zustand store for managing discovered cameras and active video streams.
 * Works with camera_discovered/camera_lost WebSocket events.
 *
 * @see plan.md Step 4: Camera Store
 */

import { create } from 'zustand'
import { type CameraEntity, type CameraStatus } from '@workspace/shared-types'

// =============================================================================
// Types
// =============================================================================

/**
 * Stream mode - HLS for playback, WebRTC for low-latency live
 */
export type StreamMode = 'hls' | 'webrtc'

/**
 * Stream status
 */
export type StreamStatus = 'connecting' | 'live' | 'error' | 'stopped'

/**
 * Active stream information
 */
export interface StreamInfo {
  /** Streaming mode */
  mode: StreamMode
  /** Current status */
  status: StreamStatus
  /** When stream started */
  startedAt: number
  /** Stream URL (HLS manifest or WebRTC peer connection ID) */
  url?: string
  /** Current FPS (measured) */
  fps?: number
  /** Latency in ms (WebRTC only) */
  latency?: number
}

/**
 * Camera Store State Interface
 */
export interface CameraState {
  /** Map of camera IDs to camera entities */
  cameras: Map<string, CameraEntity>
  /** Map of camera IDs to active stream info */
  activeStreams: Map<string, StreamInfo>
  /** Currently selected camera ID */
  selectedCamera: string | null
}

/**
 * Camera Store Actions Interface
 */
export interface CameraActions {
  /** Add or update camera in store */
  addCamera: (camera: CameraEntity) => void
  /** Remove camera from store */
  removeCamera: (cameraId: string) => void
  /** Update camera with partial data */
  updateCamera: (cameraId: string, partial: Partial<CameraEntity>) => void
  /** Select a camera for viewing */
  selectCamera: (cameraId: string | null) => void
  /** Set active stream for camera */
  setActiveStream: (cameraId: string, streamInfo: StreamInfo) => void
  /** Remove active stream for camera */
  removeActiveStream: (cameraId: string) => void
  /** Clear all cameras and streams */
  clearCameras: () => void
  /** Selector: get camera by ID */
  getCameraById: (cameraId: string) => CameraEntity | undefined
  /** Selector: get cameras for a specific robot */
  getCamerasByRobot: (robotId: string) => CameraEntity[]
  /** Selector: get all cameras as array */
  getAllCameras: () => CameraEntity[]
  /** Selector: get only active cameras */
  getActiveCameras: () => CameraEntity[]
  /** Selector: get camera count */
  getCameraCount: () => number
}

// =============================================================================
// Initial State
// =============================================================================

const initialState: CameraState = {
  cameras: new Map(),
  activeStreams: new Map(),
  selectedCamera: null,
}

// =============================================================================
// Store Implementation
// =============================================================================

/**
 * Camera State Store
 *
 * Manages camera discovery and streaming state.
 *
 * @example
 * ```tsx
 * // In a component
 * const cameras = useCameraStore((state) => state.getAllCameras())
 * const { addCamera, removeCamera } = useCameraStore.getState()
 *
 * // Get cameras for specific robot
 * const robotCameras = useCameraStore((state) => state.getCamerasByRobot('robot-001'))
 *
 * // Get selected camera
 * const selectedId = useCameraStore((state) => state.selectedCamera)
 * const selectedCamera = useCameraStore((state) =>
 *   state.selectedCamera ? state.getCameraById(state.selectedCamera) : null
 * )
 * ```
 */
export const useCameraStore = create<CameraState & CameraActions>((set, get) => ({
  // State
  ...initialState,

  // Actions
  addCamera: (camera: CameraEntity) =>
    set((state) => {
      const newCameras = new Map(state.cameras)
      newCameras.set(camera.id, camera)
      return { cameras: newCameras }
    }),

  removeCamera: (cameraId: string) =>
    set((state) => {
      const newCameras = new Map(state.cameras)
      newCameras.delete(cameraId)

      // Also clean up active stream if exists
      const newActiveStreams = new Map(state.activeStreams)
      newActiveStreams.delete(cameraId)

      // Clear selected if it was this camera
      const newSelectedCamera = state.selectedCamera === cameraId ? null : state.selectedCamera

      return {
        cameras: newCameras,
        activeStreams: newActiveStreams,
        selectedCamera: newSelectedCamera,
      }
    }),

  updateCamera: (cameraId: string, partial: Partial<CameraEntity>) =>
    set((state) => {
      const existingCamera = state.cameras.get(cameraId)
      if (!existingCamera) {
        return state // No change if camera doesn't exist
      }
      const newCameras = new Map(state.cameras)
      newCameras.set(cameraId, {
        ...existingCamera,
        ...partial,
      })
      return { cameras: newCameras }
    }),

  selectCamera: (cameraId: string | null) =>
    set({
      selectedCamera: cameraId,
    }),

  setActiveStream: (cameraId: string, streamInfo: StreamInfo) =>
    set((state) => {
      const newActiveStreams = new Map(state.activeStreams)
      newActiveStreams.set(cameraId, streamInfo)
      return { activeStreams: newActiveStreams }
    }),

  removeActiveStream: (cameraId: string) =>
    set((state) => {
      const newActiveStreams = new Map(state.activeStreams)
      newActiveStreams.delete(cameraId)
      return { activeStreams: newActiveStreams }
    }),

  clearCameras: () =>
    set({
      cameras: new Map(),
      activeStreams: new Map(),
      selectedCamera: null,
    }),

  // Selectors
  getCameraById: (cameraId: string) => get().cameras.get(cameraId),

  getCamerasByRobot: (robotId: string) => {
    const cameras = get().cameras
    return Array.from(cameras.values()).filter((camera) => camera.robotId === robotId)
  },

  getAllCameras: () => Array.from(get().cameras.values()),

  getActiveCameras: () => {
    const cameras = get().cameras
    const activeStatus: CameraStatus = 'active'
    return Array.from(cameras.values()).filter((camera) => camera.status === activeStatus)
  },

  getCameraCount: () => get().cameras.size,
}))

/**
 * Export store type for testing
 */
export type CameraStore = typeof useCameraStore
