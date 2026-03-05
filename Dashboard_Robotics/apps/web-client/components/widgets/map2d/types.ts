/**
 * Map2D Module Types
 *
 * Shared types for Map2D visualization components.
 */

import type { RobotEntity } from '@workspace/shared-types'
import type { GoalPose } from '@/lib/stores/path-store'

// =============================================================================
// SLAM Graph Types
// =============================================================================

export interface SlamNode {
  id: number
  x: number
  y: number
  z: number
}

export interface SlamEdge {
  points: Array<{ x: number; y: number; z: number }>
}

export interface SlamGraphData {
  nodes: SlamNode[]
  edges: SlamEdge[]
  markerCount: number
}

// =============================================================================
// LiDAR and Trail Types
// =============================================================================

export interface LidarPoint {
  x: number
  y: number
  z: number
  intensity?: number
}

export interface LidarData {
  robotId: string
  points: LidarPoint[]
  pointCount: number
  frameId: string
}

export interface TrailPoint {
  x: number
  y: number
  timestamp: number
}

// =============================================================================
// Node Data Types (React Flow)
// =============================================================================

export interface RobotNodeData extends Record<string, unknown> {
  robot: RobotEntity
  isSelected: boolean
}

export interface WaypointNodeData extends Record<string, unknown> {
  index: number
  status: 'pending' | 'current' | 'reached'
  id: string
}

export interface SlamNodeData {
  nodeId: number
}

export interface TrailPointData {
  age: number
}

export interface PathPointData {
  isFirst: boolean
  isLast: boolean
}

export interface GoalMarkerData {
  status: GoalPose['status']
  theta: number
}

// =============================================================================
// Configuration
// =============================================================================

/** Maximum trail points to keep (memory management) */
export const MAX_TRAIL_POINTS = 100

/** Maximum LiDAR points to display (performance) */
export const MAX_LIDAR_DISPLAY = 500

/** Scale factor: 1 meter = 50 pixels */
export const MAP_SCALE = 50
