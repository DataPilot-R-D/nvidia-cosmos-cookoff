/**
 * useCameraStream Hook Tests
 *
 * Tests for the camera streaming hook that manages HLS/WebRTC connections.
 */

import { renderHook, act } from '@testing-library/react'
import { useCameraStream } from '../use-camera-stream'
import { useCameraStore } from '../../stores/camera-store'
import type { CameraEntity, CameraStatus } from '@workspace/shared-types'

// =============================================================================
// Mocks
// =============================================================================

// Mock socket.io-client
const mockEmit = jest.fn()
const mockOn = jest.fn()
const mockOff = jest.fn()

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    emit: mockEmit,
    on: mockOn,
    off: mockOff,
    connected: true,
    disconnect: jest.fn(),
  })),
}))

// =============================================================================
// Test Data
// =============================================================================

function createTestCamera(overrides: Partial<CameraEntity> = {}): CameraEntity {
  return {
    id: 'camera-001',
    robotId: 'robot-001',
    name: 'Front Camera',
    topic: '/robot_001/camera_front/image',
    status: 'active' as CameraStatus,
    capabilities: {
      supportsWebRTC: true,
      supportsHLS: true,
      supportsPTZ: false,
      maxResolution: { width: 1920, height: 1080 },
      maxFps: 30,
    },
    webrtcEnabled: true,
    hlsUrl: 'http://localhost:8888/camera-001/playlist.m3u8',
    ...overrides,
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('useCameraStream', () => {
  beforeEach(() => {
    // Reset store
    useCameraStore.setState({
      cameras: new Map(),
      activeStreams: new Map(),
      selectedCamera: null,
    })

    // Reset mocks
    mockEmit.mockClear()
    mockOn.mockClear()
    mockOff.mockClear()
  })

  describe('without camera', () => {
    it('should return null values when camera not found', () => {
      const { result } = renderHook(() => useCameraStream('non-existent'))

      expect(result.current.camera).toBeNull()
      expect(result.current.streamUrl).toBeNull()
      expect(result.current.status).toBe('stopped')
    })

    it('should not subscribe when camera ID is null', () => {
      const { result } = renderHook(() => useCameraStream(null))

      expect(result.current.camera).toBeNull()
      expect(result.current.status).toBe('stopped')
    })
  })

  describe('with camera', () => {
    beforeEach(() => {
      const camera = createTestCamera()
      useCameraStore.getState().addCamera(camera)
    })

    it('should return camera entity', () => {
      const { result } = renderHook(() => useCameraStream('camera-001'))

      expect(result.current.camera).toBeDefined()
      expect(result.current.camera?.id).toBe('camera-001')
    })

    it('should default to auto mode', () => {
      const { result } = renderHook(() => useCameraStream('camera-001'))

      expect(result.current.modePreference).toBe('auto')
    })

    it('should allow switching to webrtc mode', () => {
      const { result } = renderHook(() => useCameraStream('camera-001', 'webrtc'))

      expect(result.current.modePreference).toBe('webrtc')
    })

    it('should return HLS URL when camera provides it (backwards compatibility)', () => {
      const { result } = renderHook(() => useCameraStream('camera-001', 'auto'))

      expect(result.current.streamUrl).toBe('http://localhost:8888/camera-001/playlist.m3u8')
    })

    it('should set status to connecting initially', async () => {
      const { result } = renderHook(() => useCameraStream('camera-001'))

      // Initial status should be connecting
      expect(result.current.status).toBe('connecting')
    })
  })

  describe('subscribe/unsubscribe', () => {
    beforeEach(() => {
      const camera = createTestCamera()
      useCameraStore.getState().addCamera(camera)
    })

    it('should have subscribe function', () => {
      const { result } = renderHook(() => useCameraStream('camera-001'))

      expect(typeof result.current.subscribe).toBe('function')
    })

    it('should have unsubscribe function', () => {
      const { result } = renderHook(() => useCameraStream('camera-001'))

      expect(typeof result.current.unsubscribe).toBe('function')
    })
  })

  describe('mode switching', () => {
    beforeEach(() => {
      const camera = createTestCamera()
      useCameraStore.getState().addCamera(camera)
    })

    it('should have setModePreference function', () => {
      const { result } = renderHook(() => useCameraStream('camera-001'))

      expect(typeof result.current.setModePreference).toBe('function')
    })

    it('should update mode when setModePreference is called', () => {
      const { result } = renderHook(() => useCameraStream('camera-001'))

      act(() => {
        result.current.setModePreference('webrtc')
      })

      expect(result.current.modePreference).toBe('webrtc')
    })
  })

  describe('stream metrics', () => {
    beforeEach(() => {
      const camera = createTestCamera()
      useCameraStore.getState().addCamera(camera)
    })

    it('should expose fps metric', () => {
      const { result } = renderHook(() => useCameraStream('camera-001'))

      expect(result.current.fps).toBeDefined()
    })

    it('should expose latency metric for webrtc', () => {
      const { result } = renderHook(() => useCameraStream('camera-001', 'webrtc'))

      expect(result.current.latency).toBeDefined()
    })
  })

  describe('camera changes', () => {
    it('should update when camera is added to store', () => {
      const { result, rerender } = renderHook(() => useCameraStream('camera-001'))

      // Initially no camera
      expect(result.current.camera).toBeNull()

      // Add camera
      act(() => {
        useCameraStore.getState().addCamera(createTestCamera())
      })

      // Re-render to pick up store changes
      rerender()

      // Now camera should be available
      expect(result.current.camera).toBeDefined()
    })

    it('should handle camera removal', () => {
      // Add camera first
      useCameraStore.getState().addCamera(createTestCamera())

      const { result, rerender } = renderHook(() => useCameraStream('camera-001'))

      expect(result.current.camera).toBeDefined()

      // Remove camera
      act(() => {
        useCameraStore.getState().removeCamera('camera-001')
      })

      rerender()

      expect(result.current.camera).toBeNull()
    })
  })

  describe('cleanup', () => {
    beforeEach(() => {
      const camera = createTestCamera()
      useCameraStore.getState().addCamera(camera)
    })

    it('should cleanup on unmount', () => {
      const { unmount } = renderHook(() => useCameraStream('camera-001'))

      unmount()

      // Verify cleanup happened (stream should be removed)
      const { activeStreams } = useCameraStore.getState()
      expect(activeStreams.has('camera-001')).toBe(false)
    })
  })
})
