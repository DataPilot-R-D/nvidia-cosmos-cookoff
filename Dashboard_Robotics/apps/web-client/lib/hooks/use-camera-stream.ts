/**
 * useCameraStream Hook
 *
 * Manages video streaming for a camera with automatic WebRTC-first strategy
 * and intelligent fallback to WebSocket streaming.
 *
 * State Machine:
 * INITIAL → WEBRTC_TRYING → WEBRTC_ACTIVE
 *                ↓ failure (3 retries)
 *         WEBSOCKET_FALLBACK
 *
 * @see plan.md Phase 4: Fallback Mechanism
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useCameraStore, type StreamStatus } from '../stores/camera-store'
import { useVideoFrameStore } from '../stores/video-frame-store'
import { useWebSocketStore } from '../stores/websocket-store'
import { useWebRTC } from './use-webrtc'
import type { CameraEntity, VideoFrameMetadata } from '@workspace/shared-types'

// =============================================================================
// Types
// =============================================================================

/**
 * Stream mode with WebRTC preference
 */
export type StreamModePreference = 'webrtc' | 'websocket' | 'auto'

/**
 * Internal stream state for state machine
 */
export type StreamState =
  | 'idle'
  | 'webrtc_trying'
  | 'webrtc_active'
  | 'webrtc_retry'
  | 'websocket_fallback'
  | 'websocket_only'

/**
 * Return type for useCameraStream hook
 */
export interface UseCameraStreamReturn {
  /** Camera entity from store */
  camera: CameraEntity | null
  /** Current streaming mode preference */
  modePreference: StreamModePreference
  /** Set streaming mode preference */
  setModePreference: (mode: StreamModePreference) => void
  /** Actual active stream mode */
  activeMode: 'webrtc' | 'websocket' | null
  /** Stream URL (HLS manifest or null for other modes) */
  streamUrl: string | null
  /** Current stream status */
  status: StreamStatus
  /** Internal stream state */
  streamState: StreamState
  /** Subscribe to camera stream */
  subscribe: () => void
  /** Unsubscribe from camera stream */
  unsubscribe: () => void
  /** Force retry WebRTC connection */
  retryWebRTC: () => void
  /** Current FPS (measured) */
  fps: number | null
  /** Latency in ms (WebRTC only) */
  latency: number | null
  /** Current frame data URL (for JPEG mode) */
  frameDataUrl: string | null
  /** Raw frame data for Canvas rendering (for raw format) */
  rawData: Uint8Array | null
  /** Frame metadata (width, height, encoding) */
  frameMetadata: VideoFrameMetadata | null
  /** MediaStream for WebRTC video element */
  mediaStream: MediaStream | null
  /** Whether fallback is active */
  isFallback: boolean
  /** WebRTC retry count */
  retryCount: number
  /** Error message if any */
  error: string | null
}

// =============================================================================
// Configuration
// =============================================================================

const MAX_WEBRTC_RETRIES = 3
const RETRY_DELAY_MS = 2000

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * useCameraStream Hook
 *
 * Manages video streaming lifecycle for a specific camera with
 * automatic WebRTC preference and fallback to WebSocket streaming.
 *
 * @param cameraId - Camera ID to stream from (or null)
 * @param initialModePreference - Initial streaming mode preference (default: 'auto')
 * @returns Stream state and controls
 *
 * @example
 * ```tsx
 * function CameraPlayer({ cameraId }: { cameraId: string }) {
 *   const {
 *     camera,
 *     activeMode,
 *     mediaStream,
 *     frameDataUrl,
 *     fps,
 *     latency,
 *     isFallback,
 *     retryWebRTC,
 *   } = useCameraStream(cameraId, 'auto')
 *
 *   if (!camera) return <div>Camera not found</div>
 *
 *   // Render based on active mode
 *   if (activeMode === 'webrtc' && mediaStream) {
 *     return <video ref={(el) => { if (el) el.srcObject = mediaStream }} autoPlay />
 *   }
 *
 *   if (activeMode === 'websocket' && frameDataUrl) {
 *     return <img src={frameDataUrl} alt="Camera" />
 *   }
 *
 *   return <div>Connecting...</div>
 * }
 * ```
 */
