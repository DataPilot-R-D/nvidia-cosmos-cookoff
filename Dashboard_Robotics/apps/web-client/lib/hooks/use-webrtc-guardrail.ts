/**
 * useWebRTCGuardrail Hook
 *
 * Provides reactive access to WebRTC connection pool state.
 * Components use this to check/enforce the max 4 concurrent streams limit.
 *
 * @see Issue #21 — T1.10 Performance guardrail
 */

import { useWebRTCConnectionStore, MAX_WEBRTC_CONNECTIONS } from '../stores/webrtc-connection-store'

// =============================================================================
// Types
// =============================================================================

export interface UseWebRTCGuardrailReturn {
  /** Number of currently active WebRTC connections */
  activeCount: number
  /** Maximum allowed concurrent connections */
  maxConnections: number
  /** Whether at the connection limit */
  isAtLimit: boolean
  /** Whether a new connection can be acquired */
  canConnect: boolean
  /** Try to acquire a connection slot (returns false if at limit) */
  acquire: (cameraId: string) => boolean
  /** Release a connection slot */
  release: (cameraId: string) => void
}

// =============================================================================
// Hook
// =============================================================================

export function useWebRTCGuardrail(): UseWebRTCGuardrailReturn {
  const connections = useWebRTCConnectionStore((s) => s.connections)
  const acquire = useWebRTCConnectionStore((s) => s.acquire)
  const release = useWebRTCConnectionStore((s) => s.release)

  return {
    activeCount: connections.size,
    maxConnections: MAX_WEBRTC_CONNECTIONS,
    isAtLimit: connections.size >= MAX_WEBRTC_CONNECTIONS,
    canConnect: connections.size < MAX_WEBRTC_CONNECTIONS,
    acquire,
    release,
  }
}
