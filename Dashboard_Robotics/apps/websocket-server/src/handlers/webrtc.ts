/**
 * WebRTC Signaling Handlers
 *
 * Handles WebRTC signaling for video streaming, supporting two modes:
 *
 * 1. **go2rtc Mode (Primary)**: Direct WebRTC from go2rtc server
 *    - Client sends webrtc_request -> Server creates session with go2rtc
 *    - go2rtc sends SDP answer -> Server forwards to client
 *    - Lower latency, better quality (FPS depends on RTSP source and go2rtc config)
 *
 * 2. **Legacy Mode (Fallback)**: Relay via ROS bridge
 *    - Original implementation for backwards compatibility
 *    - Used when go2rtc is unavailable
 *
 * @see plan.md Phase 2: WebSocket Server Integration
 */

import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Logger } from 'pino'
import { createGo2RTCClient, type Go2RTCClient } from '../services/go2rtc-client'
import {
  WebRTCOfferMessageSchema,
  WebRTCAnswerMessageSchema,
  WebRTCIceCandidateMessageSchema,
  WebRTCRequestMessageSchema,
  type WebRTCOfferMessage,
  type WebRTCAnswerMessage,
  type WebRTCIceCandidateMessage,
  type WebRTCRequestMessage,
  type WebRTCStatusMessage,
} from '@workspace/shared-types'

// =============================================================================
// Types
// =============================================================================

export interface WebRTCSession {
  cameraId: string
  clientId: string
  clientSocketId: string
  status: 'pending' | 'connected' | 'failed'
  createdAt: number
  /** go2rtc session ID (if using go2rtc mode) */
  go2rtcSessionId?: string
  /** Session mode */
  mode: 'go2rtc' | 'legacy'
}

export interface WebRTCRegistry {
  sessions: Map<string, WebRTCSession> // `${cameraId}:${clientId}` -> session
  go2rtcClient: Go2RTCClient | null
  go2rtcAvailable: boolean
}

// =============================================================================
// WebRTC Registry
// =============================================================================

/**
 * Create a new WebRTC registry
 */
export function createWebRTCRegistry(logger: Logger): WebRTCRegistry {
  // Initialize go2rtc client
  const go2rtcClient = createGo2RTCClient({ logger })

  return {
    sessions: new Map(),
    go2rtcClient,
    go2rtcAvailable: false, // Will be set after health check
  }
}

/**
 * Generate session key
 */
function getSessionKey(cameraId: string, clientId: string): string {
  return `${cameraId}:${clientId}`
}

/**
 * Initialize go2rtc connection and check availability
 */
export async function initializeGo2RTC(registry: WebRTCRegistry, logger: Logger): Promise<void> {
  if (!registry.go2rtcClient) {
    logger.warn('go2rtc client not initialized')
    return
  }

  try {
    const isHealthy = await registry.go2rtcClient.healthCheck()
    registry.go2rtcAvailable = isHealthy

    if (isHealthy) {
      const streams = await registry.go2rtcClient.listStreams()
      logger.info(
        { streamCount: Object.keys(streams).length, streams: Object.keys(streams) },
        'go2rtc connected, available streams'
      )
    } else {
      logger.warn('go2rtc health check failed, falling back to legacy mode')
    }
  } catch (error) {
    logger.warn({ error }, 'go2rtc not available, using legacy WebRTC relay')
    registry.go2rtcAvailable = false
  }
}

// =============================================================================
// go2rtc Mode Handlers
// =============================================================================

/**
 * Handle WebRTC session request (go2rtc mode)
 *
 * Client sends a request to start/stop WebRTC session.
 * For start: registers session and notifies client that connection is in progress.
 * The actual SDP exchange happens when the client sends its offer via webrtc_offer.
 */
