/**
 * RobotWidget Component
 *
 * Displays robot fleet status from the Zustand store.
 * Designed as a grid item for React Grid Layout dashboard.
 *
 * Design References (Pencil):
 * - Container: card-tactical #2A2A2A bg, #555555 border, 2px radius
 * - Title: 38GXX (Label/Large) - Inter 9px, 600 weight, tracking 1px, uppercase
 * - Status dots: IgHwB (white #FFF), NL1ey (gray #888), 4lur6 (red #FF0000)
 * - Accent: #8B6F47 (orange/gold) for active states
 * - Text: 7px labels, 6px values, Inter font
 *
 * @see plan.md Step 5: Robot Status Widget
 */

'use client'

import { forwardRef, useMemo, type CSSProperties, type HTMLAttributes } from 'react'
import { useRobotStore } from '@/lib/stores/robot-store'
import type { RobotEntity, RobotStatus } from '@workspace/shared-types'

// =============================================================================
// Types
// =============================================================================

export interface RobotWidgetProps extends HTMLAttributes<HTMLDivElement> {
  /** Additional className for grid layout integration */
  className?: string
  /** Style object for grid positioning */
  style?: CSSProperties
}

export interface RobotCardProps {
  robot: RobotEntity
}

// =============================================================================
// Constants - Pencil Design System
// =============================================================================

const STATUS_CLASS_MAP: Record<RobotStatus, string> = {
  online: 'status-online',
  offline: 'status-offline',
  patrol: 'status-patrol',
  idle: 'status-idle',
  alert: 'status-alert',
  warning: 'status-warning',
}

const STATUS_LABEL_MAP: Record<RobotStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  patrol: 'Patrol',
  idle: 'Idle',
  alert: 'Alert',
  warning: 'Warning',
}

// =============================================================================
// Helper Functions
// =============================================================================

function getBatteryColor(battery: number): string {
  if (battery < 20) return 'text-[#FF0000]'
  if (battery < 40) return 'text-[#FFAA00]'
  return 'text-[#CCCCCC]'
}

function formatLastSeen(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (seconds < 60) return `${seconds}s`
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  return new Date(timestamp).toLocaleDateString()
}

// =============================================================================
// Sub-components - Pencil Design Style
// =============================================================================

/**
 * Individual robot row - Command Center readable display
 * Responsive: stacks on small widths, horizontal on large
 */
function RobotCard({ robot }: RobotCardProps) {
  const statusClass = STATUS_CLASS_MAP[robot.status]
  const statusLabel = STATUS_LABEL_MAP[robot.status]
  const batteryColor = getBatteryColor(robot.battery)

  return (
    <div
      className="flex flex-col gap-2 py-3 px-4 rounded bg-[#1A1A1A] border border-[#333333] hover:border-[#555555] transition-colors"
      data-testid={`robot-card-${robot.id}`}
    >
      {/* Top Row: Status + Name + Status Label */}
      <div className="flex items-center gap-3">
        <span
          className={`status-indicator-lg flex-shrink-0 ${statusClass}`}
          data-testid={`status-indicator-${robot.id}`}
          aria-label={`Status: ${statusLabel}`}
        />
        <span className="text-base font-semibold text-white truncate flex-1">{robot.name}</span>
        <span
          className="text-sm text-[#888888] uppercase tracking-wider flex-shrink-0"
          data-testid={`status-text-${robot.id}`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Bottom Row: Stats */}
      <div className="flex items-center justify-between text-sm font-mono pl-7">
        {/* Battery - prominent */}
        <span className={`text-base font-bold ${batteryColor}`} data-testid={`battery-${robot.id}`}>
          {robot.battery}%
        </span>

        {/* Position */}
        <span className="text-[#888888]">
          {robot.position.x.toFixed(1)}, {robot.position.y.toFixed(1)}
        </span>

        {/* Velocity */}
        <span className="text-[#888888]">{robot.velocity.toFixed(1)}m/s</span>

        {/* Last Seen */}
        <span className="text-[#666666]" data-testid={`last-seen-${robot.id}`}>
          {formatLastSeen(robot.lastSeen)}
        </span>
      </div>
    </div>
  )
}

/**
 * Empty state - Command Center readable
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-8">
      <div className="w-16 h-16 rounded-full border-2 border-[#333333] flex items-center justify-center mb-4">
        <span className="status-indicator-lg status-offline" />
      </div>
      <p className="text-lg font-semibold text-[#666666] tracking-wider uppercase">
        No robots connected
      </p>
      <p className="text-base mt-2 text-[#555555]">Waiting for telemetry...</p>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * RobotWidget - Robot fleet status display
 *
 * Grid-ready component:
 * - Accepts className and style for React Grid Layout
 * - Uses forwardRef for grid item refs
 * - Full height/width to fill grid cell
 *
 * Pencil Design System styling:
 * - Card: #2A2A2A background, #555555 border, 2px radius
 * - Title: 9px Inter, 600 weight, 1px tracking, uppercase
 * - Content: 7px for labels, 6px for values
 */
export const RobotWidget = forwardRef<HTMLDivElement, RobotWidgetProps>(function RobotWidget(
  { className = '', style, ...props },
  ref
) {
  const robotsMap = useRobotStore((state) => state.robots)
  const robots = useMemo(() => Array.from(robotsMap.values()), [robotsMap])
  const hasRobots = robots.length > 0
  const activeCount = robots.filter((r) => r.status !== 'offline').length

  return (
    <div
      ref={ref}
      className={`card-tactical h-full w-full flex flex-col overflow-hidden ${className}`}
      style={style}
      data-testid="robot-widget"
      role="region"
      aria-label="Robot Status"
      {...props}
    >
      {/* Widget Header - Drag Handle */}
      <div className="widget-drag-handle flex items-center justify-between px-4 py-3 border-b border-[#333333] cursor-move select-none">
        <h2 className="text-tactical-label">Robot Status</h2>
        {hasRobots && (
          <span className="text-sm text-[#888888] tracking-wider uppercase">
            {activeCount}/{robots.length} ACTIVE
          </span>
        )}
      </div>

      {/* Robot List - Scrollable */}
      <div className="flex-1 overflow-auto p-4">
        {hasRobots ? (
          <div className="space-y-3">
            {robots.map((robot) => (
              <RobotCard key={robot.id} robot={robot} />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Footer Stats */}
      {hasRobots && (
        <div className="px-4 py-3 border-t border-[#333333] flex justify-between">
          <span className="text-sm text-[#666666]">Total: {robots.length}</span>
          <span className="text-sm text-[#666666]">Active: {activeCount}</span>
        </div>
      )}
    </div>
  )
})

// Default export for convenience
export default RobotWidget
