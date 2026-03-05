/**
 * go2rtc Client
 *
 * Handles communication with go2rtc WebRTC server for video streaming.
 * go2rtc provides WebRTC bridge from RTSP sources.
 *
 * Uses two transports:
 *  - REST (`/api`, `/api/streams`) for health checks and stream listing
 *  - WebSocket (`/api/ws?src=<stream>`) for WebRTC signaling (SDP + ICE)
 *
 * go2rtc v1.9.x REST `/api/webrtc` hangs for valid SDPs, so we use the
 * native WebSocket signaling that go2rtc's own web UI relies on.
 *
 * Note: go2rtc takes ~10s to read RTSP keyframes before generating the
 * SDP answer. The default timeout is set to 15s to accommodate this.
 *
 * API Reference: https://github.com/AlexxIT/go2rtc
 *
 * @see plan.md Phase 2: WebSocket Server Integration
 */

import type { Logger } from 'pino'
import WebSocket from 'ws'

// =============================================================================
// Types
// =============================================================================

/**
 * go2rtc client configuration
 */
export interface Go2RTCClientConfig {
  /** go2rtc API base URL (default: http://localhost:1984) */
  baseUrl: string
  /** Request timeout in milliseconds */
  timeout: number
  /** Logger instance */
  logger: Logger
}

/**
 * WebRTC session created with go2rtc
 */
export interface Go2RTCSession {
  /** Session ID (used for tracking) */
  sessionId: string
  /** Stream/camera name in go2rtc */
  streamName: string
  /** SDP answer from go2rtc */
  sdpAnswer?: string
  /** Session creation timestamp */
  createdAt: number
  /** Session status */
  status: 'pending' | 'active'
}

/**
 * go2rtc stream info
 */
export interface Go2RTCStream {
  name: string
  producers: Go2RTCProducer[]
  consumers: Go2RTCConsumer[]
}

/**
 * go2rtc producer (source)
 */
export interface Go2RTCProducer {
  url: string
  medias: string[]
}

/**
 * go2rtc consumer (client)
 */
export interface Go2RTCConsumer {
  remote_addr: string
  user_agent: string
}

/**
 * go2rtc API error response
 */
export interface Go2RTCError {
  error: string
}

/**
 * go2rtc WebSocket signaling message shape
 */
interface Go2RTCWSMessage {
  type: string
  value: string
}

/**
 * Type guard for go2rtc WebSocket messages
 */
function isGo2RTCWSMessage(data: unknown): data is Go2RTCWSMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    'type' in data &&
    'value' in data &&
    typeof (data as Go2RTCWSMessage).type === 'string' &&
    typeof (data as Go2RTCWSMessage).value === 'string'
  )
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Partial<Go2RTCClientConfig> = {
  baseUrl: process.env.GO2RTC_URL ?? 'http://localhost:1984',
  timeout: 15000,
}

// =============================================================================
// Go2RTC Client Implementation
// =============================================================================

/**
 * go2rtc REST + WebSocket Client
 *
 * Provides methods for:
 * - Creating WebRTC sessions via WebSocket signaling
 * - Exchanging SDP offers/answers
 * - Relaying ICE candidates
 * - Querying stream status via REST
 *
 * @example
 * ```typescript
 * const client = createGo2RTCClient({ logger })
 *
 * // Create session with client's SDP offer
 * const session = await client.createSession('robot0_camera', clientSdpOffer)
 *
 * // Session contains the SDP answer from go2rtc
 * console.log(session.sdpAnswer)
 * ```
 */
