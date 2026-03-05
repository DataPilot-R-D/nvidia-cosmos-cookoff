/**
 * useWebSocket Hook Tests
 *
 * TDD Tests for WebSocket communication hook.
 * Tests follow the plan.md specification for Step 4.
 *
 * Test Cases:
 * 1. Connects to WS_URL on mount
 * 2. Validates messages with parseWebSocketMessage()
 * 3. Dispatches robot_state to robot store
 * 4. Dispatches connection to websocket store
 * 5. Exposes sendCommand(cmd) function
 * 6. Handles disconnect with reconnect
 * 7. Cleans up socket on unmount
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useWebSocket } from '../use-websocket'
import { useWebSocketStore } from '../../stores/websocket-store'
import { useRobotStore } from '../../stores/robot-store'
import type { RobotStateMessage, CommandMessage } from '@workspace/shared-types'

// =============================================================================
// Mock Socket.IO Client
// =============================================================================

interface MockSocketEventHandlers {
  connect: Array<() => void>
  disconnect: Array<(reason: string) => void>
  connect_error: Array<(error: Error) => void>
  robot_state: Array<(data: unknown) => void>
  connection: Array<(data: unknown) => void>
  alert: Array<(data: unknown) => void>
  camera_discovered: Array<(data: unknown) => void>
  camera_lost: Array<(data: unknown) => void>
  video_frame: Array<(data: unknown) => void>
}

interface MockSocket {
  connected: boolean
  id: string | null
  connect: jest.Mock
  disconnect: jest.Mock
  on: jest.Mock
  off: jest.Mock
  emit: jest.Mock
  _simulateConnect: () => void
  _simulateDisconnect: (reason?: string) => void
  _simulateError: (error: Error) => void
  _simulateMessage: (event: keyof MockSocketEventHandlers, data: unknown) => void
  _getHandlers: () => MockSocketEventHandlers
  _clearHandlers: () => void
}

const createMockSocket = (): MockSocket => {
  const eventHandlers: MockSocketEventHandlers = {
    connect: [],
    disconnect: [],
    connect_error: [],
    robot_state: [],
    connection: [],
    alert: [],
    camera_discovered: [],
    camera_lost: [],
    video_frame: [],
  }

  const mockSocket: MockSocket = {
    connected: false,
    id: null,

    connect: jest.fn(function (this: MockSocket) {
      // Note: We DON'T set connected=true here automatically
      // The _simulateConnect() method should be called to simulate
      // a successful connection from the server
      return this
    }),

    disconnect: jest.fn(function (this: MockSocket) {
      this.connected = false
      this.id = null
      eventHandlers.disconnect.forEach((handler) => handler('io client disconnect'))
      return this
    }),

    on: jest.fn(function (
      this: MockSocket,
      event: keyof MockSocketEventHandlers,
      handler: (data?: unknown) => void
    ) {
      if (eventHandlers[event]) {
        eventHandlers[event].push(handler as never)
      }
      return this
    }),

    off: jest.fn(function (
      this: MockSocket,
      event: keyof MockSocketEventHandlers,
      handler?: (data?: unknown) => void
    ) {
      if (eventHandlers[event] && handler) {
        const index = eventHandlers[event].indexOf(handler as never)
        if (index > -1) {
          eventHandlers[event].splice(index, 1)
        }
      }
      return this
    }),

    emit: jest.fn(),

    // Test helpers to simulate server events
    _simulateConnect() {
      this.connected = true
      this.id = 'mock-client-id'
      eventHandlers.connect.forEach((handler) => handler())
    },

    _simulateDisconnect(reason = 'transport close') {
      this.connected = false
      eventHandlers.disconnect.forEach((handler) => handler(reason))
    },

    _simulateError(error: Error) {
      eventHandlers.connect_error.forEach((handler) => handler(error))
    },

    _simulateMessage(event: keyof MockSocketEventHandlers, data: unknown) {
      eventHandlers[event]?.forEach((handler) => (handler as (d: unknown) => void)(data))
    },

    _getHandlers: () => eventHandlers,

    _clearHandlers() {
      Object.keys(eventHandlers).forEach((key) => {
        eventHandlers[key as keyof MockSocketEventHandlers] = []
      })
    },
  }

  return mockSocket
}

// Mock socket.io-client
let mockSocketInstance: MockSocket

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => {
    mockSocketInstance = createMockSocket()
    return mockSocketInstance
  }),
}))

// =============================================================================
// Test Setup
// =============================================================================

describe('useWebSocket Hook', () => {
  const TEST_WS_URL = 'http://localhost:8081'

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()

    // Reset stores
    useWebSocketStore.setState({
      status: 'disconnected',
      clientId: null,
      error: null,
    })

    useRobotStore.setState({
      robots: new Map(),
    })

    // Reset mock socket
    if (mockSocketInstance) {
      mockSocketInstance._clearHandlers()
    }
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  // ===========================================================================
  // Test Case 1: Connects to WS_URL on mount
  // ===========================================================================

  describe('Connection on Mount', () => {
    it('should connect to WebSocket server on mount', () => {
      const { io } = require('socket.io-client')

      renderHook(() => useWebSocket(TEST_WS_URL))

      expect(io).toHaveBeenCalledWith(TEST_WS_URL, expect.any(Object))
    })

    it('should set status to "connecting" when mount starts', () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      const state = useWebSocketStore.getState()
      expect(state.status).toBe('connecting')
    })

    it('should set status to "connected" after successful connection', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      // Simulate successful connection
      act(() => {
        mockSocketInstance._simulateConnect()
      })

      await waitFor(() => {
        const state = useWebSocketStore.getState()
        expect(state.status).toBe('connected')
      })
    })

    it('should set clientId after successful connection', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      await waitFor(() => {
        const state = useWebSocketStore.getState()
        expect(state.clientId).toBe('mock-client-id')
      })
    })

    it('should pass correct options to socket.io', () => {
      const { io } = require('socket.io-client')

      renderHook(() => useWebSocket(TEST_WS_URL))

      expect(io).toHaveBeenCalledWith(
        TEST_WS_URL,
        expect.objectContaining({
          autoConnect: false,
          reconnection: true,
          reconnectionAttempts: expect.any(Number),
          reconnectionDelay: expect.any(Number),
          reconnectionDelayMax: expect.any(Number),
        })
      )
    })
  })

  // ===========================================================================
  // Test Case 2: Validates messages with parseWebSocketMessage()
  // ===========================================================================

  describe('Message Validation', () => {
    it('should validate incoming robot_state messages with Zod schema', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      const validMessage: RobotStateMessage = {
        type: 'robot_state',
        timestamp: Date.now(),
        data: {
          robotId: 'robot-001',
          name: 'Patrol Bot 1',
          position: { x: 10, y: 20, z: 0 },
          battery: 85,
          status: 'patrol',
          velocity: 1.5,
          lastSeen: Date.now(),
        },
      }

      act(() => {
        mockSocketInstance._simulateMessage('robot_state', validMessage)
      })

      await waitFor(() => {
        const robot = useRobotStore.getState().getRobotById('robot-001')
        expect(robot).toBeDefined()
      })
    })

    it('should ignore invalid messages that fail Zod validation', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      const invalidMessage = {
        type: 'robot_state',
        // Missing required fields
        data: {
          robotId: 'robot-001',
          // Missing: name, position, battery, status, lastSeen
        },
      }

      act(() => {
        mockSocketInstance._simulateMessage('robot_state', invalidMessage)
      })

      // Should not add invalid robot to store
      const robot = useRobotStore.getState().getRobotById('robot-001')
      expect(robot).toBeUndefined()
    })

    it('should handle malformed JSON gracefully', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      // Simulate receiving non-object data
      act(() => {
        mockSocketInstance._simulateMessage('robot_state', 'invalid-string')
      })

      // Should not crash and store should remain unchanged
      expect(useRobotStore.getState().getRobotCount()).toBe(0)
    })
  })

  // ===========================================================================
  // Test Case 3: Dispatches robot_state to robot store
  // ===========================================================================

  describe('Robot State Dispatch', () => {
    it('should add new robot to store when robot_state message received', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      const robotStateMessage: RobotStateMessage = {
        type: 'robot_state',
        timestamp: Date.now(),
        data: {
          robotId: 'robot-002',
          name: 'Security Bot',
          position: { x: 5, y: 10, z: 0, heading: 90 },
          battery: 72,
          status: 'idle',
          velocity: 0,
          lastSeen: Date.now(),
        },
      }

      act(() => {
        mockSocketInstance._simulateMessage('robot_state', robotStateMessage)
      })

      await waitFor(() => {
        const robot = useRobotStore.getState().getRobotById('robot-002')
        expect(robot).toBeDefined()
        expect(robot?.name).toBe('Security Bot')
        expect(robot?.battery).toBe(72)
        expect(robot?.status).toBe('idle')
      })
    })

    it('should update existing robot when new state received', async () => {
      // Pre-populate store with a robot
      const initialRobot = {
        id: 'robot-003',
        name: 'Update Bot',
        position: { x: 0, y: 0, z: 0 },
        battery: 100,
        status: 'online' as const,
        velocity: 0,
        lastSeen: Date.now() - 1000,
        createdAt: Date.now() - 10000,
        updatedAt: Date.now() - 1000,
      }
      useRobotStore.getState().setRobot(initialRobot)

      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      // Send updated state
      const updatedState: RobotStateMessage = {
        type: 'robot_state',
        timestamp: Date.now(),
        data: {
          robotId: 'robot-003',
          name: 'Update Bot',
          position: { x: 50, y: 60, z: 0 },
          battery: 45,
          status: 'patrol',
          velocity: 2.0,
          lastSeen: Date.now(),
        },
      }

      act(() => {
        mockSocketInstance._simulateMessage('robot_state', updatedState)
      })

      await waitFor(() => {
        const robot = useRobotStore.getState().getRobotById('robot-003')
        expect(robot?.position.x).toBe(50)
        expect(robot?.battery).toBe(45)
        expect(robot?.status).toBe('patrol')
      })
    })

    it('should handle multiple robots in sequence', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      const robot1: RobotStateMessage = {
        type: 'robot_state',
        timestamp: Date.now(),
        data: {
          robotId: 'robot-a',
          name: 'Robot A',
          position: { x: 0, y: 0, z: 0 },
          battery: 90,
          status: 'online',
          lastSeen: Date.now(),
        },
      }

      const robot2: RobotStateMessage = {
        type: 'robot_state',
        timestamp: Date.now(),
        data: {
          robotId: 'robot-b',
          name: 'Robot B',
          position: { x: 10, y: 10, z: 0 },
          battery: 80,
          status: 'patrol',
          lastSeen: Date.now(),
        },
      }

      act(() => {
        mockSocketInstance._simulateMessage('robot_state', robot1)
        mockSocketInstance._simulateMessage('robot_state', robot2)
      })

      await waitFor(() => {
        expect(useRobotStore.getState().getRobotCount()).toBe(2)
      })
    })
  })

  // ===========================================================================
  // Test Case 4: Dispatches connection to websocket store
  // ===========================================================================

  describe('Connection State Dispatch', () => {
    it('should update websocket store status on connect', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      await waitFor(() => {
        const state = useWebSocketStore.getState()
        expect(state.status).toBe('connected')
      })
    })

    it('should update websocket store status on disconnect', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      await waitFor(() => {
        expect(useWebSocketStore.getState().status).toBe('connected')
      })

      // Use 'io client disconnect' reason which means user-initiated disconnect
      // (not server-initiated which would trigger reconnection)
      act(() => {
        mockSocketInstance._simulateDisconnect('io client disconnect')
      })

      await waitFor(() => {
        expect(useWebSocketStore.getState().status).toBe('disconnected')
      })
    })

    it('should set error state on connection error', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      const error = new Error('Connection refused')
      act(() => {
        mockSocketInstance._simulateError(error)
      })

      await waitFor(() => {
        const state = useWebSocketStore.getState()
        expect(state.status).toBe('error')
        expect(state.error).toBe('Connection refused')
      })
    })

    it('should clear clientId on disconnect', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      await waitFor(() => {
        expect(useWebSocketStore.getState().clientId).toBe('mock-client-id')
      })

      // Use 'io client disconnect' for user-initiated disconnect which clears clientId
      act(() => {
        mockSocketInstance._simulateDisconnect('io client disconnect')
      })

      await waitFor(() => {
        expect(useWebSocketStore.getState().clientId).toBeNull()
      })
    })
  })

  // ===========================================================================
  // Test Case 5: Exposes sendCommand(cmd) function
  // ===========================================================================

  describe('sendCommand Function', () => {
    it('should expose sendCommand function', () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      expect(result.current.sendCommand).toBeDefined()
      expect(typeof result.current.sendCommand).toBe('function')
    })

    it('should emit command message through socket', async () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      const command: CommandMessage = {
        type: 'command',
        timestamp: Date.now(),
        data: {
          robotId: 'robot-001',
          action: 'stop',
          priority: 'high',
        },
      }

      act(() => {
        result.current.sendCommand(command)
      })

      expect(mockSocketInstance.emit).toHaveBeenCalledWith('command', command)
    })

    it('should not send command when not connected', async () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      // Don't connect

      const command: CommandMessage = {
        type: 'command',
        timestamp: Date.now(),
        data: {
          robotId: 'robot-001',
          action: 'move',
          params: { x: 10, y: 20 },
          priority: 'normal',
        },
      }

      act(() => {
        result.current.sendCommand(command)
      })

      // Should not emit when disconnected
      expect(mockSocketInstance.emit).not.toHaveBeenCalled()
    })

    it('should return false when command fails to send', async () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      // Not connected
      const command: CommandMessage = {
        type: 'command',
        timestamp: Date.now(),
        data: {
          robotId: 'robot-001',
          action: 'patrol',
          priority: 'normal',
        },
      }

      let success: boolean = false
      act(() => {
        success = result.current.sendCommand(command)
      })

      expect(success).toBe(false)
    })

    it('should return true when command sent successfully', async () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      const command: CommandMessage = {
        type: 'command',
        timestamp: Date.now(),
        data: {
          robotId: 'robot-001',
          action: 'return_home',
          priority: 'normal',
        },
      }

      let success: boolean = false
      act(() => {
        success = result.current.sendCommand(command)
      })

      expect(success).toBe(true)
    })
  })

  // ===========================================================================
  // Test Case 6: Handles disconnect with reconnect
  // ===========================================================================

  describe('Reconnection Logic', () => {
    it('should set status to "reconnecting" when connection lost via transport close', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      await waitFor(() => {
        expect(useWebSocketStore.getState().status).toBe('connected')
      })

      // Simulate transport close (server-initiated disconnect)
      act(() => {
        mockSocketInstance._simulateDisconnect('transport close')
      })

      // Should trigger reconnection
      await waitFor(() => {
        expect(useWebSocketStore.getState().status).toBe('reconnecting')
      })
    })

    it('should set status to "reconnecting" when ping timeout', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      await waitFor(() => {
        expect(useWebSocketStore.getState().status).toBe('connected')
      })

      // Simulate ping timeout
      act(() => {
        mockSocketInstance._simulateDisconnect('ping timeout')
      })

      // Should trigger reconnection
      await waitFor(() => {
        expect(useWebSocketStore.getState().status).toBe('reconnecting')
      })
    })

    it('should have exponential backoff for reconnection attempts', () => {
      const { io } = require('socket.io-client')

      renderHook(() => useWebSocket(TEST_WS_URL))

      // Check that socket.io is configured with exponential backoff
      expect(io).toHaveBeenCalledWith(
        TEST_WS_URL,
        expect.objectContaining({
          reconnectionDelay: expect.any(Number),
          reconnectionDelayMax: expect.any(Number),
        })
      )

      // Verify delay increases (max should be greater than initial)
      const options = io.mock.calls[0][1]
      expect(options.reconnectionDelayMax).toBeGreaterThanOrEqual(options.reconnectionDelay)
    })

    it('should retry reconnection attempts indefinitely', () => {
      const { io } = require('socket.io-client')

      renderHook(() => useWebSocket(TEST_WS_URL))

      expect(io).toHaveBeenCalledWith(
        TEST_WS_URL,
        expect.objectContaining({
          reconnectionAttempts: expect.any(Number),
        })
      )

      const options = io.mock.calls[0][1]
      // Socket.IO accepts `Infinity` to retry indefinitely.
      expect(options.reconnectionAttempts).toBe(Infinity)
    })
  })

  // ===========================================================================
  // Test Case 7: Cleans up socket on unmount
  // ===========================================================================

  describe('Cleanup on Unmount', () => {
    it('should disconnect socket on unmount', () => {
      const { unmount } = renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      unmount()

      expect(mockSocketInstance.disconnect).toHaveBeenCalled()
    })

    it('should remove all event listeners on unmount', () => {
      const { unmount } = renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      unmount()

      expect(mockSocketInstance.off).toHaveBeenCalled()
    })

    it('should set websocket store to disconnected on unmount', () => {
      const { unmount } = renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      unmount()

      const state = useWebSocketStore.getState()
      expect(state.status).toBe('disconnected')
    })
  })

  // ===========================================================================
  // Additional Edge Cases
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should use "unknown" as clientId when socket.id is null', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      // Simulate connect without setting id (edge case)
      act(() => {
        mockSocketInstance.id = null
        mockSocketInstance.connected = true
        mockSocketInstance._getHandlers().connect.forEach((handler) => handler())
      })

      await waitFor(() => {
        expect(useWebSocketStore.getState().clientId).toBe('unknown')
      })
    })

    it('should use robot name from message when provided', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      const messageWithName: RobotStateMessage = {
        type: 'robot_state',
        timestamp: Date.now(),
        data: {
          robotId: 'robot-with-name',
          name: 'Custom Robot Name',
          position: { x: 0, y: 0, z: 0 },
          battery: 100,
          status: 'online',
          lastSeen: Date.now(),
        },
      }

      act(() => {
        mockSocketInstance._simulateMessage('robot_state', messageWithName)
      })

      await waitFor(() => {
        const robot = useRobotStore.getState().getRobotById('robot-with-name')
        expect(robot?.name).toBe('Custom Robot Name')
      })
    })

    it('should use default name when robot name is not provided', async () => {
      renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      const messageWithoutName: RobotStateMessage = {
        type: 'robot_state',
        timestamp: Date.now(),
        data: {
          robotId: 'robot-no-name',
          // name is not provided
          position: { x: 0, y: 0, z: 0 },
          battery: 100,
          status: 'online',
          lastSeen: Date.now(),
        },
      }

      act(() => {
        mockSocketInstance._simulateMessage('robot_state', messageWithoutName)
      })

      await waitFor(() => {
        const robot = useRobotStore.getState().getRobotById('robot-no-name')
        expect(robot?.name).toBe('Robot robot-no-name')
      })
    })

    it('should handle rapid connect/disconnect cycles', async () => {
      const { unmount } = renderHook(() => useWebSocket(TEST_WS_URL))

      for (let i = 0; i < 5; i++) {
        act(() => {
          mockSocketInstance._simulateConnect()
        })
        act(() => {
          mockSocketInstance._simulateDisconnect()
        })
      }

      // Should not throw and store should be in a valid state
      const state = useWebSocketStore.getState()
      expect(['connected', 'disconnected', 'reconnecting']).toContain(state.status)

      unmount()
    })

    it('should return isConnected state correctly', async () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      expect(result.current.isConnected).toBe(false)

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true)
      })
    })

    it('should expose socket reference (for advanced usage)', () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      expect(result.current.socket).toBeDefined()
    })
  })

  // ===========================================================================
  // Camera Subscription Functions
  // ===========================================================================

  describe('Camera Subscription', () => {
    it('should expose subscribeToCamera function', () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      expect(result.current.subscribeToCamera).toBeDefined()
      expect(typeof result.current.subscribeToCamera).toBe('function')
    })

    it('should expose unsubscribeFromCamera function', () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      expect(result.current.unsubscribeFromCamera).toBeDefined()
      expect(typeof result.current.unsubscribeFromCamera).toBe('function')
    })

    it('should emit camera_subscribe when subscribing to camera', async () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      act(() => {
        result.current.subscribeToCamera('camera-001', 'robot-001')
      })

      expect(mockSocketInstance.emit).toHaveBeenCalledWith(
        'camera_subscribe',
        expect.objectContaining({
          type: 'camera_subscribe',
          data: expect.objectContaining({
            cameraId: 'camera-001',
            robotId: 'robot-001',
          }),
        })
      )
    })

    it('should emit camera_unsubscribe when unsubscribing from camera', async () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      act(() => {
        result.current.unsubscribeFromCamera('camera-001')
      })

      expect(mockSocketInstance.emit).toHaveBeenCalledWith(
        'camera_unsubscribe',
        expect.objectContaining({
          type: 'camera_unsubscribe',
          data: expect.objectContaining({
            cameraId: 'camera-001',
          }),
        })
      )
    })

    it('should return false when subscribing while disconnected', () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      let success: boolean = false
      act(() => {
        success = result.current.subscribeToCamera('camera-001', 'robot-001')
      })

      expect(success).toBe(false)
      expect(mockSocketInstance.emit).not.toHaveBeenCalled()
    })

    it('should return true when subscribing while connected', async () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      let success: boolean = false
      act(() => {
        success = result.current.subscribeToCamera('camera-001', 'robot-001')
      })

      expect(success).toBe(true)
    })
  })

  // ===========================================================================
  // Video Frame Handling
  // ===========================================================================

  describe('Video Frame Handling', () => {
    it('should expose onVideoFrame callback setter', () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))

      expect(result.current.onVideoFrame).toBeDefined()
      expect(typeof result.current.onVideoFrame).toBe('function')
    })

    it('should call registered callback when video_frame received', async () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))
      const mockCallback = jest.fn()

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      act(() => {
        result.current.onVideoFrame(mockCallback)
      })

      const frameMessage = {
        metadata: {
          cameraId: 'camera-001',
          robotId: 'robot-001',
          format: 'jpeg',
          width: 640,
          height: 480,
          frameNumber: 1,
          timestamp: Date.now(),
        },
        data: new ArrayBuffer(1000),
      }

      act(() => {
        mockSocketInstance._simulateMessage('video_frame', frameMessage)
      })

      expect(mockCallback).toHaveBeenCalledWith(frameMessage)
    })

    it('should allow unregistering video frame callback', async () => {
      const { result } = renderHook(() => useWebSocket(TEST_WS_URL))
      const mockCallback = jest.fn()

      act(() => {
        mockSocketInstance._simulateConnect()
      })

      // Register callback
      act(() => {
        result.current.onVideoFrame(mockCallback)
      })

      // Unregister callback by passing null
      act(() => {
        result.current.onVideoFrame(null)
      })

      const frameMessage = {
        metadata: {
          cameraId: 'camera-001',
          robotId: 'robot-001',
          format: 'jpeg',
          width: 640,
          height: 480,
          frameNumber: 1,
          timestamp: Date.now(),
        },
        data: new ArrayBuffer(1000),
      }

      act(() => {
        mockSocketInstance._simulateMessage('video_frame', frameMessage)
      })

      // Callback should NOT be called after unregistering
      expect(mockCallback).not.toHaveBeenCalled()
    })
  })
})
