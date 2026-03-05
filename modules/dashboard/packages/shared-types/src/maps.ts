/**
 * Map Management Types
 *
 * Types for map lifecycle management: save, load, SLAM/MapServer mode switching.
 *
 * @module @workspace/shared-types/maps
 */

import { z } from 'zod'

// =============================================================================
// Map Manager Mode
// =============================================================================

/**
 * Map manager operating mode
 * - 'slam': SLAM Toolbox is running (exploration/mapping)
 * - 'map_server': Nav2 MapServer is running (using saved map)
 * - 'none': No mapping process running
 */
export type MapManagerMode = 'slam' | 'map_server' | 'none'

export const MapManagerModeSchema = z.enum(['slam', 'map_server', 'none'])

// =============================================================================
// Map Loading Status
// =============================================================================

/**
 * Map loading status
 */
export type MapLoadingStatus = 'idle' | 'loading' | 'success' | 'error'

export const MapLoadingStatusSchema = z.enum(['idle', 'loading', 'success', 'error'])

// =============================================================================
// Socket.IO Events
// =============================================================================

/**
 * Map status message (broadcast when loading state changes)
 */
export interface MapStatusMessage {
  type: 'map_status'
  timestamp: number
  data: {
    mapId: string | null
    status: MapLoadingStatus
    progress?: number
    error?: string
    message?: string
  }
}

export const MapStatusMessageSchema = z.object({
  type: z.literal('map_status'),
  timestamp: z.number(),
  data: z.object({
    mapId: z.string().nullable(),
    status: MapLoadingStatusSchema,
    progress: z.number().optional(),
    error: z.string().optional(),
    message: z.string().optional(),
  }),
})

/**
 * Map mode changed message (broadcast when switching SLAM/MapServer)
 */
export interface MapModeChangedMessage {
  type: 'map_mode_changed'
  timestamp: number
  data: {
    mode: MapManagerMode
    mapId?: string
    mapName?: string
  }
}

export const MapModeChangedMessageSchema = z.object({
  type: z.literal('map_mode_changed'),
  timestamp: z.number(),
  data: z.object({
    mode: MapManagerModeSchema,
    mapId: z.string().optional(),
    mapName: z.string().optional(),
  }),
})

// =============================================================================
// Client -> Server Events
// =============================================================================

/**
 * Request to load a map into Nav2
 */
export interface LoadMapToNav2Request {
  mapId: string
}

export const LoadMapToNav2RequestSchema = z.object({
  mapId: z.string(),
})

/**
 * Request to start SLAM (kills MapServer if running)
 */
export interface StartSlamRequest {
  // No parameters needed
}

export const StartSlamRequestSchema = z.object({})

// =============================================================================
// Validation Helpers
// =============================================================================

export function parseMapStatusMessage(data: unknown): MapStatusMessage | null {
  const result = MapStatusMessageSchema.safeParse(data)
  return result.success ? result.data : null
}

export function parseMapModeChangedMessage(data: unknown): MapModeChangedMessage | null {
  const result = MapModeChangedMessageSchema.safeParse(data)
  return result.success ? result.data : null
}

export function parseLoadMapToNav2Request(data: unknown): LoadMapToNav2Request | null {
  const result = LoadMapToNav2RequestSchema.safeParse(data)
  return result.success ? result.data : null
}
