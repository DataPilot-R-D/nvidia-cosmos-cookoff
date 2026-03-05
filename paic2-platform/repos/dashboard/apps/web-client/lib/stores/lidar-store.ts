/**
 * LIDAR Store
 *
 * Zustand store for managing LIDAR point cloud state.
 * Receives scans from WebSocket and provides them to LIDAR visualization components.
 * Supports point accumulation for building maps over time.
 *
 * PERFORMANCE: Uses TypedArray ring buffer to eliminate GC pressure from
 * spreading 100K+ objects on every scan update. Pre-allocated buffers are
 * reused, with only the Zustand wrapper reference changing for immutability.
 *
 * @see research-summary.md Section 2.2: Streaming LIDAR Point Cloud
 * @see docs/optimizations-2026.md Buffer Management patterns
 */

import { create } from 'zustand'
import type { LidarPoint, LidarScanConfig } from '@workspace/shared-types'

// =============================================================================
// Constants
// =============================================================================

/** Maximum accumulated points (ring buffer capacity) */
const MAX_ACCUMULATED_POINTS = 100_000

// =============================================================================
// Types
// =============================================================================

/**
 * Extended LIDAR point with age for visualization
 * @deprecated Use LidarPointBuffer for accumulated points
 */
export interface LidarPointWithAge extends LidarPoint {
  /** Timestamp when point was added */
  timestamp: number
  /** Scan index for coloring */
  scanIndex: number
}

/**
 * Pre-allocated ring buffer for LIDAR point accumulation.
 * Uses Struct-of-Arrays pattern with TypedArrays for zero-allocation updates.
 *
 * Memory: ~2.9 MB for 100K points vs ~9.6 MB for object array
 * GC: Zero allocations after initialization vs ~19 MB/update cycle
 */
export interface LidarPointBuffer {
  /** X, Y, Z positions interleaved (length = capacity * 3) */
  positions: Float32Array
  /** Intensity per point (0-255) */
  intensities: Uint8Array
  /** Scan index for age-based coloring */
  scanIndices: Uint32Array
  /** Buffer capacity (max points) */
  capacity: number
  /** Current number of valid points */
  count: number
  /** Next write position (wraps around via modulo) */
  writeHead: number
  /** Version counter for change detection */
  version: number
}

/**
 * LIDAR scan state for a single robot
 */
export interface LidarScanState {
  /** Scan configuration/metadata */
  config: LidarScanConfig
  /** Current scan points (latest only) */
  points: LidarPoint[]
  /** Accumulated points buffer (ring buffer with TypedArrays) */
  pointBuffer: LidarPointBuffer
  /** @deprecated Legacy getter - use pointBuffer instead */
  accumulatedPoints: LidarPointWithAge[]
  /** Total scan count */
  totalScanCount: number
  /** Scan count for FPS calculation */
  scanCount: number
  /** Last FPS update timestamp */
  lastFpsUpdate: number
  /** Calculated FPS */
  fps: number
  /** Last scan timestamp */
  lastScanTime: number
}

/**
 * LIDAR store state
 */
interface LidarState {
  /** Scans by robot ID */
  scans: Map<string, LidarScanState>
  /** Active subscriptions (robot IDs) */
  subscriptions: Set<string>
}

/**
 * LIDAR store actions
 */
interface LidarActions {
  /** Add a new scan for a robot */
  addScan: (robotId: string, config: LidarScanConfig, points: LidarPoint[]) => void
  /** Clear scan for a robot */
  clearScan: (robotId: string) => void
  /** Clear only accumulated points (keep current scan) */
  clearAccumulated: (robotId: string) => void
  /** Get current scan for a robot */
  getScan: (robotId: string) => LidarScanState | undefined
  /** Get all scans */
  getAllScans: () => LidarScanState[]
  /** Add subscription */
  addSubscription: (robotId: string) => void
  /** Remove subscription */
  removeSubscription: (robotId: string) => void
  /** Check if subscribed */
  isSubscribed: (robotId: string) => boolean
}

