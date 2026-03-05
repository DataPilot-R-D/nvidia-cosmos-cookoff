/**
 * Camera Handler Tests
 *
 * Tests for camera discovery, subscription, and video frame relay.
 */

import { vi, describe, it, expect, beforeEach, type Mock } from 'vitest'
import {
  createCameraRegistry,
  registerCameraHandlers,
  getKnownCameras,
  getCameraById,
  getCameraSubscribers,
  type CameraRegistry,
  type CameraEntity,
} from '../handlers/camera'

// =============================================================================
// Mocks
// =============================================================================

interface MockSocket {
  id: string
  on: Mock
  join: Mock
  leave: Mock
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
    join: vi.fn(),
    leave: vi.fn(),
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

function createTestCamera(overrides: Partial<CameraEntity> = {}): CameraEntity {
  return {
    id: 'camera-001',
    robotId: 'robot-001',
    name: 'Front Camera',
    topic: '/robot_001/camera_front/image',
    status: 'active',
    capabilities: {
      supportsWebRTC: true,
      supportsHLS: true,
      supportsPTZ: false,
      maxResolution: { width: 1920, height: 1080 },
      maxFps: 30,
    },
    webrtcEnabled: true,
    ...overrides,
  }
}

// =============================================================================
// Registry Tests
// =============================================================================

describe('CameraRegistry', () => {
  describe('createCameraRegistry', () => {
    it('should create an empty registry', () => {
      const registry = createCameraRegistry()

      expect(registry.cameras).toBeInstanceOf(Map)
      expect(registry.cameras.size).toBe(0)
      expect(registry.subscriptions).toBeInstanceOf(Map)
      expect(registry.subscriptions.size).toBe(0)
    })
  })

  describe('getKnownCameras', () => {
    it('should return empty array for empty registry', () => {
      const registry = createCameraRegistry()
      const cameras = getKnownCameras(registry)

      expect(cameras).toEqual([])
    })

    it('should return all cameras in registry', () => {
      const registry = createCameraRegistry()
      const camera1 = createTestCamera({ id: 'cam-1' })
      const camera2 = createTestCamera({ id: 'cam-2' })
      registry.cameras.set(camera1.id, camera1)
      registry.cameras.set(camera2.id, camera2)

      const cameras = getKnownCameras(registry)

      expect(cameras).toHaveLength(2)
      expect(cameras).toContainEqual(camera1)
      expect(cameras).toContainEqual(camera2)
    })
  })

  describe('getCameraById', () => {
    it('should return undefined for non-existent camera', () => {
      const registry = createCameraRegistry()
      const camera = getCameraById(registry, 'non-existent')

      expect(camera).toBeUndefined()
    })

    it('should return camera by ID', () => {
      const registry = createCameraRegistry()
      const testCamera = createTestCamera()
      registry.cameras.set(testCamera.id, testCamera)

      const camera = getCameraById(registry, testCamera.id)

      expect(camera).toEqual(testCamera)
    })
  })

  describe('getCameraSubscribers', () => {
    it('should return empty array for camera with no subscribers', () => {
      const registry = createCameraRegistry()
      const subscribers = getCameraSubscribers(registry, 'camera-001')

      expect(subscribers).toEqual([])
    })

    it('should return subscriber socket IDs', () => {
      const registry = createCameraRegistry()
      registry.subscriptions.set('camera-001', new Set(['socket-1', 'socket-2']))

      const subscribers = getCameraSubscribers(registry, 'camera-001')

      expect(subscribers).toHaveLength(2)
      expect(subscribers).toContain('socket-1')
      expect(subscribers).toContain('socket-2')
    })
  })
})

// =============================================================================
// Handler Tests
// =============================================================================

describe('registerCameraHandlers', () => {
  let mockIO: MockIO
  let mockSocket: MockSocket
  let mockLogger: MockLogger
  let registry: CameraRegistry
  let eventHandlers: Record<string, (data: unknown) => void>

  beforeEach(() => {
    mockIO = createMockIO()
    mockSocket = createMockSocket()
    mockLogger = createMockLogger()
    registry = createCameraRegistry()
    eventHandlers = {}

    // Capture event handlers
    mockSocket.on.mockImplementation((event: string, handler: (data: unknown) => void) => {
      eventHandlers[event] = handler
    })

    registerCameraHandlers(
      mockIO as unknown as Parameters<typeof registerCameraHandlers>[0],
      mockSocket as unknown as Parameters<typeof registerCameraHandlers>[1],
      registry,
      mockLogger as unknown as Parameters<typeof registerCameraHandlers>[3]
    )
  })

  describe('camera_discovered event', () => {
    it('should register camera_discovered handler', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('camera_discovered', expect.any(Function))
    })

    it('should add camera to registry on discovery', () => {
      const camera = createTestCamera()
      const message = {
        type: 'camera_discovered',
        timestamp: Date.now(),
        data: camera,
      }

      eventHandlers['camera_discovered'](message)

      expect(registry.cameras.get(camera.id)).toEqual(camera)
    })

    it('should broadcast camera_discovered to all clients', () => {
      const camera = createTestCamera()
      const message = {
        type: 'camera_discovered',
        timestamp: Date.now(),
        data: camera,
      }

      eventHandlers['camera_discovered'](message)

      expect(mockIO.emit).toHaveBeenCalledWith('camera_discovered', message)
    })

    it('should log camera discovery', () => {
      const camera = createTestCamera()
      const message = {
        type: 'camera_discovered',
        timestamp: Date.now(),
        data: camera,
      }

      eventHandlers['camera_discovered'](message)

      expect(mockLogger.info).toHaveBeenCalledWith(
        { cameraId: camera.id, name: camera.name },
        'Camera discovered'
      )
    })
  })

  describe('camera_lost event', () => {
    it('should register camera_lost handler', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('camera_lost', expect.any(Function))
    })

    it('should remove camera from registry', () => {
      const camera = createTestCamera()
      registry.cameras.set(camera.id, camera)

      const message = {
        type: 'camera_lost',
        timestamp: Date.now(),
        data: { cameraId: camera.id, robotId: camera.robotId },
      }

      eventHandlers['camera_lost'](message)

      expect(registry.cameras.has(camera.id)).toBe(false)
    })

    it('should clean up subscriptions for lost camera', () => {
      const camera = createTestCamera()
      registry.cameras.set(camera.id, camera)
      registry.subscriptions.set(camera.id, new Set(['socket-1']))

      const message = {
        type: 'camera_lost',
        timestamp: Date.now(),
        data: { cameraId: camera.id, robotId: camera.robotId },
      }

      eventHandlers['camera_lost'](message)

      expect(registry.subscriptions.has(camera.id)).toBe(false)
    })

    it('should broadcast camera_lost to all clients', () => {
      const message = {
        type: 'camera_lost',
        timestamp: Date.now(),
        data: { cameraId: 'camera-001', robotId: 'robot-001' },
      }

      eventHandlers['camera_lost'](message)

      expect(mockIO.emit).toHaveBeenCalledWith('camera_lost', message)
    })
  })

