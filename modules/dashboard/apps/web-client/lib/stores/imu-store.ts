/**
 * IMU Store
 *
 * Zustand store for managing IMU (Inertial Measurement Unit) data from ROS.
 * Handles /robot0/imu and similar topics.
 */

import { create } from 'zustand'

// =============================================================================
// Types
// =============================================================================

/**
 * 3D vector
 */
export interface Vector3 {
  x: number
  y: number
  z: number
}

/**
 * Quaternion orientation
 */
export interface Quaternion {
  x: number
  y: number
  z: number
  w: number
}

/**
 * Euler angles (converted from quaternion)
 */
export interface EulerAngles {
  roll: number // rotation around X
  pitch: number // rotation around Y
  yaw: number // rotation around Z
}

/**
 * IMU data structure
 */
export interface ImuData {
  /** Robot ID */
  robotId: string
  /** Frame ID (e.g., 'imu_link') */
  frameId: string
  /** Orientation as quaternion */
  orientation: Quaternion | null
  /** Orientation as euler angles (computed) */
  euler: EulerAngles | null
  /** Angular velocity (rad/s) */
  angularVelocity: Vector3 | null
  /** Linear acceleration (m/s²) */
  linearAcceleration: Vector3 | null
  /** Timestamp */
  timestamp: number
}

/**
 * IMU history entry for graphs
 */
export interface ImuHistoryEntry {
  timestamp: number
  acceleration: Vector3
  angularVelocity: Vector3
  euler: EulerAngles
}

/**
 * IMU store state
 */
interface ImuState {
  /** Current IMU data by robot ID */
  data: Map<string, ImuData>
  /** History for graphing (last N samples) */
  history: ImuHistoryEntry[]
  /** Max history length */
  maxHistory: number
  /** Last update timestamp */
  lastUpdated: number | null
}

/**
 * IMU store actions
 */
interface ImuActions {
  /** Add IMU data */
  addImuData: (data: ImuData) => void
  /** Get IMU data for robot */
  getImuData: (robotId: string) => ImuData | undefined
  /** Get history */
  getHistory: () => ImuHistoryEntry[]
  /** Clear history */
  clearHistory: () => void
  /** Set max history length */
  setMaxHistory: (max: number) => void
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert quaternion to euler angles (in radians)
 */
function quaternionToEuler(q: Quaternion): EulerAngles {
  // Roll (x-axis rotation)
  const sinr_cosp = 2 * (q.w * q.x + q.y * q.z)
  const cosr_cosp = 1 - 2 * (q.x * q.x + q.y * q.y)
  const roll = Math.atan2(sinr_cosp, cosr_cosp)

  // Pitch (y-axis rotation)
  const sinp = 2 * (q.w * q.y - q.z * q.x)
  let pitch: number
  if (Math.abs(sinp) >= 1) {
    pitch = (Math.sign(sinp) * Math.PI) / 2 // use 90 degrees if out of range
  } else {
    pitch = Math.asin(sinp)
  }

  // Yaw (z-axis rotation)
  const siny_cosp = 2 * (q.w * q.z + q.x * q.y)
  const cosy_cosp = 1 - 2 * (q.y * q.y + q.z * q.z)
  const yaw = Math.atan2(siny_cosp, cosy_cosp)

  return { roll, pitch, yaw }
}

/**
 * Convert radians to degrees
 */
export function radToDeg(rad: number): number {
  return rad * (180 / Math.PI)
}

// =============================================================================
// Store Implementation
// =============================================================================

const DEFAULT_MAX_HISTORY = 100

export const useImuStore = create<ImuState & ImuActions>((set, get) => ({
  // Initial state
  data: new Map(),
  history: [],
  maxHistory: DEFAULT_MAX_HISTORY,
  lastUpdated: null,

  // Actions
  addImuData: (data: ImuData) => {
    set((state) => {
      const newData = new Map(state.data)

      // Compute euler angles if orientation present
      const euler = data.orientation ? quaternionToEuler(data.orientation) : null

      const enrichedData: ImuData = {
        ...data,
        euler,
        timestamp: Date.now(),
      }

      newData.set(data.robotId, enrichedData)

      // Add to history if we have all data
      let newHistory = state.history
      if (data.linearAcceleration && data.angularVelocity && euler) {
        const entry: ImuHistoryEntry = {
          timestamp: Date.now(),
          acceleration: data.linearAcceleration,
          angularVelocity: data.angularVelocity,
          euler,
        }
        newHistory = [...state.history, entry].slice(-state.maxHistory)
      }

      return {
        data: newData,
        history: newHistory,
        lastUpdated: Date.now(),
      }
    })
  },

  getImuData: (robotId: string) => {
    return get().data.get(robotId)
  },

  getHistory: () => {
    return get().history
  },

  clearHistory: () => {
    set({ history: [] })
  },

  setMaxHistory: (max: number) => {
    set((state) => ({
      maxHistory: max,
      history: state.history.slice(-max),
    }))
  },
}))

// =============================================================================
// Selectors
// =============================================================================

/**
 * Get IMU data for robot0 (default)
 */
export const selectRobot0Imu = () => {
  return useImuStore.getState().data.get('robot0')
}

/**
 * Get latest acceleration magnitude
 */
export const getAccelerationMagnitude = (robotId: string): number => {
  const data = useImuStore.getState().data.get(robotId)
  if (!data?.linearAcceleration) return 0

  const { x, y, z } = data.linearAcceleration
  return Math.sqrt(x * x + y * y + z * z)
}

export type ImuStore = typeof useImuStore
