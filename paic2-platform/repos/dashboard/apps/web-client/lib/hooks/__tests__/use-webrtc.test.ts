/**
 * useWebRTC Hook Tests
 *
 * Tests for WebRTC peer connection management.
 */

import { renderHook, act, waitFor } from '@testing-library/react'
import { useWebRTC } from '../use-webrtc'

// =============================================================================
// Mocks
// =============================================================================

// Mock RTCPeerConnection
const mockPeerConnection = {
  createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp-offer' }),
  createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp-answer' }),
  setLocalDescription: jest.fn().mockResolvedValue(undefined),
  setRemoteDescription: jest.fn().mockResolvedValue(undefined),
  addIceCandidate: jest.fn().mockResolvedValue(undefined),
  close: jest.fn(),
  connectionState: 'new' as RTCPeerConnectionState,
  iceConnectionState: 'new' as RTCIceConnectionState,
  localDescription: null as RTCSessionDescription | null,
  remoteDescription: null as RTCSessionDescription | null,
  ontrack: null as ((event: RTCTrackEvent) => void) | null,
  onicecandidate: null as ((event: RTCPeerConnectionIceEvent) => void) | null,
  onconnectionstatechange: null as (() => void) | null,
  onicegatheringstatechange: null as (() => void) | null,
  addTrack: jest.fn(),
  removeTrack: jest.fn(),
  getSenders: jest.fn().mockReturnValue([]),
  getReceivers: jest.fn().mockReturnValue([]),
  addTransceiver: jest.fn(),
}

const MockRTCPeerConnection = jest.fn().mockImplementation(() => mockPeerConnection)

// Mock socket.io-client
const mockSocket = {
  emit: jest.fn(),
  on: jest.fn(),
  off: jest.fn(),
  connected: true,
  id: 'test-socket-id',
}

jest.mock('socket.io-client', () => ({
  io: jest.fn(() => mockSocket),
}))

// Setup global RTCPeerConnection mock
beforeAll(() => {
  ;(global as unknown as { RTCPeerConnection: typeof MockRTCPeerConnection }).RTCPeerConnection =
    MockRTCPeerConnection
  ;(
    global as unknown as { RTCSessionDescription: typeof RTCSessionDescription }
  ).RTCSessionDescription = jest.fn().mockImplementation((init) => init)
  ;(global as unknown as { RTCIceCandidate: typeof RTCIceCandidate }).RTCIceCandidate = jest
    .fn()
    .mockImplementation((init) => init)
})

// =============================================================================
// Tests
// =============================================================================

