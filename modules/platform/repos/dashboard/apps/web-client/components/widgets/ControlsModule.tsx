/**
 * ControlsModule Component
 *
 * Robot control widget with joystick and command buttons.
 * Allows manual velocity control and sending commands.
 *
 * @see research-summary.md F6: Command & Control
 */

'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRobotStore } from '@/lib/stores/robot-store'
import { useCommandStore } from '@/lib/stores/command-store'
import { useWebSocketStore, sendTeleopCommandQueued } from '@/lib/stores/websocket-store'
import { usePanelRoutingStore } from '@/lib/stores/panel-routing-store'
import { usePermission } from '@/lib/hooks/use-permission'
import type { ModuleProps } from './ModuleRegistry'
import type { RobotStatus } from '@workspace/shared-types'

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

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Joystick control component
 */
function Joystick({
  disabled,
  onVelocityChange,
}: {
  disabled: boolean
  onVelocityChange: (linear: number, angular: number) => void
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  const handleMouseDown = useCallback(() => {
    if (!disabled) {
      setIsDragging(true)
    }
  }, [disabled])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setPosition({ x: 0, y: 0 })
    onVelocityChange(0, 0)
  }, [onVelocityChange])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isDragging || disabled) return

      const rect = e.currentTarget.getBoundingClientRect()
      const centerX = rect.width / 2
      const centerY = rect.height / 2
      const maxRadius = Math.min(centerX, centerY) - 10

      let x = e.clientX - rect.left - centerX
      let y = e.clientY - rect.top - centerY

      // Clamp to circle
      const distance = Math.sqrt(x * x + y * y)
      if (distance > maxRadius) {
        x = (x / distance) * maxRadius
        y = (y / distance) * maxRadius
      }

      setPosition({ x, y })

      // Convert to velocity (-1 to 1)
      const linear = -y / maxRadius
      const angular = -x / maxRadius
      onVelocityChange(linear, angular)
    },
    [isDragging, disabled, onVelocityChange]
  )

  return (
    <div
      data-testid="joystick-area"
      className={`
        relative w-24 h-24 rounded-full
        bg-[#1a1a1a] border-2 border-[#333333]
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-grab'}
        ${isDragging ? 'cursor-grabbing' : ''}
      `}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
    >
      {/* Center lines */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="absolute w-full h-[1px] bg-[#333333]" />
        <div className="absolute h-full w-[1px] bg-[#333333]" />
      </div>

      {/* Joystick knob */}
      <div
        className={`
          absolute w-8 h-8 rounded-full
          bg-gradient-to-b from-[#444444] to-[#222222]
          border border-[#555555]
          transform -translate-x-1/2 -translate-y-1/2
          transition-transform duration-75
        `}
        style={{
          left: `calc(50% + ${position.x}px)`,
          top: `calc(50% + ${position.y}px)`,
        }}
      >
        <div className="absolute inset-1 rounded-full bg-[#333333] opacity-50" />
      </div>
    </div>
  )
}

/**
 * Command button component
 */
