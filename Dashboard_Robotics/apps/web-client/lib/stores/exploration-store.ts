/**
 * Exploration Store
 *
 * Zustand store for managing autonomous exploration state.
 * Handles exploration status, frontiers, and saved maps.
 *
 * @see Plan: Automatyczne Skanowanie Przestrzeni
 */

import { create } from 'zustand'
import type { Frontier } from '../utils/frontier-detection'
import { useCostmapStore } from './costmap-store'

// =============================================================================
// Types
// =============================================================================

/**
 * Exploration status
 */
export type ExplorationStatus = 'idle' | 'exploring' | 'paused' | 'complete' | 'error'

/**
 * Map manager operating mode
 */
export type MapManagerMode = 'slam' | 'map_server' | 'none'

/**
 * Map loading status
 */
export type MapLoadingStatus = 'idle' | 'loading' | 'success' | 'error'

/**
 * Saved map metadata
 */
export interface SavedMapMetadata {
  id: string
  name: string
  width: number
  height: number
  resolution: number
  createdAt: number
  robotId?: string
  exploredPercent?: number
  /** Base64 encoded PNG thumbnail */
  thumbnail?: string | null
}

/**
 * Exploration state
 */
interface ExplorationState {
  /** Current exploration status */
  status: ExplorationStatus
  /** Current waypoint index (1-based for display) */
  currentWaypoint: number
  /** Total waypoints to visit */
  totalWaypoints: number
  /** Detected frontier points */
  frontiers: Frontier[]
  /** Current exploration target */
  currentTarget: Frontier | null
  /** Percentage of map explored */
  exploredPercent: number
  /** List of saved maps */
  savedMaps: SavedMapMetadata[]
  /** Currently loaded map ID */
  loadedMapId: string | null
  /** Error message if status is 'error' */
  errorMessage: string | null
  /** Timestamp when exploration started */
  startedAt: number | null
  /** Accumulated 3D points for full map visualization */
  accumulatedPointCount: number
  /** Current map manager mode (SLAM vs MapServer) */
  mapServerMode: MapManagerMode
  /** Map loading status */
  mapLoadingStatus: MapLoadingStatus
  /** Map loading error message */
  mapLoadingError: string | null
  /** Map loading progress message */
  mapLoadingMessage: string | null
}

/**
 * Exploration actions
 */
interface ExplorationActions {
  /** Start autonomous exploration */
  startExploration: () => void
  /** Stop exploration */
  stopExploration: () => void
  /** Pause exploration */
  pauseExploration: () => void
  /** Resume exploration */
  resumeExploration: () => void
  /** Update frontiers from map analysis */
  updateFrontiers: (frontiers: Frontier[]) => void
  /** Set current exploration target */
  setCurrentTarget: (target: Frontier | null) => void
  /** Update exploration progress */
  updateProgress: (current: number, total: number) => void
  /** Update explored percentage */
  setExploredPercent: (percent: number) => void
  /** Set exploration status */
  setStatus: (status: ExplorationStatus, errorMessage?: string) => void
  /** Load saved maps list from backend */
  loadSavedMaps: () => Promise<void>
  /** Save current map to backend */
  saveCurrentMap: (name: string) => Promise<string | null>
  /** Load a saved map into Nav2 (via WebSocket) */
  loadMapToNav2: (mapId: string) => void
  /** Start SLAM mode (via WebSocket) */
  startSlam: () => void
  /** Legacy: Load a saved map (HTTP only) */
  loadMap: (mapId: string) => Promise<boolean>
  /** Delete a saved map */
  deleteMap: (mapId: string) => Promise<boolean>
  /** Set loaded map ID */
  setLoadedMapId: (mapId: string | null) => void
  /** Update accumulated point count */
  setAccumulatedPointCount: (count: number) => void
  /** Set map server mode */
  setMapServerMode: (mode: MapManagerMode, mapId?: string | null) => void
  /** Set map loading status */
  setMapLoadingStatus: (
    status: MapLoadingStatus,
    message?: string | null,
    error?: string | null
  ) => void
  /** Reset exploration state */
  reset: () => void
}

// =============================================================================
// Initial State
// =============================================================================

const initialState: ExplorationState = {
  status: 'idle',
  currentWaypoint: 0,
  totalWaypoints: 0,
  frontiers: [],
  currentTarget: null,
  exploredPercent: 0,
  savedMaps: [],
  loadedMapId: null,
  errorMessage: null,
  startedAt: null,
  accumulatedPointCount: 0,
  mapServerMode: 'none',
  mapLoadingStatus: 'idle',
  mapLoadingError: null,
  mapLoadingMessage: null,
}

// =============================================================================
// API Configuration
// =============================================================================