async function handleWebRTCRequest(
  _io: SocketIOServer,
  socket: Socket,
  registry: WebRTCRegistry,
  logger: Logger,
  data: WebRTCRequestMessage
): Promise<void> {
  const { cameraId, clientId, action } = data.data
  const sessionKey = getSessionKey(cameraId, clientId)

  if (action === 'stop') {
    // Stop WebRTC session
    const session = registry.sessions.get(sessionKey)
    if (session?.go2rtcSessionId) {
      registry.go2rtcClient?.closeSession(session.go2rtcSessionId)
    }
    registry.sessions.delete(sessionKey)

    // Notify client
    const statusMsg: WebRTCStatusMessage = {
      type: 'webrtc_status',
      timestamp: Date.now(),
      data: {
        cameraId,
        clientId,
        status: 'disconnected',
        fallbackActive: false,
      },
    }
    socket.emit('webrtc_status', statusMsg)
    return
  }

  // Start WebRTC session
  logger.info({ cameraId, clientId }, 'WebRTC request received')

  // Check if go2rtc is available
  if (!registry.go2rtcAvailable || !registry.go2rtcClient) {
    logger.info({ cameraId }, 'go2rtc not available, client should use fallback')

    // Notify client to use fallback
    const statusMsg: WebRTCStatusMessage = {
      type: 'webrtc_status',
      timestamp: Date.now(),
      data: {
        cameraId,
        clientId,
        status: 'failed',
        fallbackActive: true,
        error: 'go2rtc not available',
      },
    }
    socket.emit('webrtc_status', statusMsg)
    return
  }

  // Notify client that we're connecting
  const connectingMsg: WebRTCStatusMessage = {
    type: 'webrtc_status',
    timestamp: Date.now(),
    data: {
      cameraId,
      clientId,
      status: 'connecting',
      fallbackActive: false,
    },
  }
  socket.emit('webrtc_status', connectingMsg)

  // Create session record
  registry.sessions.set(sessionKey, {
    cameraId,
    clientId,
    clientSocketId: socket.id,
    status: 'pending',
    createdAt: Date.now(),
    mode: 'go2rtc',
  })
}

/**
 * Handle WebRTC offer from client (go2rtc mode)
 *
 * Client sends SDP offer, server forwards to go2rtc,
 * go2rtc returns SDP answer, server forwards to client.
 */
async function handleWebRTCOfferGo2RTC(
  _io: SocketIOServer,
  socket: Socket,
  registry: WebRTCRegistry,
  logger: Logger,
  data: WebRTCOfferMessage
): Promise<void> {
  const { cameraId, clientId, sdp } = data.data
  const sessionKey = getSessionKey(cameraId, clientId)
  const session = registry.sessions.get(sessionKey)

  if (!session || session.mode !== 'go2rtc') {
    logger.warn({ cameraId, clientId }, 'No go2rtc session found for offer')
    const noSessionMsg: WebRTCStatusMessage = {
      type: 'webrtc_status',
      timestamp: Date.now(),
      data: {
        cameraId,
        clientId,
        status: 'failed',
        fallbackActive: true,
        error: 'No go2rtc session found for offer',
      },
    }
    socket.emit('webrtc_status', noSessionMsg)
    return
  }

  if (!registry.go2rtcClient) {
    logger.error({ cameraId }, 'go2rtc client not available')
    const noClientMsg: WebRTCStatusMessage = {
      type: 'webrtc_status',
      timestamp: Date.now(),
      data: {
        cameraId,
        clientId,
        status: 'failed',
        fallbackActive: true,
        error: 'go2rtc client not available',
      },
    }
    socket.emit('webrtc_status', noClientMsg)
    return
  }

  try {
    // Map camera ID to go2rtc stream name
    const streamName = registry.go2rtcClient.mapCameraToStream(cameraId)
    logger.info({ cameraId, streamName, clientId }, 'Creating go2rtc session')

    // Send client's offer to go2rtc, get answer back
    const go2rtcSession = await registry.go2rtcClient.createSession(streamName, sdp)

    if (!go2rtcSession.sdpAnswer) {
      throw new Error('No SDP answer received from go2rtc')
    }

    // Update session with go2rtc session ID (immutable)
    registry.sessions.set(sessionKey, {
      ...session,
      go2rtcSessionId: go2rtcSession.sessionId,
      status: 'connected',
    })

    // Relay ICE candidates from go2rtc to browser.
    // Guard with socket.connected to avoid emitting on a stale socket
    // reference after the client disconnects.
    registry.go2rtcClient.onCandidate(go2rtcSession.sessionId, (candidate: string) => {
      if (!socket.connected) return
      const iceMsg: WebRTCIceCandidateMessage = {
        type: 'webrtc_ice',
        timestamp: Date.now(),
        data: {
          cameraId,
          clientId,
          candidate: candidate || null,
          sdpMid: '0',
          sdpMLineIndex: 0,
        },
      }
      socket.emit('webrtc_ice', iceMsg)
    })

    // Send answer back to client
    const answerMsg: WebRTCAnswerMessage = {
      type: 'webrtc_answer',
      timestamp: Date.now(),
      data: {
        cameraId,
        clientId,
        sdp: go2rtcSession.sdpAnswer,
      },
    }
    logger.debug(
      { cameraId, clientId, sdpAnswerLen: go2rtcSession.sdpAnswer.length },
      'Emitting webrtc_answer to client'
    )
    socket.emit('webrtc_answer', answerMsg)

    // Notify client of successful connection
    const statusMsg: WebRTCStatusMessage = {
      type: 'webrtc_status',
      timestamp: Date.now(),
      data: {
        cameraId,
        clientId,
        status: 'connected',
        fallbackActive: false,
        sessionId: go2rtcSession.sessionId,
      },
    }
    socket.emit('webrtc_status', statusMsg)

    logger.info(
      { cameraId, clientId, sessionId: go2rtcSession.sessionId },
      'WebRTC session established via go2rtc'
    )
  } catch (error) {
    logger.error({ cameraId, clientId, error }, 'Failed to create go2rtc session')

    // Mark session as failed (immutable)
    registry.sessions.set(sessionKey, { ...session, status: 'failed' })

    // Notify client to fallback
    const statusMsg: WebRTCStatusMessage = {
      type: 'webrtc_status',
      timestamp: Date.now(),
      data: {
        cameraId,
        clientId,
        status: 'failed',
        fallbackActive: true,
        error: error instanceof Error ? error.message : 'go2rtc session failed',
      },
    }
    socket.emit('webrtc_status', statusMsg)
  }
}

