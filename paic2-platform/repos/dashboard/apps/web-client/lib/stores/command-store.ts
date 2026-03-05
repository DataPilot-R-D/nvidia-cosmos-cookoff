/**
 * Command Store
 *
 * Zustand store for robot command queue management.
 * Handles command queueing, execution status, and joystick velocity.
 *
 * @see research-summary.md F6: Command & Control
 */

import { create } from 'zustand'
import type { CommandAction } from '@workspace/shared-types'

// =============================================================================
// Types
// =============================================================================

/**
 * Command status
 */
export type CommandStatus = 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled'

/**
 * Queued command entity
 */
export interface QueuedCommand {
  id: string
  robotId: string
  action: CommandAction
  params?: Record<string, unknown>
  priority: 'low' | 'normal' | 'high' | 'critical'
  status: CommandStatus
  createdAt: number
  executedAt?: number
  completedAt?: number
  error?: string
}

/**
 * Velocity state for joystick control
 */
export interface VelocityState {
  linear: number // Forward/backward velocity (-1 to 1)
  angular: number // Rotational velocity (-1 to 1)
}

/**
 * Command store state
 */
interface CommandState {
  /** Queue of pending commands */
  commandQueue: QueuedCommand[]
  /** Currently executing command */
  pendingCommand: QueuedCommand | null
  /** Selected robot ID for commands */
  selectedRobotId: string | null
  /** Emergency stop flag */
  emergencyStop: boolean
  /** Current joystick velocity */
  velocity: VelocityState
}

/**
 * Command store actions
 */
interface CommandActions {
  // Robot selection
  selectRobot: (robotId: string | null) => void

  // Command queue
  enqueueCommand: (command: {
    action: CommandAction
    params?: Record<string, unknown>
    priority?: 'low' | 'normal' | 'high' | 'critical'
  }) => void
  updateCommandStatus: (commandId: string, status: CommandStatus, error?: string) => void
  clearQueue: () => void

  // Emergency stop
  setEmergencyStop: (active: boolean) => void

  // Velocity control
  setVelocity: (velocity: VelocityState) => void
  resetVelocity: () => void
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Generate unique command ID
 */
function generateCommandId(): string {
  return `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useCommandStore = create<CommandState & CommandActions>((set, get) => ({
  // Initial state
  commandQueue: [],
  pendingCommand: null,
  selectedRobotId: null,
  emergencyStop: false,
  velocity: { linear: 0, angular: 0 },

  // Robot selection
  selectRobot: (robotId: string | null) => {
    set({ selectedRobotId: robotId })
  },

  // Command queue actions
  enqueueCommand: ({ action, params, priority = 'normal' }) => {
    const { selectedRobotId } = get()
    if (!selectedRobotId) {
      return // Cannot enqueue without selected robot
    }

    const command: QueuedCommand = {
      id: generateCommandId(),
      robotId: selectedRobotId,
      action,
      params,
      priority,
      status: 'pending',
      createdAt: Date.now(),
    }

    set((state) => ({
      commandQueue: [...state.commandQueue, command],
    }))
  },

  updateCommandStatus: (commandId: string, status: CommandStatus, error?: string) => {
    set((state) => ({
      commandQueue: state.commandQueue.map((cmd) => {
        if (cmd.id !== commandId) return cmd

        const updates: Partial<QueuedCommand> = { status }

        if (status === 'executing') {
          updates.executedAt = Date.now()
        }
        if (status === 'completed' || status === 'failed') {
          updates.completedAt = Date.now()
        }
        if (error) {
          updates.error = error
        }

        return { ...cmd, ...updates }
      }),
    }))
  },

  clearQueue: () => {
    set({
      commandQueue: [],
      pendingCommand: null,
    })
  },

  // Emergency stop
  setEmergencyStop: (active: boolean) => {
    set({ emergencyStop: active })

    // If activating emergency stop, also reset velocity
    if (active) {
      get().resetVelocity()
    }
  },

  // Velocity control
  setVelocity: (velocity: VelocityState) => {
    set({ velocity })
  },

  resetVelocity: () => {
    set({ velocity: { linear: 0, angular: 0 } })
  },
}))

export default useCommandStore
