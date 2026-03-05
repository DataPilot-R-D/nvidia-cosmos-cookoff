/**
 * Map Store
 *
 * Zustand store for 2D map state management.
 * Handles waypoints, zones, robot selection, and viewport state.
 *
 * @see research-summary.md Section 1: React Flow
 */

import { create } from 'zustand'

// =============================================================================
// Types
// =============================================================================

/**
 * Waypoint type
 */
export type WaypointType = 'patrol' | 'charger' | 'checkpoint' | 'custom'

/**
 * Zone type
 */
export type ZoneType = 'patrol' | 'restricted' | 'safe' | 'alert'

/**
 * Waypoint entity
 */
export interface Waypoint {
  id: string
  x: number
  y: number
  name: string
  type: WaypointType
}

/**
 * Zone entity
 */
export interface Zone {
  id: string
  x: number
  y: number
  width: number
  height: number
  name: string
  type: ZoneType
}

/**
 * 2D Position
 */
export interface Position2D {
  x: number
  y: number
}

/**
 * Map store state
 */
interface MapState {
  /** Waypoints by ID */
  waypoints: Map<string, Waypoint>
  /** Zones by ID */
  zones: Map<string, Zone>
  /** Currently selected robot ID */
  selectedRobotId: string | null
  /** Viewport center position */
  viewportCenter: Position2D
  /** Viewport zoom level */
  viewportZoom: number
  /** Show grid overlay */
  showGrid: boolean
  /** Show robot trails */
  showTrails: boolean
}

/**
 * Map store actions
 */
interface MapActions {
  // Waypoint actions
  addWaypoint: (waypoint: Waypoint) => void
  removeWaypoint: (id: string) => void
  updateWaypoint: (id: string, updates: Partial<Waypoint>) => void
  getWaypoint: (id: string) => Waypoint | undefined
  getAllWaypoints: () => Waypoint[]

  // Zone actions
  addZone: (zone: Zone) => void
  removeZone: (id: string) => void
  getZone: (id: string) => Zone | undefined
  getAllZones: () => Zone[]

  // Selection actions
  selectRobot: (robotId: string | null) => void

  // Viewport actions
  setViewportCenter: (center: Position2D) => void
  setViewportZoom: (zoom: number) => void
  setShowGrid: (show: boolean) => void
  setShowTrails: (show: boolean) => void
}

// =============================================================================
// Store Implementation
// =============================================================================

/**
 * Map Store
 *
 * Manages 2D map state for robot visualization.
 */
export const useMapStore = create<MapState & MapActions>((set, get) => ({
  // Initial state
  waypoints: new Map(),
  zones: new Map(),
  selectedRobotId: null,
  viewportCenter: { x: 0, y: 0 },
  viewportZoom: 1,
  showGrid: true,
  showTrails: false,

  // Waypoint actions
  addWaypoint: (waypoint: Waypoint) => {
    set((state) => {
      const newWaypoints = new Map(state.waypoints)
      newWaypoints.set(waypoint.id, waypoint)
      return { waypoints: newWaypoints }
    })
  },

  removeWaypoint: (id: string) => {
    set((state) => {
      const newWaypoints = new Map(state.waypoints)
      newWaypoints.delete(id)
      return { waypoints: newWaypoints }
    })
  },

  updateWaypoint: (id: string, updates: Partial<Waypoint>) => {
    set((state) => {
      const newWaypoints = new Map(state.waypoints)
      const existing = newWaypoints.get(id)
      if (existing) {
        newWaypoints.set(id, { ...existing, ...updates })
      }
      return { waypoints: newWaypoints }
    })
  },

  getWaypoint: (id: string) => {
    return get().waypoints.get(id)
  },

  getAllWaypoints: () => {
    return Array.from(get().waypoints.values())
  },

  // Zone actions
  addZone: (zone: Zone) => {
    set((state) => {
      const newZones = new Map(state.zones)
      newZones.set(zone.id, zone)
      return { zones: newZones }
    })
  },

  removeZone: (id: string) => {
    set((state) => {
      const newZones = new Map(state.zones)
      newZones.delete(id)
      return { zones: newZones }
    })
  },

  getZone: (id: string) => {
    return get().zones.get(id)
  },

  getAllZones: () => {
    return Array.from(get().zones.values())
  },

  // Selection actions
  selectRobot: (robotId: string | null) => {
    set({ selectedRobotId: robotId })
  },

  // Viewport actions
  setViewportCenter: (center: Position2D) => {
    set({ viewportCenter: center })
  },

  setViewportZoom: (zoom: number) => {
    set({ viewportZoom: zoom })
  },

  setShowGrid: (show: boolean) => {
    set({ showGrid: show })
  },

  setShowTrails: (show: boolean) => {
    set({ showTrails: show })
  },
}))