// =============================================================================
// Legacy Mode Handlers (ROS Bridge Relay)
// =============================================================================

/**
 * Handle WebRTC offer (legacy mode - relay to ROS bridge)
 */
function handleWebRTCOfferLegacy(
  _io: SocketIOServer,
  socket: Socket,
  registry: WebRTCRegistry,
  logger: Logger,
  data: WebRTCOfferMessage
): void {
  const { cameraId, clientId } = data.data
  logger.info({ cameraId, clientId }, 'WebRTC offer received (legacy mode)')

  // Create session
  const sessionKey = getSessionKey(cameraId, clientId)
  registry.sessions.set(sessionKey, {
    cameraId,
    clientId,
    clientSocketId: socket.id,
    status: 'pending',
    createdAt: Date.now(),
    mode: 'legacy',
  })

  // Forward to ROS bridge (broadcast to all except sender)
  socket.broadcast.emit('webrtc_offer', data)
}

/**
 * Handle WebRTC answer (legacy mode - from ROS bridge)
 */
function handleWebRTCAnswerLegacy(
  io: SocketIOServer,
  _socket: Socket,
  registry: WebRTCRegistry,
  logger: Logger,
  data: WebRTCAnswerMessage
): void {
  const { cameraId, clientId } = data.data
  logger.info({ cameraId, clientId }, 'WebRTC answer received (legacy mode)')

  // Find the client session
  const sessionKey = getSessionKey(cameraId, clientId)
  const session = registry.sessions.get(sessionKey)

  if (session) {
    // Update session status (immutable)
    registry.sessions.set(sessionKey, { ...session, status: 'connected' })

    // Send answer directly to the client
    io.to(session.clientSocketId).emit('webrtc_answer', data)
  } else {
    logger.warn({ cameraId, clientId }, 'WebRTC session not found for legacy answer')
    // Notify the originating socket so the sender knows the answer was dropped
    const failMsg: WebRTCStatusMessage = {
      type: 'webrtc_status',
      timestamp: Date.now(),
      data: {
        cameraId,
        clientId,
        status: 'failed',
        fallbackActive: false,
        error: 'No session found for WebRTC answer',
      },
    }
    _socket.emit('webrtc_status', failMsg)
  }
}