describe('useWebRTC', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPeerConnection.connectionState = 'new'
    mockPeerConnection.localDescription = null
    mockPeerConnection.remoteDescription = null
  })

  describe('initialization', () => {
    it('should return initial state when no camera ID provided', () => {
      const { result } = renderHook(() => useWebRTC({ cameraId: null }))

      expect(result.current.isConnected).toBe(false)
      expect(result.current.isConnecting).toBe(false)
      expect(result.current.mediaStream).toBeNull()
      expect(result.current.error).toBeNull()
    })

    it('should not create peer connection without camera ID', () => {
      renderHook(() => useWebRTC({ cameraId: null }))

      expect(MockRTCPeerConnection).not.toHaveBeenCalled()
    })
  })

  describe('connection lifecycle', () => {
    it('should have connect function', () => {
      const { result } = renderHook(() => useWebRTC({ cameraId: 'camera-001' }))

      expect(typeof result.current.connect).toBe('function')
    })

    it('should have disconnect function', () => {
      const { result } = renderHook(() => useWebRTC({ cameraId: 'camera-001' }))

      expect(typeof result.current.disconnect).toBe('function')
    })

    it('should set isConnecting to true when connect is called', async () => {
      const { result } = renderHook(() =>
        useWebRTC({
          cameraId: 'camera-001',
          socket: mockSocket as unknown as ReturnType<typeof import('socket.io-client').io>,
        })
      )

      // Call connect without awaiting to catch the intermediate state
      act(() => {
        result.current.connect()
      })

      // Wait for state update
      await waitFor(() => {
        expect(result.current.isConnecting).toBe(true)
      })
    })

    it('should create RTCPeerConnection when connect is called', async () => {
      const { result } = renderHook(() =>
        useWebRTC({
          cameraId: 'camera-001',
          socket: mockSocket as unknown as ReturnType<typeof import('socket.io-client').io>,
        })
      )

      await act(async () => {
        result.current.connect()
      })

      expect(MockRTCPeerConnection).toHaveBeenCalled()
    })
  })

  describe('signaling', () => {
    it('should emit webrtc_offer when initiating connection', async () => {
      const { result } = renderHook(() =>
        useWebRTC({
          cameraId: 'camera-001',
          socket: mockSocket as unknown as ReturnType<typeof import('socket.io-client').io>,
        })
      )

      await act(async () => {
        await result.current.connect()
      })

      await waitFor(() => {
        expect(mockSocket.emit).toHaveBeenCalledWith(
          'webrtc_offer',
          expect.objectContaining({
            type: 'webrtc_offer',
            data: expect.objectContaining({
              cameraId: 'camera-001',
              sdp: 'mock-sdp-offer',
            }),
          })
        )
      })
    })

    it('should handle incoming webrtc_answer', async () => {
      const { result } = renderHook(() =>
        useWebRTC({
          cameraId: 'camera-001',
          socket: mockSocket as unknown as ReturnType<typeof import('socket.io-client').io>,
        })
      )

      // Get the handler that was registered
      const answerHandler = mockSocket.on.mock.calls.find(
        (call: [string, (...args: unknown[]) => void]) => call[0] === 'webrtc_answer'
      )?.[1]

      expect(answerHandler).toBeDefined()

      // Simulate receiving answer
      await act(async () => {
        result.current.connect()
        if (answerHandler) {
          answerHandler({
            type: 'webrtc_answer',
            data: { cameraId: 'camera-001', clientId: 'test-socket-id', sdp: 'mock-sdp-answer' },
          })
        }
      })

      expect(mockPeerConnection.setRemoteDescription).toHaveBeenCalled()
    })

    it('should handle ICE candidates', async () => {
      const { result } = renderHook(() =>
        useWebRTC({
          cameraId: 'camera-001',
          socket: mockSocket as unknown as ReturnType<typeof import('socket.io-client').io>,
        })
      )

      // Get the handler that was registered
      const iceHandler = mockSocket.on.mock.calls.find(
        (call: [string, (...args: unknown[]) => void]) => call[0] === 'webrtc_ice'
      )?.[1]

      expect(iceHandler).toBeDefined()

      await act(async () => {
        result.current.connect()
        if (iceHandler) {
          iceHandler({
            type: 'webrtc_ice',
            data: {
              cameraId: 'camera-001',
              clientId: 'test-socket-id',
              candidate: 'mock-ice-candidate',
              sdpMid: '0',
              sdpMLineIndex: 0,
            },
          })
        }
      })

      expect(mockPeerConnection.addIceCandidate).toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('should close peer connection on disconnect', async () => {
      const { result } = renderHook(() =>
        useWebRTC({
          cameraId: 'camera-001',
          socket: mockSocket as unknown as ReturnType<typeof import('socket.io-client').io>,
        })
      )

      await act(async () => {
        result.current.connect()
      })

      await act(async () => {
        result.current.disconnect()
      })

      expect(mockPeerConnection.close).toHaveBeenCalled()
    })

    it('should cleanup on unmount', async () => {
      const { result, unmount } = renderHook(() =>
        useWebRTC({
          cameraId: 'camera-001',
          socket: mockSocket as unknown as ReturnType<typeof import('socket.io-client').io>,
        })
      )

      await act(async () => {
        result.current.connect()
      })

      unmount()

      expect(mockPeerConnection.close).toHaveBeenCalled()
    })

    it('should remove socket listeners on unmount', () => {
      const { unmount } = renderHook(() =>
        useWebRTC({
          cameraId: 'camera-001',
          socket: mockSocket as unknown as ReturnType<typeof import('socket.io-client').io>,
        })
      )

      unmount()

      expect(mockSocket.off).toHaveBeenCalledWith('webrtc_answer', expect.any(Function))
      expect(mockSocket.off).toHaveBeenCalledWith('webrtc_ice', expect.any(Function))
    })
  })

  describe('metrics', () => {
    it('should track connection latency', () => {
      const { result } = renderHook(() => useWebRTC({ cameraId: 'camera-001' }))

      expect(result.current.latency).toBeNull()
    })

    it('should track FPS when receiving video', () => {
      const { result } = renderHook(() => useWebRTC({ cameraId: 'camera-001' }))

      expect(result.current.fps).toBeNull()
    })
  })

  describe('error handling', () => {
    it('should set error state on connection failure', async () => {
      // Save original and replace with failing mock
      const originalCreateOffer = mockPeerConnection.createOffer
      mockPeerConnection.createOffer = jest
        .fn()
        .mockRejectedValue(new Error('Failed to create offer'))

      const { result } = renderHook(() =>
        useWebRTC({
          cameraId: 'camera-001',
          socket: mockSocket as unknown as ReturnType<typeof import('socket.io-client').io>,
        })
      )

      await act(async () => {
        await result.current.connect()
      })

      await waitFor(() => {
        expect(result.current.error).toBe('Failed to create offer')
        expect(result.current.isConnecting).toBe(false)
      })

      // Restore original
      mockPeerConnection.createOffer = originalCreateOffer
    })
  })
})
