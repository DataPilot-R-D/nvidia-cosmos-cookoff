/**
 * WebRTC Connection Pool Store
 *
 * Tracks active WebRTC connections with a hard limit of MAX_CONNECTIONS.
 * Prevents browser/server overload from too many simultaneous peer connections.
 *
 * @see Issue #21 — T1.10 Performance guardrail: max 4 WebRTC
 */

import { create } from 'zustand'

// =============================================================================
// Constants
// =============================================================================

export const MAX_WEBRTC_CONNECTIONS = 4

// =============================================================================
// Types
// =============================================================================

export interface WebRTCConnectionEntry {
  cameraId: string
  connectedAt: number
}

export interface WebRTCConnectionState {
  /** Active WebRTC connections (keyed by cameraId) */
  connections: ReadonlyMap<string, WebRTCConnectionEntry>
}

export interface WebRTCConnectionActions {
  /** Try to acquire a connection slot. Returns true if acquired, false if at limit. */
  acquire: (cameraId: string) => boolean
  /** Release a connection slot. */
  release: (cameraId: string) => void
  /** Get number of active connections. */
  getActiveCount: () => number
  /** Check if at max limit. */
  isAtLimit: () => boolean
  /** Check if a new connection can be acquired. */
  canAcquire: () => boolean
  /** Get the oldest connection ID (FIFO eviction candidate). */
  getOldest: () => string | null
  /** Check if a specific camera has an active connection. */
  has: (cameraId: string) => boolean
  /** Reset all connections. */
  reset: () => void
}

// =============================================================================
// Store
// =============================================================================

export const useWebRTCConnectionStore = create<WebRTCConnectionState & WebRTCConnectionActions>(
  (set, get) => ({
    connections: new Map(),

    acquire: (cameraId: string): boolean => {
      const state = get()
      if (state.connections.has(cameraId)) return true // already acquired
      if (state.connections.size >= MAX_WEBRTC_CONNECTIONS) return false

      const next = new Map(state.connections)
      next.set(cameraId, { cameraId, connectedAt: Date.now() })
      set({ connections: next })
      return true
    },

    release: (cameraId: string): void => {
      const state = get()
      if (!state.connections.has(cameraId)) return
      const next = new Map(state.connections)
      next.delete(cameraId)
      set({ connections: next })
    },

    getActiveCount: () => get().connections.size,

    isAtLimit: () => get().connections.size >= MAX_WEBRTC_CONNECTIONS,

    canAcquire: () => get().connections.size < MAX_WEBRTC_CONNECTIONS,

    getOldest: (): string | null => {
      const entries = Array.from(get().connections.values())
      if (entries.length === 0) return null
      return entries.reduce((oldest, entry) =>
        entry.connectedAt < oldest.connectedAt ? entry : oldest
      ).cameraId
    },

    has: (cameraId: string) => get().connections.has(cameraId),

    reset: () => set({ connections: new Map() }),
  })
)

export type WebRTCConnectionStore = typeof useWebRTCConnectionStore