// =============================================================================
// WebRTC Event Handlers
// =============================================================================

/**
 * Register WebRTC signaling handlers for a socket
 */
export function registerWebRTCHandlers(
  io: SocketIOServer,
  socket: Socket,
  registry: WebRTCRegistry,
  logger: Logger
): void {
  // Handle WebRTC request (go2rtc mode entry point)
  socket.on('webrtc_request', async (rawData: unknown) => {
    const parsed = WebRTCRequestMessageSchema.safeParse(rawData)
    if (!parsed.success) {
      logger.warn(
        { error: parsed.error.message },
        'Invalid webrtc_request message, notifying client'
      )
      // Try to extract identifiers for client notification
      const raw = rawData as Record<string, unknown> | undefined
      const rawData_ = raw?.data as Record<string, unknown> | undefined
      const cId = typeof rawData_?.cameraId === 'string' ? rawData_.cameraId : 'unknown'
      const clId = typeof rawData_?.clientId === 'string' ? rawData_.clientId : 'unknown'
      const failMsg: WebRTCStatusMessage = {
        type: 'webrtc_status',
        timestamp: Date.now(),
        data: {
          cameraId: cId,
          clientId: clId,
          status: 'failed',
          fallbackActive: false,
          error: 'Invalid message format',
        },
      }
      socket.emit('webrtc_status', failMsg)
      return
    }
    const data = parsed.data
    try {
      await handleWebRTCRequest(io, socket, registry, logger, data)
    } catch (err) {
      const { cameraId, clientId } = data.data
      logger.error({ error: err, cameraId, clientId }, 'Unhandled error in webrtc_request handler')
      const failMsg: WebRTCStatusMessage = {
        type: 'webrtc_status',
        timestamp: Date.now(),
        data: {
          cameraId,
          clientId,
          status: 'failed',
          fallbackActive: true,
          error: err instanceof Error ? err.message : 'Internal server error',
        },
      }
      socket.emit('webrtc_status', failMsg)
    }
  })

  // Handle WebRTC offer
  socket.on('webrtc_offer', async (rawData: unknown) => {
    const parsed = WebRTCOfferMessageSchema.safeParse(rawData)
    if (!parsed.success) {
      logger.warn({ error: parsed.error.message }, 'Invalid webrtc_offer message, notifying client')
      const raw = rawData as Record<string, unknown> | undefined
      const rawData_ = raw?.data as Record<string, unknown> | undefined
      const cId = typeof rawData_?.cameraId === 'string' ? rawData_.cameraId : 'unknown'
      const clId = typeof rawData_?.clientId === 'string' ? rawData_.clientId : 'unknown'
      const failMsg: WebRTCStatusMessage = {
        type: 'webrtc_status',
        timestamp: Date.now(),
        data: {
          cameraId: cId,
          clientId: clId,
          status: 'failed',
          fallbackActive: true,
          error: 'Invalid message format',
        },
      }
      socket.emit('webrtc_status', failMsg)
      return
    }
    const data = parsed.data
    try {
      const { cameraId, clientId } = data.data
      const sessionKey = getSessionKey(cameraId, clientId)
      const session = registry.sessions.get(sessionKey)

      if (session?.mode === 'go2rtc') {
        // go2rtc mode
        await handleWebRTCOfferGo2RTC(io, socket, registry, logger, data)
      } else if (registry.go2rtcAvailable && registry.go2rtcClient) {
        // Auto-create go2rtc session if go2rtc is available
        registry.sessions.set(sessionKey, {
          cameraId,
          clientId,
          clientSocketId: socket.id,
          status: 'pending',
          createdAt: Date.now(),
          mode: 'go2rtc',
        })
        await handleWebRTCOfferGo2RTC(io, socket, registry, logger, data)
      } else {
        // Legacy mode
        handleWebRTCOfferLegacy(io, socket, registry, logger, data)
      }
    } catch (err) {
      const { cameraId, clientId } = data.data
      logger.error({ error: err, cameraId, clientId }, 'Unhandled error in webrtc_offer handler')
      const failMsg: WebRTCStatusMessage = {
        type: 'webrtc_status',
        timestamp: Date.now(),
        data: {
          cameraId,
          clientId,
          status: 'failed',
          fallbackActive: true,
          error: err instanceof Error ? err.message : 'Internal server error',
        },
      }
      socket.emit('webrtc_status', failMsg)
    }
  })

  // Handle WebRTC answer (legacy mode only — go2rtc answers are handled internally)
  socket.on('webrtc_answer', (rawData: unknown) => {
    const parsed = WebRTCAnswerMessageSchema.safeParse(rawData)
    if (!parsed.success) {
      logger.warn({ error: parsed.error.message }, 'Invalid webrtc_answer message')
      return
    }
    const data = parsed.data
    try {
      const { cameraId, clientId } = data.data
      const sessionKey = getSessionKey(cameraId, clientId)
      const session = registry.sessions.get(sessionKey)

      // Only handle in legacy mode (go2rtc answers are handled internally)
      if (session?.mode === 'legacy') {
        handleWebRTCAnswerLegacy(io, socket, registry, logger, data)
      } else {
        logger.debug({ cameraId, clientId }, 'WebRTC answer dropped (no legacy session)')
      }
    } catch (err) {
      logger.error({ error: err }, 'Unhandled error in webrtc_answer handler')
    }
  })

  // Handle ICE candidate (bidirectional)
  socket.on('webrtc_ice', (rawData: unknown) => {
    const parsed = WebRTCIceCandidateMessageSchema.safeParse(rawData)
    if (!parsed.success) {
      logger.warn({ error: parsed.error.message }, 'Invalid webrtc_ice message')
      return
    }
    const data = parsed.data
    try {
      const { cameraId, clientId } = data.data
      logger.debug({ cameraId, clientId }, 'WebRTC ICE candidate')

      const sessionKey = getSessionKey(cameraId, clientId)
      const session = registry.sessions.get(sessionKey)

      if (session) {
        // In go2rtc mode, forward ICE candidates to go2rtc via WebSocket
        if (session.mode === 'go2rtc' && session.go2rtcSessionId && registry.go2rtcClient) {
          registry.go2rtcClient.sendCandidate(session.go2rtcSessionId, data.data.candidate ?? '')
          return
        }

        // Legacy mode: relay ICE candidates
        if (socket.id === session.clientSocketId) {
          // From client to ROS bridge
          socket.broadcast.emit('webrtc_ice', data)
        } else {
          // From ROS bridge to client
          io.to(session.clientSocketId).emit('webrtc_ice', data)
        }
      } else {
        // Broadcast to all (fallback)
        socket.broadcast.emit('webrtc_ice', data)
      }
    } catch (err) {
      logger.error({ error: err }, 'Unhandled error in webrtc_ice handler')
    }
  })

  // Clean up sessions on disconnect
  socket.on('disconnect', () => {
    // Remove sessions where this socket was the client
    for (const [key, session] of registry.sessions.entries()) {
      if (session.clientSocketId === socket.id) {
        // Close go2rtc session if applicable
        if (session.go2rtcSessionId && registry.go2rtcClient) {
          registry.go2rtcClient.closeSession(session.go2rtcSessionId)
        }
        registry.sessions.delete(key)
        logger.debug(
          { cameraId: session.cameraId, clientId: session.clientId, mode: session.mode },
          'WebRTC session cleaned up'
        )
      }
    }
  })
}

/**
 * Get active WebRTC sessions
 */
export function getActiveSessions(registry: WebRTCRegistry): WebRTCSession[] {
  return Array.from(registry.sessions.values())
}

/**
 * Get session by camera and client
 */
export function getSession(
  registry: WebRTCRegistry,
  cameraId: string,
  clientId: string
): WebRTCSession | undefined {
  return registry.sessions.get(getSessionKey(cameraId, clientId))
}

/**
 * Check if go2rtc is available
 */
export function isGo2RTCAvailable(registry: WebRTCRegistry): boolean {
  return registry.go2rtcAvailable
}