function CommandButton({
  label,
  onClick,
  disabled,
  variant = 'default',
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'danger' | 'success'
}) {
  const baseClasses = `
    px-3 py-2 rounded text-[10px] font-mono uppercase tracking-wider
    transition-all duration-150 font-bold
    disabled:opacity-50 disabled:cursor-not-allowed
  `

  const variantClasses = {
    default: 'bg-[#333333] text-[#888888] hover:bg-[#444444] hover:text-[#aaaaaa]',
    danger: 'bg-[#ff0000]/20 text-[#ff0000] border border-[#ff0000]/50 hover:bg-[#ff0000]/30',
    success: 'bg-[#00ff00]/20 text-[#00ff00] border border-[#00ff00]/50 hover:bg-[#00ff00]/30',
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]}`}
    >
      {label}
    </button>
  )
}

/**
 * Robot selector dropdown
 */
function RobotSelector({
  robots,
  selectedId,
  onSelect,
}: {
  robots: Array<{ id: string; name: string; status: RobotStatus }>
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
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
 * Emergency stop indicator
 */
function EmergencyStopIndicator({ onResume }: { onResume: () => void }) {
  return (
    <div
      data-testid="emergency-stop-indicator"
      className="absolute inset-0 bg-[#ff0000]/20 flex flex-col items-center justify-center z-10"
    >
      <div className="text-center mb-4">
        <div className="text-[#ff0000] text-lg font-bold font-mono uppercase tracking-wider animate-pulse">
          EMERGENCY STOP
        </div>
        <div className="text-[#ff0000]/70 text-[10px] font-mono uppercase mt-1">
          All robots halted
        </div>
      </div>
      <button
        onClick={onResume}
        className="px-4 py-2 rounded bg-[#00ff00]/20 text-[#00ff00] border border-[#00ff00]/50
                   text-xs font-mono uppercase tracking-wider hover:bg-[#00ff00]/30"
      >
        Resume Operations
      </button>
    </div>
  )
}

// =============================================================================
// Main Module Component
// =============================================================================

export function ControlsModule({ windowId }: ModuleProps) {
  const canTeleop = usePermission('teleop')

  const robots = useRobotStore((state) => state.robots)
  const selectedRobotId = useCommandStore((state) => state.selectedRobotId)
  const emergencyStop = useCommandStore((state) => state.emergencyStop)
  const selectRobot = useCommandStore((state) => state.selectRobot)
  const enqueueCommand = useCommandStore((state) => state.enqueueCommand)
  const setEmergencyStop = useCommandStore((state) => state.setEmergencyStop)
  const setVelocity = useCommandStore((state) => state.setVelocity)
  const sendTeleopCommand = useWebSocketStore((state) => state.sendTeleopCommand)
  const wsStatus = useWebSocketStore((state) => state.status)

  // Get active topic from panel routing (dynamic routing)
  const activeTopic = usePanelRoutingStore((state) => state.panels['controls'])

  // Throttle teleop commands to 10Hz (100ms interval)
  const lastCommandTime = useRef(0)
  const COMMAND_INTERVAL = 100

  // Convert Map to array
  const robotList = useMemo(
    () =>
      Array.from(robots.values()).map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
      })),
    [robots]
  )

  // React to dynamic topic routing from TopicInspector
  useEffect(() => {
    if (activeTopic?.topicName) {
      // Extract robot ID from topic name (e.g., /robot0/cmd_vel -> robot0)
      const topicParts = activeTopic.topicName.split('/')
      if (topicParts.length > 2 && topicParts[1]) {
        const robotId = topicParts[1]
        // Select the robot if it exists
        if (robots.has(robotId)) {
          selectRobot(robotId)
        }
      }
    }
  }, [activeTopic, robots, selectRobot])

  // Auto-select first robot if none selected and no active topic
  useEffect(() => {
    if (robotList.length > 0 && !selectedRobotId && !activeTopic) {
      selectRobot(robotList[0].id)
    }
  }, [robotList, selectedRobotId, activeTopic, selectRobot])

  // Handle velocity change from joystick
  const handleVelocityChange = useCallback(
    (linear: number, angular: number) => {
      setVelocity({ linear, angular })

      // Throttle teleop commands to prevent flooding
      const now = Date.now()
      if (now - lastCommandTime.current >= COMMAND_INTERVAL) {
        lastCommandTime.current = now
        // Scale velocity to robot's max speed (e.g., 0.5 m/s linear, 1.0 rad/s angular)
        sendTeleopCommandQueued(linear * 0.5, angular * 1.0)
      }
    },
    [setVelocity]
  )

  // Command handlers
  const handleStop = useCallback(() => {
    // E-STOP: NEVER queue — if offline, alert operator for manual intervention
    if (wsStatus !== 'connected') {
      window.alert('NO CONNECTION - MANUAL INTERVENTION REQUIRED')
      return
    }
    sendTeleopCommand(0, 0)
    setEmergencyStop(true)
  }, [setEmergencyStop, sendTeleopCommand, wsStatus])

  const handleAuto = useCallback(() => {
    enqueueCommand({ action: 'patrol', priority: 'normal' })
  }, [enqueueCommand])

  const handleDock = useCallback(() => {
    enqueueCommand({ action: 'return_home', priority: 'normal' })
  }, [enqueueCommand])

  const handleResume = useCallback(() => {
    setEmergencyStop(false)
  }, [setEmergencyStop])

  const isRobotSelected = selectedRobotId !== null

  if (!canTeleop) {
    return (
      <div
        className="h-full w-full flex items-center justify-center bg-[#0a0a0a] p-3"
        data-testid={`module-controls-${windowId}`}
      >
        <div className="text-center text-white/40">
          <p className="text-sm font-medium">🔒 Controls Locked</p>
          <p className="text-xs mt-1">Your role does not have teleop permissions.</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="h-full w-full flex flex-col bg-[#0a0a0a] p-3 relative"
      data-testid={`module-controls-${windowId}`}
    >
      {/* Emergency Stop Overlay */}
      {emergencyStop && <EmergencyStopIndicator onResume={handleResume} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-[#666666] font-mono uppercase tracking-wider">
          Controls
        </span>
        {!isRobotSelected && (
          <span className="text-[9px] text-[#555555] font-mono">Select a robot</span>
        )}
      </div>

      {/* Robot Selector */}
      {robotList.length > 0 && (
        <div className="mb-3 pb-2 border-b border-[#222222]">
          <RobotSelector robots={robotList} selectedId={selectedRobotId} onSelect={selectRobot} />
        </div>
      )}

      {/* Main Controls Area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        {/* Joystick */}
        <Joystick
          disabled={!isRobotSelected || emergencyStop}
          onVelocityChange={handleVelocityChange}
        />

        {/* Command Buttons */}
        <div className="flex gap-2">
          <CommandButton
            label="Auto"
            onClick={handleAuto}
            disabled={!isRobotSelected || emergencyStop}
          />
          <CommandButton
            label="Dock"
            onClick={handleDock}
            disabled={!isRobotSelected || emergencyStop}
          />
          <CommandButton label="Stop" onClick={handleStop} variant="danger" />
        </div>
      </div>
    </div>
  )
}

export default ControlsModule
