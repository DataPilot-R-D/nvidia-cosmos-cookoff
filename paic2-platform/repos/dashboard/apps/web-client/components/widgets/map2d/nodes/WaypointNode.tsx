/**
 * Waypoint Node Component
 *
 * React Flow node for patrol waypoints.
 */

'use client'

import type { WaypointNodeData } from '../types'

interface WaypointNodeProps {
  data: WaypointNodeData
}

export function WaypointNode({ data }: WaypointNodeProps) {
  const colors: Record<WaypointNodeData['status'], string> = {
    pending: '#888888',
    current: '#ff00ff',
    reached: '#00ff00',
  }
  const color = colors[data.status] || '#888888'

  return (
    <div className="relative">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2"
        style={{
          backgroundColor: `${color}33`,
          borderColor: color,
          color: color,
        }}
      >
        {data.index + 1}
      </div>
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span className="text-[7px] font-mono text-[#666666] uppercase">wp</span>
      </div>
    </div>
  )
}