function getApiBase(): string {
  // Preferred explicit config
  const envBase = process.env.NEXT_PUBLIC_API_BASE
  if (envBase) return envBase.replace(/\/$/, '')

  // Client-side fallback: assume API lives on the same host (tinybox/tailscale)
  // and websocket-server is on :8081.
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `http://${window.location.hostname}:8081/api`
  }

  // SSR / tests fallback
  return 'http://localhost:8081/api'
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useExplorationStore = create<ExplorationState & ExplorationActions>((set, get) => ({
  ...initialState,

  startExploration: () => {
    set({
      status: 'exploring',
      currentWaypoint: 0,
      totalWaypoints: 0,
      errorMessage: null,
      startedAt: Date.now(),
    })
  },

  stopExploration: () => {
    set({
      status: 'idle',
      currentTarget: null,
      startedAt: null,
    })
  },

  pauseExploration: () => {
    const { status } = get()
    if (status === 'exploring') {
      set({ status: 'paused' })
    }
  },

  resumeExploration: () => {
    const { status } = get()
    if (status === 'paused') {
      set({ status: 'exploring' })
    }
  },

  updateFrontiers: (frontiers: Frontier[]) => {
    set({ frontiers })
  },

  setCurrentTarget: (target: Frontier | null) => {
    set({ currentTarget: target })
  },

  updateProgress: (current: number, total: number) => {
    set({
      currentWaypoint: current,
      totalWaypoints: total,
    })
  },

  setExploredPercent: (percent: number) => {
    set({ exploredPercent: Math.round(percent * 10) / 10 })
  },

  setStatus: (status: ExplorationStatus, errorMessage?: string) => {
    set({
      status,
      errorMessage: errorMessage ?? null,
      ...(status === 'complete' ? { currentTarget: null } : {}),
    })
  },

  loadSavedMaps: async () => {
    try {
      const response = await fetch(`${getApiBase()}/maps`)
      if (!response.ok) {
        throw new Error(`Failed to load maps: ${response.statusText}`)
      }
      const data = await response.json()
      set({ savedMaps: data.maps || [] })
    } catch (error) {
      set({ savedMaps: [] })
    }
  },

  saveCurrentMap: async (name: string) => {
    try {
      // Get current map data from costmap store
      const mainMap = useCostmapStore.getState().selectMainMap()

      if (!mainMap) {
        console.error('No map data available to save')
        return null
      }

      const { exploredPercent } = get()

      const response = await fetch(`${getApiBase()}/maps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          width: mainMap.width,
          height: mainMap.height,
          resolution: mainMap.resolution,
          originX: mainMap.origin.x,
          originY: mainMap.origin.y,
          frameId: mainMap.frameId,
          data: mainMap.data, // base64 encoded
          exploredPercent,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to save map: ${response.statusText}`)
      }

      const data = await response.json()

      // Refresh maps list
      await get().loadSavedMaps()

      return data.id
    } catch (error) {
      console.error('Failed to save map:', error)
      return null
    }
  },

  loadMapToNav2: (_mapId: string) => {
    // This will be called via WebSocket from use-websocket.ts
    // The actual socket.emit is handled in the hook
    set({
      mapLoadingStatus: 'loading',
      mapLoadingError: null,
      mapLoadingMessage: 'Sending load request...',
    })
  },

  startSlam: () => {
    // This will be called via WebSocket from use-websocket.ts
    // The actual socket.emit is handled in the hook
    set({
      mapLoadingStatus: 'loading',
      mapLoadingError: null,
      mapLoadingMessage: 'Starting SLAM...',
    })
  },

  loadMap: async (mapId: string) => {
    try {
      const response = await fetch(`${getApiBase()}/maps/${mapId}`)
      if (!response.ok) {
        throw new Error(`Failed to load map: ${response.statusText}`)
      }

      set({ loadedMapId: mapId })
      return true
    } catch (error) {
      return false
    }
  },

  deleteMap: async (mapId: string) => {
    try {
      const response = await fetch(`${getApiBase()}/maps/${mapId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(`Failed to delete map: ${response.statusText}`)
      }

      // Refresh maps list
      await get().loadSavedMaps()

      // Clear loaded map if it was deleted
      if (get().loadedMapId === mapId) {
        set({ loadedMapId: null })
      }

      return true
    } catch (error) {
      return false
    }
  },

  setLoadedMapId: (mapId: string | null) => {
    set({ loadedMapId: mapId })
  },

  setAccumulatedPointCount: (count: number) => {
    set({ accumulatedPointCount: count })
  },

  setMapServerMode: (mode: MapManagerMode, mapId?: string | null) => {
    set({
      mapServerMode: mode,
      loadedMapId: mapId ?? null,
    })
  },

  setMapLoadingStatus: (
    status: MapLoadingStatus,
    message?: string | null,
    error?: string | null
  ) => {
    set({
      mapLoadingStatus: status,
      mapLoadingMessage: message ?? null,
      mapLoadingError: error ?? null,
    })
  },

  reset: () => {
    set(initialState)
  },
}))