export function createGo2RTCClient(config: Partial<Go2RTCClientConfig> & { logger: Logger }) {
  const { baseUrl, timeout, logger } = { ...DEFAULT_CONFIG, ...config } as Go2RTCClientConfig

  // Active sessions
  const sessions = new Map<string, Go2RTCSession>()
  // WebSocket connections per session (kept alive for ICE candidate relay)
  const wsConnections = new Map<string, WebSocket>()
  // Callbacks for ICE candidates received from go2rtc
  const candidateCallbacks = new Map<string, (candidate: string) => void>()
  // Buffer for ICE candidates received before onCandidate is registered
  const candidateBuffers = new Map<string, string[]>()

  /**
   * Make HTTP request to go2rtc API
   */
  async function request<T>(
    method: 'GET' | 'POST' | 'DELETE' | 'PUT' | 'PATCH',
    path: string,
    body?: string | Record<string, unknown>,
    contentType?: string
  ): Promise<T> {
    const url = `${baseUrl}${path}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const headers: Record<string, string> = {}

      if (contentType) {
        headers['Content-Type'] = contentType
      } else if (body && typeof body === 'object') {
        headers['Content-Type'] = 'application/json'
      } else if (body && typeof body === 'string') {
        headers['Content-Type'] = 'application/sdp'
      }

      const response = await fetch(url, {
        method,
        headers,
        body: typeof body === 'object' ? JSON.stringify(body) : body,
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`go2rtc API error: ${response.status} - ${errorText}`)
      }

      // Check if response is SDP (text/plain or application/sdp)
      const responseContentType = response.headers.get('content-type') ?? ''
      if (
        responseContentType.includes('application/sdp') ||
        responseContentType.includes('text/plain')
      ) {
        return (await response.text()) as T
      }

      // Try JSON, fallback to text
      const text = await response.text()
      try {
        return JSON.parse(text) as T
      } catch {
        logger.warn(
          { path, contentType: responseContentType },
          'go2rtc API returned non-JSON response, returning raw text'
        )
        return text as T
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Check if go2rtc server is healthy
   */
  async function healthCheck(): Promise<boolean> {
    try {
      await request<unknown>('GET', '/api')
      return true
    } catch (error) {
      logger.warn({ error }, 'go2rtc health check failed')
      return false
    }
  }

  /**
   * List all streams configured in go2rtc
   */
  async function listStreams(): Promise<Record<string, Go2RTCStream>> {
    return request<Record<string, Go2RTCStream>>('GET', '/api/streams')
  }

  /**
   * Get stream info by name
   */
  async function getStream(streamName: string): Promise<Go2RTCStream | null> {
    try {
      const streams = await listStreams()
      return streams[streamName] ?? null
    } catch (error) {
      logger.warn({ streamName, error }, 'Failed to get stream info')
      return null
    }
  }

  /**
   * Upsert stream configuration in go2rtc.
   *
   * go2rtc API variants differ across versions, so this method tries
   * compatible request shapes in order.
   */
  async function upsertStream(streamName: string, sourceUrl: string): Promise<void> {
    const encodedName = encodeURIComponent(streamName)
    const encodedSource = encodeURIComponent(sourceUrl)
    const attempts: Array<() => Promise<unknown>> = [
      () => request('POST', `/api/streams?name=${encodedName}&src=${encodedSource}`),
      () => request('POST', '/api/streams', { [streamName]: sourceUrl }),
      () => request('PUT', `/api/streams/${encodedName}`, { src: sourceUrl }),
    ]

    let lastError: unknown = null
    for (const attempt of attempts) {
      try {
        await attempt()
        return
      } catch (error) {
        lastError = error
      }
    }

    throw new Error(
      `Failed to register stream '${streamName}' in go2rtc: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    )
  }

  /**
   * Derive the WebSocket signaling URL from the REST base URL.
   * `http://host:1984` -> `ws://host:1984`
   */
  function wsBaseUrl(): string {
    return baseUrl.replace(/^http/, 'ws')
  }

  /**
   * Create WebRTC session with go2rtc via in-process WebSocket signaling.
   *
   * Opens a WebSocket to go2rtc's signaling endpoint, sends the client's
   * SDP offer, sends dummy ICE candidates to trigger answer generation,
   * and waits for the SDP answer.
   *
   * go2rtc takes ~10s to read RTSP keyframes before generating the answer,
   * so the timeout is set to 15s by default.
   *
   * @param streamName - Name of the stream in go2rtc config
   * @param clientSdpOffer - Complete SDP offer from the web client
   * @returns Session with SDP answer from go2rtc
   */
  async function createSession(streamName: string, clientSdpOffer: string): Promise<Go2RTCSession> {
    const sessionId = `${streamName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const wsUrl = `${wsBaseUrl()}/api/ws?src=${encodeURIComponent(streamName)}`

    logger.info(
      { sessionId, streamName, wsUrl, sdpLength: clientSdpOffer.length },
      'Creating go2rtc WebRTC session'
    )

    return new Promise<Go2RTCSession>((resolve, reject) => {
      const ws = new WebSocket(wsUrl)
      wsConnections.set(sessionId, ws)
      let settled = false

      const cleanup = () => {
        wsConnections.delete(sessionId)
        candidateCallbacks.delete(sessionId)
        candidateBuffers.delete(sessionId)
      }

      const timeoutId = setTimeout(() => {
        if (settled) return
        settled = true
        ws.close()
        cleanup()
        reject(new Error(`go2rtc WebSocket signaling timed out after ${timeout}ms`))
      }, timeout)

      ws.on('open', () => {
        logger.info({ sessionId }, 'go2rtc WebSocket open, sending offer')

        // Send SDP offer — most critical send; reject immediately on failure
        try {
          ws.send(JSON.stringify({ type: 'webrtc/offer', value: clientSdpOffer }))
        } catch (err) {
          if (!settled) {
            settled = true
            clearTimeout(timeoutId)
            cleanup()
            reject(
              new Error(
                `Failed to send SDP offer: ${err instanceof Error ? err.message : String(err)}`
              )
            )
          }
          return
        }

        // WORKAROUND for go2rtc v1.9.x: go2rtc requires at least one ICE
        // candidate followed by an end-of-candidates signal before it will
        // generate the SDP answer. Without these, the session times out.
        setTimeout(() => {
          if (settled) return
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: 'webrtc/candidate',
                  value: 'candidate:1 1 udp 2130706431 192.168.1.1 51544 typ host',
                })
              )
            }
          } catch (err) {
            logger.warn({ sessionId, error: err }, 'Failed to send dummy ICE candidate')
          }
        }, 100)

        setTimeout(() => {
          if (settled) return
          try {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'webrtc/candidate', value: '' }))
            }
          } catch (err) {
            logger.warn({ sessionId, error: err }, 'Failed to send ICE end-of-gathering')
          }
        }, 200)
      })

      ws.on('message', (raw: Buffer | string) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(raw.toString())
        } catch (parseErr) {
          logger.warn(
            {
              sessionId,
              raw: raw.toString().slice(0, 200),
              error: parseErr instanceof Error ? parseErr.message : String(parseErr),
            },
            'go2rtc: unparseable WS message'
          )
          return
        }

        if (!isGo2RTCWSMessage(parsed)) {
          logger.warn({ sessionId }, 'go2rtc: invalid WS message shape')
          return
        }

        if (parsed.type === 'webrtc/answer') {
          settled = true
          clearTimeout(timeoutId)

          const session: Go2RTCSession = {
            sessionId,
            streamName,
            sdpAnswer: parsed.value,
            createdAt: Date.now(),
            status: 'active',
          }
          sessions.set(sessionId, session)

          logger.info({ sessionId, streamName }, 'go2rtc session created successfully')
          resolve(session)
        } else if (parsed.type === 'webrtc/candidate') {
          // Forward ICE candidates from go2rtc to the browser (or buffer)
          const cb = candidateCallbacks.get(sessionId)
          if (cb && parsed.value) {
            try {
              cb(parsed.value)
            } catch (cbErr) {
              logger.warn(
                { sessionId, error: cbErr instanceof Error ? cbErr.message : String(cbErr) },
                'ICE candidate callback threw'
              )
            }
          } else if (parsed.value) {
            const existing = candidateBuffers.get(sessionId) ?? []
            candidateBuffers.set(sessionId, [...existing, parsed.value])
          }
        } else if (parsed.type === 'error') {
          settled = true
          clearTimeout(timeoutId)
          ws.close()
          cleanup()
          reject(new Error(`go2rtc signaling error: ${parsed.value}`))
        }
      })

      ws.on('error', (err: Error) => {
        if (settled) {
          logger.warn({ sessionId, error: err.message }, 'go2rtc WebSocket error after settlement')
          return
        }
        settled = true
        clearTimeout(timeoutId)
        cleanup()
        reject(new Error(`go2rtc WebSocket error: ${err.message}`))
      })

      ws.on('close', () => {
        clearTimeout(timeoutId)
        wsConnections.delete(sessionId)
        if (!settled) {
          settled = true
          candidateCallbacks.delete(sessionId)
          candidateBuffers.delete(sessionId)
          reject(new Error('go2rtc WebSocket closed before signaling completed'))
        } else {
          // Signaling WebSocket closed after session was established.
          // Clean up stale callbacks to prevent memory leaks.
          candidateCallbacks.delete(sessionId)
          candidateBuffers.delete(sessionId)
          logger.debug({ sessionId }, 'go2rtc signaling WebSocket closed after settlement')
        }
      })
    })
  }

  /**
   * Send an ICE candidate from the browser to go2rtc.
   *
   * Forwards the candidate on the session's WebSocket connection.
   * In ice_lite mode, go2rtc provides its candidates in the SDP answer,
   * so browser candidates may not be strictly required, but we forward
   * them for completeness.
   */
  function sendCandidate(sessionId: string, candidate: string): void {
    const ws = wsConnections.get(sessionId)
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'webrtc/candidate', value: candidate }))
      } catch (err) {
        logger.warn(
          { sessionId, error: err instanceof Error ? err.message : String(err) },
          'Failed to send ICE candidate to go2rtc'
        )
      }
    } else {
      logger.warn(
        { sessionId, wsExists: !!ws, readyState: ws?.readyState },
        'ICE candidate dropped: WebSocket not available'
      )
    }
  }

  /**
   * Register callback for ICE candidates from go2rtc
   */
  function onCandidate(sessionId: string, callback: (candidate: string) => void): void {
    candidateCallbacks.set(sessionId, callback)
    // Flush any buffered candidates that arrived before registration.
    // Break on first failure to avoid cascading errors from a stale callback.
    const buffered = candidateBuffers.get(sessionId)
    if (buffered) {
      candidateBuffers.delete(sessionId)
      for (const candidate of buffered) {
        try {
          callback(candidate)
        } catch (err) {
          logger.warn(
            { sessionId, error: err instanceof Error ? err.message : String(err) },
            'Buffered ICE candidate callback threw, stopping flush'
          )
          break
        }
      }
    }
  }

  /**
   * Close a WebRTC session and its signaling WebSocket
   */
  function closeSession(sessionId: string): void {
    const session = sessions.get(sessionId)
    if (session) {
      sessions.delete(sessionId)
    }

    // Close the signaling WebSocket
    const ws = wsConnections.get(sessionId)
    if (ws) {
      ws.close()
      wsConnections.delete(sessionId)
    }

    candidateCallbacks.delete(sessionId)
    candidateBuffers.delete(sessionId)

    if (session) {
      logger.info({ sessionId }, 'go2rtc session closed')
    }
  }

  /**
   * Get session by ID
   */
  function getSession(sessionId: string): Go2RTCSession | undefined {
    return sessions.get(sessionId)
  }

  /**
   * Get all active sessions
   */
  function getActiveSessions(): Go2RTCSession[] {
    return Array.from(sessions.values()).filter((s) => s.status === 'active')
  }

  /**
   * Map camera ID to go2rtc stream name
   *
   * Converts camera IDs from the application format to go2rtc stream names.
   * The mapping can be customized based on naming conventions.
   *
   * @param cameraId - Camera ID from the application (e.g., 'robot0-front-cam')
   * @returns go2rtc stream name (e.g., 'robot0_camera')
   */
  function mapCameraToStream(cameraId: string): string {
    // Static mapping for known cameras
    const cameraMap: Record<string, string> = {
      'robot0-front-cam': 'robot0_camera',
      'robot0-front_cam-rgb': 'robot0_camera',
      'robot0-front_cam-rgb_throttled': 'robot0_camera',
      robot0_front_cam: 'robot0_camera',
      robot0_front_cam_rgb: 'robot0_camera',
      robot0_front_cam_rgb_throttled: 'robot0_camera',
      front_cam: 'robot0_camera',
      robot0_camera: 'robot0_camera',
    }

    // Check for known mapping first
    if (cameraMap[cameraId]) {
      return cameraMap[cameraId]
    }

    // Fallback: replace hyphens with underscores
    return cameraId.replace(/-/g, '_')
  }

  return {
    healthCheck,
    listStreams,
    getStream,
    upsertStream,
    createSession,
    closeSession,
    sendCandidate,
    onCandidate,
    getSession,
    getActiveSessions,
    mapCameraToStream,
  }
}

/**
 * Type for the go2rtc client instance
 */
export type Go2RTCClient = ReturnType<typeof createGo2RTCClient>
