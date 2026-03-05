/**
 * Costmap Store
 *
 * Zustand store for managing OccupancyGrid data from ROS.
 * Handles /map_volatile, /map, /global_costmap/costmap, /local_costmap/costmap topics.
 */

import { create } from 'zustand'

// =============================================================================
// Types
// =============================================================================

/**
 * Origin pose for the occupancy grid
 */
export interface GridOrigin {
  x: number
  y: number
  z: number
  orientation: {
    x: number
    y: number
    z: number
    w: number
  }
}

/**
 * OccupancyGrid data structure
 */
export interface OccupancyGridData {
  /** ROS topic name */
  topic: string
  /** Frame ID (usually 'map') */
  frameId: string
  /** Grid width in cells */
  width: number
  /** Grid height in cells */
  height: number
  /** Resolution in meters per cell */
  resolution: number
  /** Origin pose of the grid */
  origin: GridOrigin
  /** Grid data as base64 encoded int8 array */
  data: string
  /** Timestamp when received */
  timestamp: number
  /** Decoded data cache (lazy loaded) */
  decodedData?: Int8Array
}

/**
 * Costmap store state
 */
interface CostmapState {
  /** Grids by topic name */
  grids: Map<string, OccupancyGridData>
  /** Last update timestamp */
  lastUpdated: number | null
  /** Active topic for visualization */
  activeTopic: string | null
}

/**
 * Costmap store actions
 */
interface CostmapActions {
  /** Add or update a grid */
  addGrid: (data: OccupancyGridData) => void
  /** Get grid by topic */
  getGrid: (topic: string) => OccupancyGridData | undefined
  /** Get all grids */
  getAllGrids: () => OccupancyGridData[]
  /** Set active topic for visualization */
  setActiveTopic: (topic: string | null) => void
  /** Clear all grids */
  clearGrids: () => void
  /** Decode grid data to Int8Array */
  decodeGridData: (topic: string) => Int8Array | null
  /** Select main map (priority: /map > /global_costmap > first) */
  selectMainMap: () => OccupancyGridData | undefined
  /** Select local costmap */
  selectLocalCostmap: () => OccupancyGridData | undefined
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useCostmapStore = create<CostmapState & CostmapActions>((set, get) => ({
  // Initial state
  grids: new Map(),
  lastUpdated: null,
  activeTopic: null,

  // Actions
  addGrid: (data: OccupancyGridData) => {
    set((state) => {
      const newGrids = new Map(state.grids)
      // MEMORY FIX: Explicitly clear decodedData cache when new grid arrives
      // This prevents stale decoded cache from coexisting with new base64 data
      newGrids.set(data.topic, {
        ...data,
        timestamp: Date.now(),
        decodedData: undefined, // Clear stale cache
      })

      // Auto-set active topic if none
      const activeTopic = state.activeTopic || data.topic

      return {
        grids: newGrids,
        lastUpdated: Date.now(),
        activeTopic,
      }
    })
  },

  getGrid: (topic: string) => {
    return get().grids.get(topic)
  },

  getAllGrids: () => {
    return Array.from(get().grids.values())
  },

  setActiveTopic: (topic: string | null) => {
    set({ activeTopic: topic })
  },

  clearGrids: () => {
    set({
      grids: new Map(),
      lastUpdated: null,
      activeTopic: null,
    })
  },

  decodeGridData: (topic: string) => {
    const state = get()
    const grid = state.grids.get(topic)

    if (!grid) return null

    // Return cached if available
    if (grid.decodedData) return grid.decodedData

    // Decode base64 to Int8Array
    try {
      const binaryStr = atob(grid.data)
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      // Convert to Int8Array (values are -1 to 100)
      const decoded = new Int8Array(bytes.buffer)

      // Cache the decoded data
      set((state) => {
        const newGrids = new Map(state.grids)
        const existing = newGrids.get(topic)
        if (existing) {
          newGrids.set(topic, { ...existing, decodedData: decoded })
        }
        return { grids: newGrids }
      })

      return decoded
    } catch (error) {
      console.error('Failed to decode grid data:', error)
      return null
    }
  },

  selectMainMap: () => {
    const { grids } = get()
    // Priority: /map_volatile > /map_live > /slam_toolbox/map > /map > /global_costmap > first available
    return (
      grids.get('/map_volatile') ||
      grids.get('/map_live') ||
      grids.get('/slam_toolbox/map') ||
      grids.get('/map') ||
      grids.get('/global_costmap/costmap') ||
      grids.values().next().value
    )
  },

  selectLocalCostmap: () => {
    const { grids } = get()
    return grids.get('/local_costmap/costmap')
  },
}))

// =============================================================================
// Selectors
// =============================================================================

/**
 * Select the active/main map grid
 */
export const selectMainMap = () => {
  const { grids } = useCostmapStore.getState()
  // Priority: /map_volatile > /map_live > /slam_toolbox/map > /map > /global_costmap > first available
  return (
    grids.get('/map_volatile') ||
    grids.get('/map_live') ||
    grids.get('/slam_toolbox/map') ||
    grids.get('/map') ||
    grids.get('/global_costmap/costmap') ||
    grids.values().next().value
  )
}

export type CostmapStore = typeof useCostmapStore