// =============================================================================
// Ring Buffer Functions
// =============================================================================

/**
 * Create a new pre-allocated point buffer
 */
function createPointBuffer(capacity: number): LidarPointBuffer {
  return {
    positions: new Float32Array(capacity * 3),
    intensities: new Uint8Array(capacity),
    scanIndices: new Uint32Array(capacity),
    capacity,
    count: 0,
    writeHead: 0,
    version: 0,
  }
}

/**
 * Append points to ring buffer (mutates in place, returns new wrapper for Zustand)
 * Uses direct TypedArray write - zero object allocations
 */
function appendToBuffer(
  buffer: LidarPointBuffer,
  points: LidarPoint[],
  scanIndex: number
): LidarPointBuffer {
  const { positions, intensities, scanIndices, capacity } = buffer
  let { count, writeHead, version } = buffer

  for (const point of points) {
    const posOffset = writeHead * 3
    positions[posOffset] = point.x
    positions[posOffset + 1] = point.y
    positions[posOffset + 2] = point.z
    intensities[writeHead] = point.intensity ?? 255
    scanIndices[writeHead] = scanIndex

    writeHead = (writeHead + 1) % capacity
    if (count < capacity) count++
  }

  // Return new wrapper (Zustand immutability) with same underlying buffers
  return {
    positions,
    intensities,
    scanIndices,
    capacity,
    count,
    writeHead,
    version: version + 1,
  }
}

/**
 * Clear buffer (reset counters, keep allocated memory)
 */
function clearBuffer(buffer: LidarPointBuffer): LidarPointBuffer {
  return {
    ...buffer,
    count: 0,
    writeHead: 0,
    version: buffer.version + 1,
  }
}

// Note: bufferToArray removed - components should read directly from pointBuffer
// Use readPositionsFromBuffer() and readScanIndicesFromBuffer() for direct access

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create initial scan state with pre-allocated buffer
 */
function createInitialScanState(config: LidarScanConfig, points: LidarPoint[]): LidarScanState {
  const now = Date.now()
  const buffer = createPointBuffer(MAX_ACCUMULATED_POINTS)
  const updatedBuffer = appendToBuffer(buffer, points, 0)

  return {
    config,
    points,
    pointBuffer: updatedBuffer,
    // Legacy field - deprecated, use pointBuffer directly
    accumulatedPoints: [],
    totalScanCount: 1,
    scanCount: 1,
    lastFpsUpdate: now,
    fps: 0,
    lastScanTime: now,
  }
}

// =============================================================================
// Store Implementation
// =============================================================================

/**
 * LIDAR Store
 *
 * Manages LIDAR point cloud state for all robots.
 */
