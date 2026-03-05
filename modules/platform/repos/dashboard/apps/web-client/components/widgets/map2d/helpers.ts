/**
 * Map2D Helper Functions
 *
 * Utility functions for map coordinate transformations and styling.
 */

import type { Node } from '@xyflow/react'
import type { RobotEntity } from '@workspace/shared-types'
import type { RobotNodeData } from './types'
import { MAP_SCALE } from './types'

/**
 * Get status color for robot visualization
 */
export function getStatusColor(status: RobotEntity['status']): string {
  switch (status) {
    case 'online':
      return '#00ff00'
    case 'offline':
      return '#666666'
    case 'patrol':
      return '#00ffff'
    case 'alert':
      return '#ff0000'
    case 'warning':
      return '#ffaa00'
    case 'idle':
      return '#888888'
    default:
      return '#666666'
  }
}

/**
 * Convert robot position to React Flow node
 */
export function robotToNode(robot: RobotEntity, isSelected: boolean): Node<RobotNodeData> {
  return {
    id: `robot-${robot.id}`,
    type: 'robot',
    position: {
      x: robot.position.x * MAP_SCALE,
      y: -robot.position.y * MAP_SCALE, // Invert Y for screen coordinates
    },
    data: { robot, isSelected },
    draggable: false,
  }
}
