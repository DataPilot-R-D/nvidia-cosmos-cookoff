/**
 * WebRTC Handler Tests
 *
 * Tests for WebRTC signaling relay (offer, answer, ICE candidates).
 */

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest'
import {
  createWebRTCRegistry,
  registerWebRTCHandlers,
  getActiveSessions,
  getSession,
  type WebRTCRegistry,
  type WebRTCSession,
} from '../handlers/webrtc'

// =============================================================================
// Mocks
// =============================================================================

interface MockSocket {
  id: string
  on: Mock
  broadcast: {
    emit: Mock
  }
  emit: Mock
}

interface MockIO {
  emit: Mock
  to: Mock
}

interface MockLogger {
  info: Mock
  warn: Mock
  debug: Mock
  error: Mock
}

function createMockSocket(id = 'socket-123'): MockSocket {
  return {
    id,
    on: vi.fn(),
    broadcast: {
      emit: vi.fn(),
    },
    emit: vi.fn(),
  }
}

function createMockIO(): MockIO {
  const toMock = {
    emit: vi.fn(),
  }
  return {
    emit: vi.fn(),
    to: vi.fn().mockReturnValue(toMock),
  }
}

function createMockLogger(): MockLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }
}

// =============================================================================
// Test Data
// =============================================================================

function createTestSession(overrides: Partial<WebRTCSession> = {}): WebRTCSession {
  return {
    cameraId: 'camera-001',
    clientId: 'client-001',
    clientSocketId: 'socket-123',
    status: 'pending',
    createdAt: Date.now(),
    mode: 'legacy',
    ...overrides,
  }
}

// =============================================================================
// Registry Tests
// =============================================================================

describe('WebRTCRegistry', () => {
  describe('createWebRTCRegistry', () => {
    it('should create an empty registry', () => {
      const registry = createWebRTCRegistry()

      expect(registry.sessions).toBeInstanceOf(Map)
      expect(registry.sessions.size).toBe(0)
    })
  })

  describe('getActiveSessions', () => {
    it('should return empty array for empty registry', () => {
      const registry = createWebRTCRegistry()
      const sessions = getActiveSessions(registry)

      expect(sessions).toEqual([])
    })

    it('should return all sessions', () => {
      const registry = createWebRTCRegistry()
      const session1 = createTestSession({ cameraId: 'cam-1', clientId: 'client-1' })
      const session2 = createTestSession({ cameraId: 'cam-2', clientId: 'client-2' })

      registry.sessions.set('cam-1:client-1', session1)
      registry.sessions.set('cam-2:client-2', session2)

      const sessions = getActiveSessions(registry)

      expect(sessions).toHaveLength(2)
      expect(sessions).toContainEqual(session1)
      expect(sessions).toContainEqual(session2)
    })
  })

  describe('getSession', () => {
    it('should return undefined for non-existent session', () => {
      const registry = createWebRTCRegistry()
      const session = getSession(registry, 'camera-001', 'client-001')

      expect(session).toBeUndefined()
    })

    it('should return session by camera and client ID', () => {
      const registry = createWebRTCRegistry()
      const testSession = createTestSession()

      registry.sessions.set('camera-001:client-001', testSession)

      const session = getSession(registry, 'camera-001', 'client-001')

      expect(session).toEqual(testSession)
    })
  })
})

// =============================================================================
// Handler Tests
// =============================================================================