export const useLidarStore = create<LidarState & LidarActions>((set, get) => ({
  // Initial state
  scans: new Map(),
  subscriptions: new Set(),

  // Actions
  addScan: (robotId: string, config: LidarScanConfig, points: LidarPoint[]) => {
    set((state) => {
      const newScans = new Map(state.scans)
      const existing = newScans.get(robotId)

      const now = Date.now()

      if (!existing) {
        // First scan for this robot
        newScans.set(robotId, createInitialScanState(config, points))
      } else {
        // Update existing scan
        const elapsed = now - existing.lastFpsUpdate
        const newScanCount = existing.scanCount + 1
        const newTotalScanCount = existing.totalScanCount + 1

        // Calculate FPS every second
        let newFps = existing.fps
        let newLastFpsUpdate = existing.lastFpsUpdate
        let newScanCountReset = newScanCount

        if (elapsed >= 1000) {
          newFps = Math.round((newScanCount * 1000) / elapsed)
          newLastFpsUpdate = now
          newScanCountReset = 0
        }

        // Append to ring buffer (zero allocation - writes directly to TypedArrays)
        const updatedBuffer = appendToBuffer(existing.pointBuffer, points, newTotalScanCount)

        newScans.set(robotId, {
          config,
          points,
          pointBuffer: updatedBuffer,
          // Legacy field - deprecated, use pointBuffer directly
          accumulatedPoints: [],
          totalScanCount: newTotalScanCount,
          scanCount: newScanCountReset,
          lastFpsUpdate: newLastFpsUpdate,
          fps: newFps,
          lastScanTime: now,
        })
      }

      return { scans: newScans }
    })
  },

  clearScan: (robotId: string) => {
    set((state) => {
      const newScans = new Map(state.scans)
      newScans.delete(robotId)
      return { scans: newScans }
    })
  },

  clearAccumulated: (robotId: string) => {
    set((state) => {
      const newScans = new Map(state.scans)
      const existing = newScans.get(robotId)

      if (existing) {
        // Clear buffer (keeps allocated memory, resets counters)
        const clearedBuffer = clearBuffer(existing.pointBuffer)
        newScans.set(robotId, {
          ...existing,
          pointBuffer: clearedBuffer,
          // Legacy field - deprecated, use pointBuffer directly
          accumulatedPoints: [],
          totalScanCount: 0,
        })
      }

      return { scans: newScans }
    })
  },

  getScan: (robotId: string) => {
    return get().scans.get(robotId)
  },

  getAllScans: () => {
    return Array.from(get().scans.values())
  },

  addSubscription: (robotId: string) => {
    set((state) => {
      const newSubscriptions = new Set(state.subscriptions)
      newSubscriptions.add(robotId)
      return { subscriptions: newSubscriptions }
    })
  },

  removeSubscription: (robotId: string) => {
    set((state) => {
      const newSubscriptions = new Set(state.subscriptions)
      newSubscriptions.delete(robotId)
      return { subscriptions: newSubscriptions }
    })
  },

  isSubscribed: (robotId: string) => {
    return get().subscriptions.has(robotId)
  },
}))

// =============================================================================
// Exported Utilities for Direct Buffer Access
// =============================================================================

/**
 * Get point buffer for a robot (for direct TypedArray access in Three.js)
 * Returns null if no scan data exists
 */
export function getPointBuffer(robotId: string): LidarPointBuffer | null {
  const scan = useLidarStore.getState().scans.get(robotId)
  return scan?.pointBuffer ?? null
}

/**
 * Read positions from ring buffer into a target Float32Array
 * Handles ring buffer wrap-around and coordinate transform (ROS to Three.js)
 *
 * @param buffer Source ring buffer
 * @param target Target Float32Array (must be large enough)
 * @param maxPoints Maximum points to read
 * @returns Number of points actually written
 */
export function readPositionsFromBuffer(
  buffer: LidarPointBuffer,
  target: Float32Array,
  maxPoints: number
): number {
  const { positions, count, writeHead, capacity } = buffer
  const readCount = Math.min(count, maxPoints)

  // Start from oldest point in ring buffer
  const start = count < capacity ? 0 : writeHead

  for (let i = 0; i < readCount; i++) {
    const srcIdx = (start + i) % capacity
    const srcOffset = srcIdx * 3
    const dstOffset = i * 3

    // Transform: ROS (x forward, y left, z up) -> Three.js (x right, y up, z forward)
    target[dstOffset] = positions[srcOffset] // x stays
    target[dstOffset + 1] = positions[srcOffset + 2] // z -> y (up)
    target[dstOffset + 2] = -positions[srcOffset + 1] // -y -> z (forward)
  }

  return readCount
}

/**
 * Read scan indices from ring buffer for age-based coloring
 */
export function readScanIndicesFromBuffer(
  buffer: LidarPointBuffer,
  target: Uint32Array,
  maxPoints: number
): number {
  const { scanIndices, count, writeHead, capacity } = buffer
  const readCount = Math.min(count, maxPoints)
  const start = count < capacity ? 0 : writeHead

  for (let i = 0; i < readCount; i++) {
    const srcIdx = (start + i) % capacity
    target[i] = scanIndices[srcIdx]
  }

  return readCount
}
