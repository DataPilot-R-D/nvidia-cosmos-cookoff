/**
 * Machine Stats Store
 *
 * Zustand store for managing server machine statistics (CPU, Memory, GPU, etc.)
 * Receives data from the 'server:stats' WebSocket event.
 *
 * @see plan.md Checkpoint 2: Transport Layer
 */

import { create } from 'zustand'
import type { MachineStatsMessage } from '@workspace/shared-types'

/**
 * Maximum number of historical data points to keep
 * 60 samples at 5s interval = 5 minutes of history
 */
const MAX_HISTORY_LENGTH = 60

/**
 * Timeout in ms before marking as not receiving
 * 3x the emission interval (15s)
 */
const RECEIVING_TIMEOUT_MS = 15000

/**
 * Machine Stats Store State Interface
 */
export interface MachineStatsState {
  /** Latest stats received from server */
  currentStats: MachineStatsMessage | null
  /** Historical stats for trend visualization */
  history: MachineStatsMessage[]
  /** Whether we are actively receiving stats */
  isReceiving: boolean
  /** Timestamp of last received stats */
  lastReceivedAt: number | null
}

/**
 * Machine Stats Store Actions Interface
 */
export interface MachineStatsActions {
  /** Update stats with new data from WebSocket */
  updateStats: (stats: MachineStatsMessage) => void
  /** Clear all historical data */
  clearHistory: () => void
  /** Set receiving status */
  setReceiving: (isReceiving: boolean) => void
  /** Get CPU usage percentage (0-100) */
  getCpuUsage: () => number
  /** Get Memory usage percentage (0-100) */
  getMemoryUsage: () => number
  /** Get GPU usage percentage (0-100) or null if not available */
  getGpuUsage: () => number | null
  /** Check if stats are stale (not received for RECEIVING_TIMEOUT_MS) */
  isStale: () => boolean
}

/**
 * Initial state for the Machine Stats store
 */
const initialState: MachineStatsState = {
  currentStats: null,
  history: [],
  isReceiving: false,
  lastReceivedAt: null,
}

/**
 * Machine Stats Store
 *
 * Manages server resource statistics received via WebSocket.
 * Keeps a rolling history for trend visualization.
 *
 * @example
 * ```tsx
 * // In a component
 * const { currentStats, isReceiving } = useMachineStatsStore()
 * const cpuUsage = useMachineStatsStore((state) => state.getCpuUsage())
 *
 * // Get history for charts
 * const history = useMachineStatsStore((state) => state.history)
 * ```
 */
export const useMachineStatsStore = create<MachineStatsState & MachineStatsActions>((set, get) => ({
  // State
  ...initialState,

  // Actions
  updateStats: (stats: MachineStatsMessage) => {
    set((state) => ({
      currentStats: stats,
      // Keep last MAX_HISTORY_LENGTH entries
      history: [...state.history.slice(-(MAX_HISTORY_LENGTH - 1)), stats],
      isReceiving: true,
      lastReceivedAt: Date.now(),
    }))
  },

  clearHistory: () =>
    set({
      currentStats: null,
      history: [],
      lastReceivedAt: null,
    }),

  setReceiving: (isReceiving: boolean) => set({ isReceiving }),

  // Selectors
  getCpuUsage: () => {
    const stats = get().currentStats
    return stats?.data.cpu.usage ?? 0
  },

  getMemoryUsage: () => {
    const stats = get().currentStats
    return stats?.data.memory.percent ?? 0
  },

  getGpuUsage: () => {
    const stats = get().currentStats
    return stats?.data.gpu?.usage ?? null
  },

  isStale: () => {
    const { lastReceivedAt } = get()
    if (!lastReceivedAt) return true
    return Date.now() - lastReceivedAt > RECEIVING_TIMEOUT_MS
  },
}))

/**
 * Export store type for testing and typing purposes
 */
export type MachineStatsStore = typeof useMachineStatsStore

/**
 * Start timeout checker for receiving status
 * Should be called once when the app initializes
 */
export function startMachineStatsTimeoutChecker(): () => void {
  const intervalId = setInterval(() => {
    const { lastReceivedAt, isReceiving, setReceiving } = useMachineStatsStore.getState()

    if (lastReceivedAt && Date.now() - lastReceivedAt > RECEIVING_TIMEOUT_MS) {
      if (isReceiving) {
        console.warn('[MachineStats] Stats reception timeout - marking as not receiving')
        setReceiving(false)
      }
    }
  }, 5000)

  return () => clearInterval(intervalId)
}
