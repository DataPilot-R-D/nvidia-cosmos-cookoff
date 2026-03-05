/**
 * useWebRTC Hook
 *
 * Manages WebRTC peer connection for low-latency video streaming.
 * Supports go2rtc integration with automatic fallback to legacy mode.
 *
 * Flow (go2rtc mode):
 * 1. Client sends webrtc_request to server
 * 2. Server responds with webrtc_status (connecting/failed)
 * 3. Client creates SDP offer, sends webrtc_offer
 * 4. Server contacts go2rtc, returns webrtc_answer
 * 5. Client sets remote description, connection established
 *
 * @see plan.md Phase 3: Frontend WebRTC Integration
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import type { Socket } from 'socket.io-client'
import type {
  WebRTCOfferMessage,
  WebRTCAnswerMessage,
  WebRTCIceCandidateMessage,
  WebRTCRequestMessage,
  WebRTCStatusMessage,
} from '@workspace/shared-types'

// =============================================================================
// Types
// =============================================================================

/**
 * WebRTC connection state
 */
export type WebRTCConnectionState =
  | 'idle'
  | 'requesting'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'disconnected'

/**
 * Options for useWebRTC hook
 */
export interface UseWebRTCOptions {
  /** Camera ID to connect to */
  cameraId: string | null
  /** Socket.IO client instance for signaling */
  socket?: Socket | null
  /** STUN/TURN servers configuration */
  iceServers?: RTCIceServer[]
  /** Enable hook (default: true) */
  enabled?: boolean
  /** Auto-connect on mount (default: false) */
  autoConnect?: boolean
  /** Connection timeout in ms (default: 20000) */
  connectionTimeout?: number
  /** Callback when fallback is triggered */
  onFallback?: (reason: string) => void
}

/**
 * Return type for useWebRTC hook
 */
