/**
 * Goal Click Handler Component
 *
 * Captures clicks on the map for setting navigation goals.
 * Must be rendered inside ReactFlow to access screenToFlowPosition.
 */

'use client'

import { useCallback, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import { MAP_SCALE } from './types'

export interface GoalClickHandlerProps {
  enabled: boolean
  onPositionSelected: (x: number, y: number) => void
}

export function GoalClickHandler({ enabled, onPositionSelected }: GoalClickHandlerProps) {
  const { screenToFlowPosition } = useReactFlow()
  const containerRef = useRef<HTMLDivElement>(null)

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!enabled) return

      // Prevent default and stop propagation
      event.stopPropagation()

      // Convert screen coordinates to flow coordinates
      const flowPosition = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      // Convert flow coordinates to map coordinates (scale = 50, Y inverted)
      const mapX = flowPosition.x / MAP_SCALE
      const mapY = -flowPosition.y / MAP_SCALE

      onPositionSelected(mapX, mapY)
    },
    [enabled, screenToFlowPosition, onPositionSelected]
  )

  if (!enabled) return null

  // Overlay that captures clicks when goal setting mode is active
  // Premium design: subtle teal tint instead of magenta
  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="absolute inset-0 cursor-crosshair"
      style={{
        zIndex: 5,
        background: 'rgba(45, 212, 191, 0.03)', // Subtle teal tint
      }}
    />
  )
}