describe('registerWebRTCHandlers', () => {
  let mockIO: MockIO
  let mockSocket: MockSocket
  let mockLogger: MockLogger
  let registry: WebRTCRegistry
  let eventHandlers: Record<string, (data: unknown) => void>

  beforeEach(() => {
    mockIO = createMockIO()
    mockSocket = createMockSocket()
    mockLogger = createMockLogger()
    registry = createWebRTCRegistry()
    eventHandlers = {}

    // Capture event handlers
    mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
      eventHandlers[event] = handler
    })

    registerWebRTCHandlers(
      mockIO as unknown as Parameters<typeof registerWebRTCHandlers>[0],
      mockSocket as unknown as Parameters<typeof registerWebRTCHandlers>[1],
      registry,
      mockLogger as unknown as Parameters<typeof registerWebRTCHandlers>[3]
    )
  })

  describe('webrtc_offer event', () => {
    it('should register webrtc_offer handler', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('webrtc_offer', expect.any(Function))
    })

    it('should create session on offer', () => {
      const message = {
        type: 'webrtc_offer',
        timestamp: Date.now(),
        data: {
          cameraId: 'camera-001',
          clientId: 'client-001',
          sdp: 'v=0\r\no=- 12345...',
        },
      }

      eventHandlers['webrtc_offer'](message)

      const session = registry.sessions.get('camera-001:client-001')
      expect(session).toBeDefined()
      expect(session?.cameraId).toBe('camera-001')
      expect(session?.clientId).toBe('client-001')
      expect(session?.clientSocketId).toBe(mockSocket.id)
      expect(session?.status).toBe('pending')
    })

    it('should forward offer to ROS bridge', () => {
      const message = {
        type: 'webrtc_offer',
        timestamp: Date.now(),
        data: {
          cameraId: 'camera-001',
          clientId: 'client-001',
          sdp: 'v=0\r\no=- 12345...',
        },
      }

      eventHandlers['webrtc_offer'](message)

      expect(mockSocket.broadcast.emit).toHaveBeenCalledWith('webrtc_offer', message)
    })

    it('should log offer received', () => {
      const message = {
        type: 'webrtc_offer',
        timestamp: Date.now(),
        data: {
          cameraId: 'camera-001',
          clientId: 'client-001',
          sdp: 'v=0\r\no=- 12345...',
        },
      }

      eventHandlers['webrtc_offer'](message)

      expect(mockLogger.info).toHaveBeenCalledWith(
        { cameraId: 'camera-001', clientId: 'client-001' },
        'WebRTC offer received (legacy mode)'
      )
    })
  })

  describe('webrtc_answer event', () => {
    it('should register webrtc_answer handler', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('webrtc_answer', expect.any(Function))
    })

    it('should update session status to connected', () => {
      // Create pending session first
      registry.sessions.set('camera-001:client-001', createTestSession())

      const message = {
        type: 'webrtc_answer',
        timestamp: Date.now(),
        data: {
          cameraId: 'camera-001',
          clientId: 'client-001',
          sdp: 'v=0\r\no=- 67890...',
        },
      }

      eventHandlers['webrtc_answer'](message)

      const session = registry.sessions.get('camera-001:client-001')
      expect(session?.status).toBe('connected')
    })

    it('should send answer to client socket', () => {
      const session = createTestSession()
      registry.sessions.set('camera-001:client-001', session)

      const message = {
        type: 'webrtc_answer',
        timestamp: Date.now(),
        data: {
          cameraId: 'camera-001',
          clientId: 'client-001',
          sdp: 'v=0\r\no=- 67890...',
        },
      }

      eventHandlers['webrtc_answer'](message)

      expect(mockIO.to).toHaveBeenCalledWith(session.clientSocketId)
      expect(mockIO.to(session.clientSocketId).emit).toHaveBeenCalledWith('webrtc_answer', message)
    })

    it('should silently ignore answer when session not found', () => {
      const message = {
        type: 'webrtc_answer',
        timestamp: Date.now(),
        data: {
          cameraId: 'camera-999',
          clientId: 'client-999',
          sdp: 'v=0\r\no=- 67890...',
        },
      }

      eventHandlers['webrtc_answer'](message)

      // No session exists, so answer is silently dropped (not routed to legacy handler)
      expect(mockLogger.warn).not.toHaveBeenCalled()
    })
  })

  describe('webrtc_ice event', () => {
    it('should register webrtc_ice handler', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('webrtc_ice', expect.any(Function))
    })

    it('should relay ICE from client to ROS bridge', () => {
      const session = createTestSession({ clientSocketId: mockSocket.id })
      registry.sessions.set('camera-001:client-001', session)

      const message = {
        type: 'webrtc_ice',
        timestamp: Date.now(),
        data: {
          cameraId: 'camera-001',
          clientId: 'client-001',
          candidate: 'candidate:12345...',
          sdpMid: 'video',
          sdpMLineIndex: 0,
        },
      }

      eventHandlers['webrtc_ice'](message)

      expect(mockSocket.broadcast.emit).toHaveBeenCalledWith('webrtc_ice', message)
    })

    it('should relay ICE from ROS bridge to client', () => {
      // Create session with different client socket
      const session = createTestSession({ clientSocketId: 'other-socket-456' })
      registry.sessions.set('camera-001:client-001', session)

      const message = {
        type: 'webrtc_ice',
        timestamp: Date.now(),
        data: {
          cameraId: 'camera-001',
          clientId: 'client-001',
          candidate: 'candidate:67890...',
          sdpMid: 'video',
          sdpMLineIndex: 0,
        },
      }

      eventHandlers['webrtc_ice'](message)

      expect(mockIO.to).toHaveBeenCalledWith('other-socket-456')
      expect(mockIO.to('other-socket-456').emit).toHaveBeenCalledWith('webrtc_ice', message)
    })

    it('should broadcast ICE if session not found (fallback)', () => {
      const message = {
        type: 'webrtc_ice',
        timestamp: Date.now(),
        data: {
          cameraId: 'camera-unknown',
          clientId: 'client-unknown',
          candidate: 'candidate:12345...',
        },
      }

      eventHandlers['webrtc_ice'](message)

      expect(mockSocket.broadcast.emit).toHaveBeenCalledWith('webrtc_ice', message)
    })

    it('should handle null ICE candidate (end-of-candidates)', () => {
      const session = createTestSession({ clientSocketId: mockSocket.id })
      registry.sessions.set('camera-001:client-001', session)

      const message = {
        type: 'webrtc_ice',
        timestamp: Date.now(),
        data: {
          cameraId: 'camera-001',
          clientId: 'client-001',
          candidate: null,
        },
      }

      eventHandlers['webrtc_ice'](message)

      expect(mockSocket.broadcast.emit).toHaveBeenCalledWith('webrtc_ice', message)
    })
  })

  describe('disconnect event', () => {
    it('should register disconnect handler', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function))
    })

    it('should clean up sessions for disconnected client', () => {
      // Sessions owned by this socket
      registry.sessions.set(
        'camera-001:client-001',
        createTestSession({ clientSocketId: mockSocket.id })
      )
      registry.sessions.set(
        'camera-002:client-001',
        createTestSession({
          cameraId: 'camera-002',
          clientSocketId: mockSocket.id,
        })
      )

      // Session owned by different socket
      registry.sessions.set(
        'camera-003:client-002',
        createTestSession({
          cameraId: 'camera-003',
          clientId: 'client-002',
          clientSocketId: 'other-socket',
        })
      )

      eventHandlers['disconnect']()

      expect(registry.sessions.has('camera-001:client-001')).toBe(false)
      expect(registry.sessions.has('camera-002:client-001')).toBe(false)
      expect(registry.sessions.has('camera-003:client-002')).toBe(true)
    })

    it('should log session cleanup', () => {
      registry.sessions.set(
        'camera-001:client-001',
        createTestSession({ clientSocketId: mockSocket.id })
      )

      eventHandlers['disconnect']()

      expect(mockLogger.debug).toHaveBeenCalledWith(
        { cameraId: 'camera-001', clientId: 'client-001', mode: 'legacy' },
        'WebRTC session cleaned up'
      )
    })
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('WebRTC Signaling Flow', () => {
  let mockIO: MockIO
  let clientSocket: MockSocket
  let rosBridgeSocket: MockSocket
  let mockLogger: MockLogger
  let registry: WebRTCRegistry
  let clientHandlers: Record<string, (data: unknown) => void>
  let rosBridgeHandlers: Record<string, (data: unknown) => void>

  beforeEach(() => {
    mockIO = createMockIO()
    clientSocket = createMockSocket('client-socket')
    rosBridgeSocket = createMockSocket('ros-bridge-socket')
    mockLogger = createMockLogger()
    registry = createWebRTCRegistry()
    clientHandlers = {}
    rosBridgeHandlers = {}

    // Capture event handlers for client socket
    clientSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
      clientHandlers[event] = handler
    })

    // Capture event handlers for ROS bridge socket
    rosBridgeSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
      rosBridgeHandlers[event] = handler
    })

    // Register handlers for both sockets
    registerWebRTCHandlers(
      mockIO as unknown as Parameters<typeof registerWebRTCHandlers>[0],
      clientSocket as unknown as Parameters<typeof registerWebRTCHandlers>[1],
      registry,
      mockLogger as unknown as Parameters<typeof registerWebRTCHandlers>[3]
    )

    registerWebRTCHandlers(
      mockIO as unknown as Parameters<typeof registerWebRTCHandlers>[0],
      rosBridgeSocket as unknown as Parameters<typeof registerWebRTCHandlers>[1],
      registry,
      mockLogger as unknown as Parameters<typeof registerWebRTCHandlers>[3]
    )
  })

  it('should complete full signaling flow: offer -> answer -> connected', () => {
    // Step 1: Client sends offer
    const offer = {
      type: 'webrtc_offer',
      timestamp: Date.now(),
      data: {
        cameraId: 'camera-001',
        clientId: 'client-001',
        sdp: 'v=0\r\no=- offer...',
      },
    }

    clientHandlers['webrtc_offer'](offer)

    // Verify session is created with pending status
    const pendingSession = registry.sessions.get('camera-001:client-001')
    expect(pendingSession?.status).toBe('pending')
    expect(clientSocket.broadcast.emit).toHaveBeenCalledWith('webrtc_offer', offer)

    // Step 2: ROS bridge sends answer
    const answer = {
      type: 'webrtc_answer',
      timestamp: Date.now(),
      data: {
        cameraId: 'camera-001',
        clientId: 'client-001',
        sdp: 'v=0\r\no=- answer...',
      },
    }

    rosBridgeHandlers['webrtc_answer'](answer)

    // Verify session is updated to connected
    const connectedSession = registry.sessions.get('camera-001:client-001')
    expect(connectedSession?.status).toBe('connected')
    expect(mockIO.to).toHaveBeenCalledWith('client-socket')
  })
})