export function useCameraStream(
  cameraId: string | null,
  initialModePreference: StreamModePreference = 'auto'
): UseCameraStreamReturn {
  // Local state
  const [modePreference, setModePreferenceState] =
    useState<StreamModePreference>(initialModePreference)
  const [streamState, setStreamState] = useState<StreamState>('idle')
  const [retryCount, setRetryCount] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Refs
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get camera from store
  const camera = useCameraStore((state) => (cameraId ? state.getCameraById(cameraId) : undefined))
  const setActiveStream = useCameraStore((state) => state.setActiveStream)
  const removeActiveStream = useCameraStore((state) => state.removeActiveStream)

  // Get socket from WebSocket store
  const socket = useWebSocketStore((state) => state.socket)

  // Determine if WebRTC should be enabled
  const webrtcEnabled = useMemo(() => {
    if (modePreference === 'websocket') return false
    if (modePreference === 'webrtc') return true
    // Auto mode: try WebRTC first, unless already in fallback
    return streamState !== 'websocket_fallback' && streamState !== 'websocket_only'
  }, [modePreference, streamState])

  // WebRTC hook
  const webrtc = useWebRTC({
    cameraId,
    socket,
    enabled: webrtcEnabled && streamState !== 'websocket_fallback',
    autoConnect: false,
    onFallback: useCallback((reason: string) => {
      setError(reason)
      // Fallback handled by state machine below
    }, []),
  })

  // Ref to access latest webrtc state inside timeouts (avoids stale closures)
  const webrtcRef = useRef(webrtc)
  webrtcRef.current = webrtc

  // Get frame data from video frame store (WebSocket frames)
  const frameState = useVideoFrameStore((state) => (cameraId ? state.frames[cameraId] : undefined))
  const wsFrameDataUrl = frameState?.dataUrl ?? null
  const wsRawData = frameState?.rawData ?? null
  const wsFrameMetadata = frameState?.metadata ?? null
  const wsFps = frameState?.fps ?? null

  // Compute active mode and unified state
  const activeMode = useMemo((): 'webrtc' | 'websocket' | null => {
    if (streamState === 'webrtc_active' && webrtc.isConnected) {
      return 'webrtc'
    }
    if (streamState === 'websocket_fallback' || streamState === 'websocket_only') {
      return 'websocket'
    }
    return null
  }, [streamState, webrtc.isConnected])

  // Compute status
  const status = useMemo((): StreamStatus => {
    switch (streamState) {
      case 'idle':
        return 'stopped'
      case 'webrtc_trying':
      case 'webrtc_retry':
        return 'connecting'
      case 'webrtc_active':
        return webrtc.isConnected ? 'live' : 'connecting'
      case 'websocket_fallback':
      case 'websocket_only':
        return wsFrameDataUrl ? 'live' : 'connecting'
      default:
        return 'stopped'
    }
  }, [streamState, webrtc.isConnected, wsFrameDataUrl])

  // Compute unified FPS (prefer WebRTC when connected)
  const fps = useMemo(() => {
    if (activeMode === 'webrtc') return webrtc.fps
    return wsFps
  }, [activeMode, webrtc.fps, wsFps])

  // Compute HLS URL (for backwards compatibility)
  const streamUrl = useMemo(() => {
    if (!camera) return null
    return camera.hlsUrl ?? null
  }, [camera])

  // Whether fallback is active
  const isFallback = streamState === 'websocket_fallback'

  /**
   * Set mode preference
   */
  const setModePreference = useCallback((newMode: StreamModePreference) => {
    setModePreferenceState(newMode)
    setRetryCount(0)
    setError(null)

    // Reset state based on new mode
    if (newMode === 'websocket') {
      setStreamState('websocket_only')
    } else if (newMode === 'webrtc' || newMode === 'auto') {
      setStreamState('idle')
    }
  }, [])

  /**
   * Clear retry timeout
   */
  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }
  }, [])

  /**
   * Subscribe to camera stream
   */
  const subscribe = useCallback(() => {
    if (!cameraId || !camera) {
      return
    }

    setError(null)
    clearRetryTimeout()

    // Determine initial state based on mode preference
    if (modePreference === 'websocket') {
      setStreamState('websocket_only')
    } else {
      // Try WebRTC first
      setStreamState('webrtc_trying')
      setRetryCount(0)
      webrtc.connect()
    }

    // Update store with active stream
    setActiveStream(cameraId, {
      mode: modePreference === 'websocket' ? 'hls' : 'webrtc',
      status: 'connecting',
      startedAt: Date.now(),
    })
  }, [cameraId, camera, modePreference, setActiveStream, clearRetryTimeout, webrtc])

  /**
   * Unsubscribe from camera stream
   */
  const unsubscribe = useCallback(() => {
    if (!cameraId) return

    clearRetryTimeout()
    webrtc.disconnect()
    setStreamState('idle')
    setRetryCount(0)
    setError(null)
    removeActiveStream(cameraId)

    // Clear frames from video frame store
    useVideoFrameStore.getState().clearFrames(cameraId)
  }, [cameraId, removeActiveStream, clearRetryTimeout, webrtc])

  /**
   * Force retry WebRTC connection
   */
  const retryWebRTC = useCallback(() => {
    if (!cameraId) return

    clearRetryTimeout()
    setRetryCount(0)
    setError(null)
    setStreamState('webrtc_trying')
    webrtc.reconnect()
  }, [cameraId, clearRetryTimeout, webrtc])

  // =============================================================================
  // State Machine Effects
  // =============================================================================

  // Handle WebRTC connection state changes
  useEffect(() => {
    if (streamState !== 'webrtc_trying' && streamState !== 'webrtc_retry') return

    if (webrtc.isConnected) {
      // WebRTC connected successfully
      setStreamState('webrtc_active')
      setRetryCount(0)
      setError(null)

      if (cameraId) {
        setActiveStream(cameraId, {
          mode: 'webrtc',
          status: 'live',
          startedAt: Date.now(),
        })
      }
    } else if (webrtc.fallbackActive || webrtc.connectionState === 'failed') {
      // WebRTC failed
      const currentRetry = retryCount + 1
      setRetryCount(currentRetry)

      if (currentRetry < MAX_WEBRTC_RETRIES && modePreference !== 'websocket') {
        // Retry WebRTC
        setStreamState('webrtc_retry')
        setError(`WebRTC retry ${currentRetry}/${MAX_WEBRTC_RETRIES}: ${webrtc.error}`)

        retryTimeoutRef.current = setTimeout(() => {
          webrtc.reconnect()
          setStreamState('webrtc_trying')
        }, RETRY_DELAY_MS)
      } else {
        // Max retries reached, fall back to WebSocket
        setStreamState('websocket_fallback')
        // Show error briefly, then clear to avoid permanent error spam
        setError(`Falling back to WebSocket stream`)

        if (cameraId) {
          setActiveStream(cameraId, {
            mode: 'hls', // Use HLS mode for WebSocket fallback (backwards compat)
            status: 'live',
            startedAt: Date.now(),
          })
        }

        // Clear error after 5s so the UI doesn't stay red forever
        setTimeout(() => setError(null), 5000)
      }
    }
  }, [
    streamState,
    webrtc.isConnected,
    webrtc.fallbackActive,
    webrtc.connectionState,
    webrtc.error,
    retryCount,
    modePreference,
    cameraId,
    setActiveStream,
    webrtc,
  ])

  // Handle WebRTC disconnection while active
  useEffect(() => {
    if (streamState !== 'webrtc_active') return undefined
    if (webrtc.connectionState !== 'disconnected' && webrtc.connectionState !== 'failed')
      return undefined

    // Connection lost while streaming was previously working.
    // 'disconnected' may self-recover via ICE, so give it a grace period.
    // 'failed' is terminal - reconnect quickly.
    const delay = webrtc.connectionState === 'disconnected' ? 3000 : 500

    const recoveryTimeout = setTimeout(() => {
      // Use ref to read current state (avoid stale closure)
      const current = webrtcRef.current
      if (current.connectionState === 'connected') return

      // Reset retry count since the connection was previously working
      // (the retry-limit logic in the main state machine effect will
      //  still count retries if subsequent reconnection attempts fail)
      setRetryCount(0)
      setStreamState('webrtc_trying')
      current.reconnect()
    }, delay)

    return () => clearTimeout(recoveryTimeout)
  }, [streamState, webrtc.connectionState])

  // No-stream timeout: if websocket_fallback has no frames after 10s, show "no stream"
  useEffect(() => {
    if (streamState !== 'websocket_fallback') return undefined
    if (wsFrameDataUrl) return undefined // Already receiving frames

    const noStreamTimeout = setTimeout(() => {
      if (!wsFrameDataUrl) {
        setError('No stream available — camera may be offline')
      }
    }, 10000)

    return () => clearTimeout(noStreamTimeout)
  }, [streamState, wsFrameDataUrl])

  // Auto-subscribe when camera is available
  useEffect(() => {
    if (camera && cameraId && streamState === 'idle') {
      subscribe()
    }

    return () => {
      clearRetryTimeout()
    }
  }, [cameraId, camera?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearRetryTimeout()
      if (cameraId) {
        removeActiveStream(cameraId)
      }
    }
  }, [cameraId, clearRetryTimeout, removeActiveStream])

  return {
    camera: camera ?? null,
    modePreference,
    setModePreference,
    activeMode,
    streamUrl,
    status,
    streamState,
    subscribe,
    unsubscribe,
    retryWebRTC,
    fps,
    latency: webrtc.latency,
    frameDataUrl: wsFrameDataUrl,
    rawData: wsRawData,
    frameMetadata: wsFrameMetadata,
    mediaStream: webrtc.mediaStream,
    isFallback,
    retryCount,
    error,
  }
}

/**
 * Export hook type for testing
 */
export type UseCameraStream = typeof useCameraStream
