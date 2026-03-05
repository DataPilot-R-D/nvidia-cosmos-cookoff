/**
 * Goal Marker Node Component
 *
 * Shows the navigation goal position and orientation.
 */

'use client'

import type { GoalMarkerData } from '../types'
import type { GoalPose } from '@/lib/stores/path-store'

interface GoalMarkerNodeProps {
  data: GoalMarkerData
}

const statusColors: Record<GoalPose['status'], string> = {
  pending: '#ffff00',
  navigating: '#ff00ff',
  reached: '#00ff00',
  failed: '#ff0000',
  canceled: '#888888',
}

export function GoalMarkerNode({ data }: GoalMarkerNodeProps) {
  const color = statusColors[data.status] || '#ff00ff'

  return (
    <div className="relative">
      {/* Goal marker */}
      <div
        className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
        style={{ borderColor: color, backgroundColor: `${color}33` }}
      >
        {/* Direction arrow */}
        <div
          className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[8px]"
          style={{
            borderBottomColor: color,
            transform: `rotate(${data.theta * (180 / Math.PI)}deg)`,
          }}
        />
      </div>
      {/* Label */}
      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span className="text-[8px] font-mono text-[#888888] bg-[#1a1a1a]/80 px-1 rounded uppercase">
          goal
        </span>
      </div>
    </div>
  )
}
