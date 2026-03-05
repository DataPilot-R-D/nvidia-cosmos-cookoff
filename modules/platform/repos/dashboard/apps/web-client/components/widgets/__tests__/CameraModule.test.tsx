/**
 * CameraModule Tests
 *
 * Tests for the camera streaming widget.
 */

import { render, screen } from '@testing-library/react'
import { CameraModule } from '../CameraModule'
import { useCameraStore } from '@/lib/stores/camera-store'
import { useTopicStore } from '@/lib/stores/topic-store'
import { useCameraStream } from '@/lib/hooks/use-camera-stream'
import type { CameraEntity, CameraStatus } from '@workspace/shared-types'

// =============================================================================
// Mocks
// =============================================================================

// Mock socket.io-client
jest.mock('socket.io-client', () => ({
  io: jest.fn(() => ({
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    connected: true,
    disconnect: jest.fn(),
  })),
}))

// Mock use-camera-stream
jest.mock('@/lib/hooks/use-camera-stream', () => ({
  useCameraStream: jest.fn(() => ({
    camera: null,
    modePreference: 'auto',
    setModePreference: jest.fn(),
    activeMode: null,
    streamUrl: null,
    status: 'stopped',
    streamState: 'idle',
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    fps: null,
    latency: null,
    frameDataUrl: null,
    rawData: null,
    frameMetadata: null,
    mediaStream: null,
    isFallback: false,
    retryCount: 0,
    retryWebRTC: jest.fn(),
    error: null,
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
    ...overrides,
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('CameraModule', () => {
  beforeEach(() => {
    // Reset camera store
    useCameraStore.setState({
      cameras: new Map(),
      activeStreams: new Map(),
      selectedCamera: null,
    })

    // Reset topic store
    useTopicStore.setState({
      topics: [],
      subscriptions: new Set(),
      loading: false,
      error: null,
      lastUpdated: null,
      filterQuery: '',
    })
    ;(useCameraStream as jest.Mock).mockReturnValue({
      camera: null,
      modePreference: 'auto',
      setModePreference: jest.fn(),
      activeMode: null,
      streamUrl: null,
      status: 'stopped',
      streamState: 'idle',
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      fps: null,
      latency: null,
      frameDataUrl: null,
      rawData: null,
      frameMetadata: null,
      mediaStream: null,
      isFallback: false,
      retryCount: 0,
      retryWebRTC: jest.fn(),
      error: null,
    })
  })

  describe('rendering', () => {
    it('should render camera module', () => {
      render(<CameraModule windowId="test-window" />)

      expect(screen.getByTestId('module-camera-test-window')).toBeInTheDocument()
    })

    it('should show placeholder when no cameras', () => {
      render(<CameraModule windowId="test-window" />)

      expect(screen.getByText(/no cameras/i)).toBeInTheDocument()
    })
  })

  describe('with cameras', () => {
    beforeEach(() => {
      const camera = createTestCamera()
      useCameraStore.getState().addCamera(camera)
    })

    it('should not show "No Signal" when topics list is empty but an active camera topic exists', () => {
      const camera = createTestCamera({ topic: '/robot0/front_cam/rgb' })
      useCameraStore.getState().addCamera(camera)
      useCameraStore.getState().selectCamera(camera.id)

      // Simulate active stream even if topic discovery list is empty
      ;(useCameraStream as jest.Mock).mockReturnValue({
        camera,
        modePreference: 'auto',
        setModePreference: jest.fn(),
        activeMode: 'websocket',
        streamUrl: null,
        status: 'playing',
        streamState: 'streaming',
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        fps: 1,
        latency: null,
        frameDataUrl: 'data:image/jpeg;base64,abc',
        rawData: null,
        frameMetadata: null,
        mediaStream: null,
        isFallback: true,
        retryCount: 0,
        retryWebRTC: jest.fn(),
        error: null,
      })

      render(<CameraModule windowId="test-window" />)

      expect(screen.queryByTestId('no-signal-indicator')).not.toBeInTheDocument()
    })

    it('should show camera selector', () => {
      render(<CameraModule windowId="test-window" />)

      expect(screen.getByTestId('camera-selector')).toBeInTheDocument()
    })

    it('should show camera in selector', () => {
      render(<CameraModule windowId="test-window" />)

      expect(screen.getByText(/front camera/i)).toBeInTheDocument()
    })
  })

  describe('mode toggle', () => {
    beforeEach(() => {
      const camera = createTestCamera()
      useCameraStore.getState().addCamera(camera)
      useCameraStore.getState().selectCamera(camera.id)
    })

    it('should show AUTO button', () => {
      render(<CameraModule windowId="test-window" />)

      expect(screen.getByRole('button', { name: /auto/i })).toBeInTheDocument()
    })

    it('should show WebRTC button', () => {
      render(<CameraModule windowId="test-window" />)

      expect(screen.getByRole('button', { name: /webrtc/i })).toBeInTheDocument()
    })
  })

  describe('status bar', () => {
    beforeEach(() => {
      const camera = createTestCamera()
      useCameraStore.getState().addCamera(camera)
      useCameraStore.getState().selectCamera(camera.id)
    })

    it('should show status indicator', () => {
      render(<CameraModule windowId="test-window" />)

      expect(screen.getByTestId('stream-status')).toBeInTheDocument()
    })
  })

  describe('accessibility', () => {
    it('should have appropriate aria labels', () => {
      render(<CameraModule windowId="test-window" />)

      expect(screen.getByTestId('module-camera-test-window')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('Camera')
      )
    })
  })
})