export interface UseWebRTCReturn {
  /** Current connection state */
  connectionState: WebRTCConnectionState
  /** Whether connection is established */
  isConnected: boolean
  /** Whether connection is in progress */
  isConnecting: boolean
  /** MediaStream from remote peer */
  mediaStream: MediaStream | null
  /** Connect to camera via WebRTC */
  connect: () => void
  /** Disconnect from camera */
  disconnect: () => void
  /** Reconnect (disconnect then connect) */
  reconnect: () => void
  /** Current latency in ms */
  latency: number | null
  /** Current FPS */
  fps: number | null
  /** Error message if connection failed */
  error: string | null
  /** Whether fallback is active */
  fallbackActive: boolean
  /** go2rtc session ID (for debugging) */
  sessionId: string | null
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

const DEFAULT_CONNECTION_TIMEOUT = 20000 // 20 seconds (go2rtc needs ~10s for RTSP keyframes)

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * useWebRTC Hook
 *
 * Manages WebRTC peer connection for low-latency video streaming.
 * Integrates with go2rtc server via Socket.IO signaling.
 *
 * @param options - Configuration options
 * @returns WebRTC state and controls
 *
 * @example
 * ```tsx
 * function VideoPlayer({ cameraId }: { cameraId: string }) {
 *   const {
 *     mediaStream,
 *     isConnected,
 *     connect,
 *     disconnect,
 *     fallbackActive,
 *   } = useWebRTC({
 *     cameraId,
 *     socket: socketRef.current,
 *     onFallback: (reason) => console.log('Fallback:', reason),
 *   })
 *
 *   return (
 *     <video
 *       ref={(el) => { if (el && mediaStream) el.srcObject = mediaStream }}
 *       autoPlay
 *       playsInline
 *     />
 *   )
 * }
 * ```
 */
export function useWebRTC(options: UseWebRTCOptions): UseWebRTCReturn {
  const {
    cameraId,
    socket,
    iceServers = DEFAULT_ICE_SERVERS,
    enabled = true,
    autoConnect = false,
    connectionTimeout = DEFAULT_CONNECTION_TIMEOUT,
    onFallback,
  } = options

  // State
  const [connectionState, setConnectionState] = useState<WebRTCConnectionState>('idle')
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null)
  const [latency, setLatency] = useState<number | null>(null)
  const [fps, setFps] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fallbackActive, setFallbackActive] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)

  // Refs
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const connectStartTimeRef = useRef<number | null>(null)
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isConnectingRef = useRef(false)

  // Derived state
  const isConnected = connectionState === 'connected'
  const isConnecting = connectionState === 'requesting' || connectionState === 'connecting'

  /**
   * Clear connection timeout
   */
  const clearConnectionTimeout = useCallback(() => {
    if (connectionTimeoutRef.current) {
      clearTimeout(connectionTimeoutRef.current)
      connectionTimeoutRef.current = null
    }
  }, [])

  /**
   * Trigger fallback to WebSocket stream
   */
  const triggerFallback = useCallback(
    (reason: string) => {
      setFallbackActive(true)
      setError(reason)
      onFallback?.(reason)
    },
    [onFallback]
  )

  /**
   * Handle WebRTC status message from server
   */
  const handleStatus = useCallback(
    (message: WebRTCStatusMessage) => {
      if (message.data.cameraId !== cameraId) return

      const {
        status,
        fallbackActive: serverFallback,
        error: serverError,
        sessionId: sid,
      } = message.data

      if (sid) {
        setSessionId(sid)
      }

      if (serverFallback) {
        setFallbackActive(true)
        setConnectionState('failed')
        setError(serverError || 'Server indicated fallback')
        clearConnectionTimeout()
        onFallback?.(serverError || 'Server indicated fallback')
        return
      }

      switch (status) {
        case 'connecting':
          setConnectionState('connecting')
          break
        case 'connected':
          setConnectionState('connected')
          clearConnectionTimeout()
          break
        case 'failed':
          setConnectionState('failed')
          setError(serverError || 'Connection failed')
          clearConnectionTimeout()
          break
        case 'disconnected':
          setConnectionState('disconnected')
          clearConnectionTimeout()
          break
      }
    },
    [cameraId, clearConnectionTimeout, onFallback]
  )

  /**
   * Handle incoming WebRTC answer
   */
  const handleAnswer = useCallback(
    async (message: WebRTCAnswerMessage) => {
      const pc = peerConnectionRef.current
      if (!pc || message.data.cameraId !== cameraId) return

      try {
        const answer = new RTCSessionDescription({
          type: 'answer',
          sdp: message.data.sdp,
        })
        await pc.setRemoteDescription(answer)

        // Calculate signaling latency
        if (connectStartTimeRef.current) {
          const latencyMs = Date.now() - connectStartTimeRef.current
          setLatency(latencyMs)
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to set remote description'
        setError(errorMsg)
        setConnectionState('failed')
        triggerFallback(errorMsg)
      }
    },
    [cameraId, triggerFallback]
  )

  /**
   * Handle incoming ICE candidate
   */
  const handleIceCandidate = useCallback(
    async (message: WebRTCIceCandidateMessage) => {
      const pc = peerConnectionRef.current
      if (!pc || message.data.cameraId !== cameraId) return

      try {
        if (message.data.candidate) {
          const candidate = new RTCIceCandidate({
            candidate: message.data.candidate,
            sdpMid: message.data.sdpMid,
            sdpMLineIndex: message.data.sdpMLineIndex,
          })
          await pc.addIceCandidate(candidate)
        }
      } catch (err) {
        // ICE candidate errors are usually non-fatal (e.g. duplicate or late candidates)
        // but log at debug level for troubleshooting stalled connections
        if (typeof window !== 'undefined' && 'console' in window) {
          window.console.debug('[WebRTC] Failed to add ICE candidate:', err)
        }
      }
    },
    [cameraId]
  )

  /**
   * Connect to camera via WebRTC
   */
  const connect = useCallback(async () => {
    if (!cameraId || !socket || !enabled) return
    if (isConnectingRef.current) return
    if (!socket.id) {
      setError('Socket not connected')
      setConnectionState('failed')
      triggerFallback('Socket not connected')
      return
    }

    isConnectingRef.current = true
    setConnectionState('requesting')
    setError(null)
    setFallbackActive(false)
    connectStartTimeRef.current = Date.now()

    // Set connection timeout
    connectionTimeoutRef.current = setTimeout(() => {
      const pc = peerConnectionRef.current
      if (!pc || pc.connectionState !== 'connected') {
        setConnectionState('failed')
        setError('Connection timeout')
        triggerFallback('Connection timeout')
        isConnectingRef.current = false
      }
    }, connectionTimeout)

    try {
      // Step 1: Send WebRTC request to server
      const requestMsg: WebRTCRequestMessage = {
        type: 'webrtc_request',
        timestamp: Date.now(),
        data: {
          cameraId,
          clientId: socket.id ?? 'unknown',
          action: 'start',
        },
      }
      socket.emit('webrtc_request', requestMsg)

      // Step 2: Create peer connection
      const pc = new RTCPeerConnection({ iceServers })
      peerConnectionRef.current = pc

      // Handle remote track (video stream from camera)
      pc.ontrack = (event: RTCTrackEvent) => {
        if (event.streams && event.streams[0]) {
          setMediaStream(event.streams[0])
          setConnectionState('connected')
          clearConnectionTimeout()
        }
      }

      // Handle ICE candidates to send to remote
      pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate && socket) {
          const iceMessage: WebRTCIceCandidateMessage = {
            type: 'webrtc_ice',
            timestamp: Date.now(),
            data: {
              cameraId,
              clientId: socket.id ?? 'unknown',
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid ?? undefined,
              sdpMLineIndex: event.candidate.sdpMLineIndex ?? undefined,
            },
          }
          socket.emit('webrtc_ice', iceMessage)
        }
      }

      // Handle connection state changes
      pc.onconnectionstatechange = () => {
        switch (pc.connectionState) {
          case 'connected':
            setConnectionState('connected')
            clearConnectionTimeout()
            break
          case 'failed':
            setConnectionState('failed')
            setError('ICE connection failed')
            clearConnectionTimeout()
            triggerFallback('ICE connection failed')
            break
          case 'disconnected':
            setConnectionState('disconnected')
            clearConnectionTimeout()
            break
        }
      }

      // Handle ICE connection state for early failure detection
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') {
          setConnectionState('failed')
          setError('ICE negotiation failed')
          clearConnectionTimeout()
          triggerFallback('ICE negotiation failed')
        }
      }

      // Add transceiver for receiving video
      pc.addTransceiver('video', { direction: 'recvonly' })

      // Step 3: Create offer and send immediately (trickle ICE)
      // go2rtc's WebSocket signaling uses trickle ICE: send SDP offer first,
      // then ICE candidates arrive separately via onicecandidate handler.
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const offerMessage: WebRTCOfferMessage = {
        type: 'webrtc_offer',
        timestamp: Date.now(),
        data: {
          cameraId,
          clientId: socket.id ?? 'unknown',
          sdp: offer.sdp ?? '',
        },
      }
      socket.emit('webrtc_offer', offerMessage)

      setConnectionState('connecting')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create offer'
      setError(errorMsg)
      setConnectionState('failed')
      clearConnectionTimeout()
      triggerFallback(errorMsg)
    } finally {
      isConnectingRef.current = false
    }
  }, [
    cameraId,
    socket,
    enabled,
    iceServers,
    connectionTimeout,
    clearConnectionTimeout,
    triggerFallback,
  ])

  /**
   * Disconnect from camera
   */
  const disconnect = useCallback(() => {
    clearConnectionTimeout()

    const pc = peerConnectionRef.current
    if (pc) {
      pc.close()
      peerConnectionRef.current = null
    }

    // Send stop request to server
    if (socket && cameraId) {
      const stopMsg: WebRTCRequestMessage = {
        type: 'webrtc_request',
        timestamp: Date.now(),
        data: {
          cameraId,
          clientId: socket.id ?? 'unknown',
          action: 'stop',
        },
      }
      socket.emit('webrtc_request', stopMsg)
    }

    setMediaStream(null)
    setConnectionState('idle')
    setLatency(null)
    setFps(null)
    setError(null)
    setFallbackActive(false)
    setSessionId(null)
    isConnectingRef.current = false
  }, [socket, cameraId, clearConnectionTimeout])

  /**
   * Reconnect (disconnect then connect)
   */
  const reconnect = useCallback(() => {
    disconnect()
    // Small delay before reconnecting
    setTimeout(() => {
      connect()
    }, 100)
  }, [disconnect, connect])

  // Register socket listeners for signaling
  useEffect(() => {
    if (!socket || !enabled) return

    socket.on('webrtc_status', handleStatus)
    socket.on('webrtc_answer', handleAnswer)
    socket.on('webrtc_ice', handleIceCandidate)

    return () => {
      socket.off('webrtc_status', handleStatus)
      socket.off('webrtc_answer', handleAnswer)
      socket.off('webrtc_ice', handleIceCandidate)
    }
  }, [socket, enabled, handleStatus, handleAnswer, handleIceCandidate])

  // Poll RTCPeerConnection stats for FPS (non-intrusive, doesn't consume frames)
  useEffect(() => {
    if (!isConnected) return undefined

    const intervalId = setInterval(async () => {
      const pc = peerConnectionRef.current
      if (!pc || pc.connectionState !== 'connected') return

      try {
        const stats = await pc.getStats()
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            const fpsStat = report.framesPerSecond as number | undefined
            if (typeof fpsStat === 'number') {
              setFps(Math.round(fpsStat))
            }
          }
        })
      } catch {
        // Stats API unavailable (e.g. connection closing) — clear stale FPS
        setFps(null)
      }
    }, 1000)

    return () => clearInterval(intervalId)
  }, [isConnected])

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && cameraId && socket && enabled) {
      connect()
    }
  }, [autoConnect, cameraId, socket, enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount or camera change
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [cameraId]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    connectionState,
    isConnected,
    isConnecting,
    mediaStream,
    connect,
    disconnect,
    reconnect,
    latency,
    fps,
    error,
    fallbackActive,
    sessionId,
  }
}

/**
 * Export hook type for testing
 */
export type UseWebRTC = typeof useWebRTC
