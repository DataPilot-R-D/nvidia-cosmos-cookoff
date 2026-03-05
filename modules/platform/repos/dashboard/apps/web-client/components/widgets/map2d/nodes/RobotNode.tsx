/**
 * Robot Node Component
 *
 * React Flow node representing a robot on the 2D map.
 * Features a pulsing halo effect for visibility on dark backgrounds.
 */

'use client'

import type { RobotNodeData } from '../types'
import { getStatusColor } from '../helpers'

interface RobotNodeProps {
  data: RobotNodeData
}

export function RobotNode({ data }: RobotNodeProps) {
  const { robot, isSelected } = data
  const statusColor = getStatusColor(robot.status)

  return (
    <div className="relative w-12 h-12 flex items-center justify-center">
      {/* Pulsing halo for visibility on dark background */}
      <div
        className="absolute inset-0 rounded-full animate-pulse"
        style={{
          backgroundColor: statusColor,
          opacity: 0.15,
          transform: 'scale(1.5)',
          filter: 'blur(8px)',
        }}
      />

      {/* Main robot container */}
      <div
        className={`
          relative w-12 h-12 rounded-full
          bg-[#1a1a1a] border-2
          flex items-center justify-center
          transition-all duration-200
          ${isSelected ? 'border-[#00ffff] ring-2 ring-[#00ffff]/30' : 'border-[#333333]'}
        `}
      >
        {/* Robot icon */}
        <div className="w-6 h-6 rounded-full" style={{ backgroundColor: statusColor }} />

        {/* Direction indicator */}
        <div
          className="absolute w-2 h-2 bg-[#00ff00] rounded-full"
          style={{
            top: '2px',
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        />

        {/* Label */}
        <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
          <span className="text-[8px] font-mono text-[#888888] bg-[#1a1a1a]/80 px-1 rounded">
            {robot.name ?? robot.id}
          </span>
        </div>

        {/* Battery indicator */}
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <div className="w-8 h-1.5 bg-[#333333] rounded-full overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${robot.battery}%`,
                backgroundColor: robot.battery > 20 ? '#00ff00' : '#ff0000',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