  describe('camera_subscribe event', () => {
    it('should register camera_subscribe handler', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('camera_subscribe', expect.any(Function))
    })

    it('should add socket to camera subscribers', () => {
      const message = {
        type: 'camera_subscribe',
        timestamp: Date.now(),
        data: { cameraId: 'camera-001', robotId: 'robot-001' },
      }

      eventHandlers['camera_subscribe'](message)

      expect(registry.subscriptions.get('camera-001')?.has(mockSocket.id)).toBe(true)
    })

    it('should join socket to camera room', () => {
      const message = {
        type: 'camera_subscribe',
        timestamp: Date.now(),
        data: { cameraId: 'camera-001', robotId: 'robot-001' },
      }

      eventHandlers['camera_subscribe'](message)

      expect(mockSocket.join).toHaveBeenCalledWith('camera:camera-001')
    })

    it('should forward subscribe to ROS bridge', () => {
      const message = {
        type: 'camera_subscribe',
        timestamp: Date.now(),
        data: { cameraId: 'camera-001', robotId: 'robot-001' },
      }

      eventHandlers['camera_subscribe'](message)

      expect(mockSocket.broadcast.emit).toHaveBeenCalledWith('camera_subscribe', message)
    })

    it('should handle multiple subscribers to same camera', () => {
      const socket2 = createMockSocket('socket-456')

      // First subscriber
      eventHandlers['camera_subscribe']({
        type: 'camera_subscribe',
        timestamp: Date.now(),
        data: { cameraId: 'camera-001', robotId: 'robot-001' },
      })

      // Add second subscriber manually
      registry.subscriptions.get('camera-001')?.add('socket-456')

      expect(registry.subscriptions.get('camera-001')?.size).toBe(2)
    })
  })

  describe('camera_unsubscribe event', () => {
    it('should register camera_unsubscribe handler', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('camera_unsubscribe', expect.any(Function))
    })

    it('should remove socket from camera subscribers', () => {
      registry.subscriptions.set('camera-001', new Set([mockSocket.id]))

      const message = {
        type: 'camera_unsubscribe',
        timestamp: Date.now(),
        data: { cameraId: 'camera-001' },
      }

      eventHandlers['camera_unsubscribe'](message)

      expect(registry.subscriptions.get('camera-001')?.has(mockSocket.id)).toBe(false)
    })

    it('should leave camera room', () => {
      const message = {
        type: 'camera_unsubscribe',
        timestamp: Date.now(),
        data: { cameraId: 'camera-001' },
      }

      eventHandlers['camera_unsubscribe'](message)

      expect(mockSocket.leave).toHaveBeenCalledWith('camera:camera-001')
    })

    it('should forward unsubscribe to ROS bridge', () => {
      const message = {
        type: 'camera_unsubscribe',
        timestamp: Date.now(),
        data: { cameraId: 'camera-001' },
      }

      eventHandlers['camera_unsubscribe'](message)

      expect(mockSocket.broadcast.emit).toHaveBeenCalledWith('camera_unsubscribe', message)
    })
  })

  describe('video_frame event', () => {
    it('should register video_frame handler', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('video_frame', expect.any(Function))
    })

    it('should send video frame only to subscribed clients', () => {
      const message = {
        type: 'video_frame',
        timestamp: Date.now(),
        data: {
          cameraId: 'camera-001',
          robotId: 'robot-001',
          format: 'jpeg',
          width: 640,
          height: 480,
          frameNumber: 1,
          frameData: 'base64-encoded-data',
        },
      }

      eventHandlers['video_frame'](message)

      expect(mockIO.to).toHaveBeenCalledWith('camera:camera-001')
      expect(mockIO.to('camera:camera-001').emit).toHaveBeenCalledWith('video_frame', message)
    })
  })

  describe('disconnect event', () => {
    it('should register disconnect handler', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function))
    })

    it('should remove socket from all camera subscriptions on disconnect', () => {
      registry.subscriptions.set('camera-001', new Set([mockSocket.id, 'other-socket']))
      registry.subscriptions.set('camera-002', new Set([mockSocket.id]))

      eventHandlers['disconnect']()

      expect(registry.subscriptions.get('camera-001')?.has(mockSocket.id)).toBe(false)
      expect(registry.subscriptions.get('camera-001')?.has('other-socket')).toBe(true)
      expect(registry.subscriptions.get('camera-002')?.has(mockSocket.id)).toBe(false)
    })
  })
})
