/**
 * RobotStatusModule Component
 *
 * Live robot health monitoring widget.
 * Displays battery, status, position, and velocity for selected robot.
 *
 * @see research-summary.md F2: Real-time Robot Monitoring
 */

'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRobotStore } from '@/lib/stores/robot-store'
import type { ModuleProps } from './ModuleRegistry'
import type { RobotEntity, RobotStatus } from '@workspace/shared-types'

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get color for robot status
 */
function getStatusColor(status: RobotStatus): string {
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
 * Get CSS class for status background
 */
function getStatusBgClass(status: RobotStatus): string {
  switch (status) {
    case 'online':
      return 'bg-[#00ff00]'
    case 'offline':
      return 'bg-[#666666]'
    case 'patrol':
      return 'bg-[#00ffff]'
    case 'alert':
      return 'bg-[#ff0000]'
    case 'warning':
      return 'bg-[#ffaa00]'
    case 'idle':
      return 'bg-[#888888]'
    default:
      return 'bg-[#666666]'
  }
}

/**
 * Format time since last seen
 */
function formatLastSeen(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  if (diff < 1000) return 'Just now'
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Robot selector tabs
 */
function RobotSelector({
  robots,
  selectedId,
  onSelect,
}: {
  robots: RobotEntity[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1 mb-3 pb-2 border-b border-[#222222]">
      {robots.map((robot) => (
        <button
          key={robot.id}
          onClick={() => onSelect(robot.id)}
          className={`
            px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider
            transition-all duration-150
            ${
              selectedId === robot.id
                ? 'bg-[#00ffff]/20 text-[#00ffff] border border-[#00ffff]/50'
                : 'bg-[#1a1a1a] text-[#666666] border border-[#333333] hover:text-[#888888]'
            }
          `}
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
            style={{ backgroundColor: getStatusColor(robot.status) }}
          />
          {robot.name}
        </button>
      ))}
    </div>
  )
}

/**
 * Status badge component
 */
function StatusBadge({ status }: { status: RobotStatus }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[#666666] uppercase tracking-wider">Status</span>
      <div data-testid="status-badge" className={`px-2 py-0.5 rounded ${getStatusBgClass(status)}`}>
        <span className="text-[10px] text-black font-mono font-bold uppercase">
          {status.toUpperCase()}
        </span>
      </div>
    </div>
  )
}

/**
 * Battery indicator component
 */
function BatteryIndicator({ battery }: { battery: number }) {
  const isLow = battery <= 20
  const color = isLow ? '#ff0000' : '#00ff00'

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[#666666] uppercase tracking-wider">Battery</span>
      <div className="flex items-center gap-2">
        <div className="w-16 h-2 bg-[#333333] rounded-full overflow-hidden">
          <div
            data-testid="battery-bar"
            className="h-full transition-all duration-300"
            style={{
              width: `${battery}%`,
              backgroundColor: color,
            }}
          />
        </div>
        <span className={`text-xs font-mono ${isLow ? 'text-[#ff0000]' : 'text-[#00ff00]'}`}>
          {battery}%
        </span>
      </div>
    </div>
  )
}

/**
 * Position display component
 */
function PositionDisplay({ position }: { position: { x: number; y: number; z: number } }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
      <div className="flex flex-col">
        <span className="text-[9px] text-[#666666] uppercase">X:</span>
        <span className="text-[#00ffff]">{position.x.toFixed(2)}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[9px] text-[#666666] uppercase">Y:</span>
        <span className="text-[#00ffff]">{position.y.toFixed(2)}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-[9px] text-[#666666] uppercase">Z:</span>
        <span className="text-[#00ffff]">{position.z.toFixed(2)}</span>
      </div>
    </div>
  )
}

/**
 * Velocity display component
 */
function VelocityDisplay({ velocity }: { velocity: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[#666666] uppercase tracking-wider">Velocity</span>
      <span className="text-xs font-mono text-[#00ff00]">{velocity.toFixed(1)} m/s</span>
    </div>
  )
}

/**
 * Stats overlay
 */
function StatsOverlay({ robotCount }: { robotCount: number }) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-mono">
      <span className="text-[#666666]">FLEET</span>
      <span className="text-[#00ffff]">{robotCount}</span>
      <span className="text-[#666666]">robots</span>
    </div>
  )
}

// =============================================================================
// Main Module Component
// =============================================================================

export function RobotStatusModule({ windowId }: ModuleProps) {
  const robots = useRobotStore((state) => state.robots)
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null)

  // Convert Map to array
  const robotList = useMemo(() => Array.from(robots.values()), [robots])

  // Auto-select first robot when robots change
  useEffect(() => {
    if (robotList.length > 0 && !selectedRobotId) {
      setSelectedRobotId(robotList[0].id)
    } else if (robotList.length === 0) {
      setSelectedRobotId(null)
    }
  }, [robotList, selectedRobotId])

  // Get selected robot
  const selectedRobot = useMemo(() => {
    return selectedRobotId ? robots.get(selectedRobotId) : undefined
  }, [robots, selectedRobotId])

  return (
    <div
      className="h-full w-full flex flex-col bg-[#0a0a0a] p-3"
      data-testid={`module-robot-status-${windowId}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <StatsOverlay robotCount={robotList.length} />
        {selectedRobot && (
          <span className="text-[9px] text-[#555555] font-mono">
            {formatLastSeen(selectedRobot.lastSeen)}
          </span>
        )}
      </div>

      {/* Robot Selector */}
      {robotList.length > 0 && (
        <RobotSelector
          robots={robotList}
          selectedId={selectedRobotId}
          onSelect={setSelectedRobotId}
        />
      )}

      {/* Robot Details */}
      {selectedRobot ? (
        <div className="flex-1 flex flex-col gap-4">
          {/* Status & Battery Row */}
          <div className="flex items-center justify-between">
            <StatusBadge status={selectedRobot.status} />
            <BatteryIndicator battery={selectedRobot.battery} />
          </div>

          {/* Position */}
          <div>
            <span className="text-[10px] text-[#666666] uppercase tracking-wider block mb-1">
              Position
            </span>
            <PositionDisplay position={selectedRobot.position} />
          </div>

          {/* Velocity */}
          <VelocityDisplay velocity={selectedRobot.velocity} />

          {/* Additional Info */}
          {selectedRobot.model && (
            <div className="flex items-center gap-2 mt-auto pt-2 border-t border-[#222222]">
              <span className="text-[10px] text-[#666666] uppercase tracking-wider">Model</span>
              <span className="text-[10px] text-[#888888] font-mono">{selectedRobot.model}</span>
            </div>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 rounded-full border border-[#333333] flex items-center justify-center mx-auto mb-2">
              <span className="text-[#444444] text-xs">?</span>
            </div>
            <span className="text-[10px] text-[#555555] uppercase tracking-wider block">
              No robots connected
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default RobotStatusModule
