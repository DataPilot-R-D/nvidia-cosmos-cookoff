/**
 * Command Store Tests
 *
 * Tests for the robot command queue store.
 */

import { act } from '@testing-library/react'
import { useCommandStore } from '../command-store'

// Reset store before each test
beforeEach(() => {
  act(() => {
    useCommandStore.getState().clearQueue()
    useCommandStore.getState().selectRobot(null)
    useCommandStore.getState().setEmergencyStop(false)
    useCommandStore.getState().resetVelocity()
  })
})

describe('useCommandStore', () => {
  describe('initial state', () => {
    it('should have empty command queue', () => {
      const state = useCommandStore.getState()
      expect(state.commandQueue).toEqual([])
    })

    it('should have no pending command', () => {
      const state = useCommandStore.getState()
      expect(state.pendingCommand).toBeNull()
    })

    it('should have no selected robot by default', () => {
      const state = useCommandStore.getState()
      expect(state.selectedRobotId).toBeNull()
    })
  })

  describe('robot selection', () => {
    it('should select robot', () => {
      act(() => {
        useCommandStore.getState().selectRobot('robot-1')
      })

      expect(useCommandStore.getState().selectedRobotId).toBe('robot-1')
    })

    it('should deselect robot', () => {
      act(() => {
        useCommandStore.getState().selectRobot('robot-1')
        useCommandStore.getState().selectRobot(null)
      })

      expect(useCommandStore.getState().selectedRobotId).toBeNull()
    })
  })

  describe('command queue', () => {
    it('should enqueue command', () => {
      act(() => {
        useCommandStore.getState().selectRobot('robot-1')
        useCommandStore.getState().enqueueCommand({
          action: 'move',
          params: { x: 5, y: 10 },
        })
      })

      const queue = useCommandStore.getState().commandQueue
      expect(queue).toHaveLength(1)
      expect(queue[0].action).toBe('move')
      expect(queue[0].robotId).toBe('robot-1')
      expect(queue[0].status).toBe('pending')
    })

    it('should not enqueue if no robot selected', () => {
      act(() => {
        useCommandStore.getState().enqueueCommand({
          action: 'move',
          params: { x: 5, y: 10 },
        })
      })

      expect(useCommandStore.getState().commandQueue).toHaveLength(0)
    })

    it('should update command status', () => {
      let commandId: string

      act(() => {
        useCommandStore.getState().selectRobot('robot-1')
        useCommandStore.getState().enqueueCommand({ action: 'stop' })
        commandId = useCommandStore.getState().commandQueue[0].id
      })

      act(() => {
        useCommandStore.getState().updateCommandStatus(commandId!, 'executing')
      })

      expect(useCommandStore.getState().commandQueue[0].status).toBe('executing')
    })

    it('should complete command', () => {
      let commandId: string

      act(() => {
        useCommandStore.getState().selectRobot('robot-1')
        useCommandStore.getState().enqueueCommand({ action: 'stop' })
        commandId = useCommandStore.getState().commandQueue[0].id
      })

      act(() => {
        useCommandStore.getState().updateCommandStatus(commandId!, 'completed')
      })

      expect(useCommandStore.getState().commandQueue[0].status).toBe('completed')
    })

    it('should clear queue', () => {
      act(() => {
        useCommandStore.getState().selectRobot('robot-1')
        useCommandStore.getState().enqueueCommand({ action: 'stop' })
        useCommandStore.getState().enqueueCommand({ action: 'move' })
      })

      expect(useCommandStore.getState().commandQueue).toHaveLength(2)

      act(() => {
        useCommandStore.getState().clearQueue()
      })

      expect(useCommandStore.getState().commandQueue).toHaveLength(0)
    })
  })

  describe('emergency stop', () => {
    it('should set emergency stop flag', () => {
      act(() => {
        useCommandStore.getState().setEmergencyStop(true)
      })

      expect(useCommandStore.getState().emergencyStop).toBe(true)
    })

    it('should clear emergency stop', () => {
      act(() => {
        useCommandStore.getState().setEmergencyStop(true)
        useCommandStore.getState().setEmergencyStop(false)
      })

      expect(useCommandStore.getState().emergencyStop).toBe(false)
    })
  })

  describe('joystick velocity', () => {
    it('should set velocity', () => {
      act(() => {
        useCommandStore.getState().setVelocity({ linear: 0.5, angular: 0.2 })
      })

      const velocity = useCommandStore.getState().velocity
      expect(velocity.linear).toBe(0.5)
      expect(velocity.angular).toBe(0.2)
    })

    it('should reset velocity to zero', () => {
      act(() => {
        useCommandStore.getState().setVelocity({ linear: 0.5, angular: 0.2 })
        useCommandStore.getState().resetVelocity()
      })

      const velocity = useCommandStore.getState().velocity
      expect(velocity.linear).toBe(0)
      expect(velocity.angular).toBe(0)
    })
  })
})
