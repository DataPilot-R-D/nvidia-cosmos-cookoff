/**
 * WebSocket Connection Store
 *
 * Zustand store for managing WebSocket connection state.
 * Uses ConnectionStatus from @workspace/shared-types for type safety.
 *
 * @see plan.md Step 1: WebSocket Connection Store
 */

import { create } from 'zustand'
import { type ConnectionStatus } from '@workspace/shared-types'
import type { Socket } from 'socket.io-client'
import { getHostname } from '@/lib/utils/get-hostname'

/**
 * WebSocket Store State Interface
 *
 * Represents the current state of the WebSocket connection.
 */
export interface WebSocketState {
  /** Current connection status */
  status: ConnectionStatus
  /** Client ID assigned by the server upon connection */
  clientId: string | null
  /** Error message if status is 'error' */
  error: string | null
  /** Socket instance for direct access */
  socket: Socket | null
  /** Current WebSocket URL */
  wsUrl: string
  /** Flag to trigger reconnection */
  shouldReconnect: boolean
  /** Rosbridge URL (ROS 2 bridge) */
  rosbridgeUrl: string
  /** Rosbridge connection status */
  rosbridgeConnected: boolean
  /** Number of reconnection attempts since last successful connection */
  reconnectCount: number
  /** Timestamp of last error (ms since epoch) */
  lastErrorAt: number | null
}

/**
 * WebSocket Store Actions Interface
 *
 * Actions for updating the WebSocket connection state.
 */
export interface WebSocketActions {
  /** Initiate connection - sets status to 'connecting' */
  connect: () => void
  /** Mark as connected with client ID */
  setConnected: (clientId: string) => void
  /** Mark as disconnected - clears clientId */
  disconnect: () => void
  /** Set error state with message */
  setError: (message: string) => void
  /** Set reconnecting state */
  setReconnecting: () => void
  /** Store socket instance */
  setSocket: (socket: Socket | null) => void
  /** Send teleop command to robot */
  sendTeleopCommand: (linear: number, angular: number) => boolean
  /** Set WebSocket URL and trigger reconnection */
  setWsUrl: (url: string) => void
  /** Trigger reconnection with current URL */
  triggerReconnect: () => void
  /** Clear reconnect flag */
  clearReconnectFlag: () => void
  /** Set rosbridge URL */
  setRosbridgeUrl: (url: string) => void
  /** Set rosbridge connection status */
  setRosbridgeConnected: (connected: boolean) => void
  /** Send rosbridge URL change request to server */
  changeRosbridgeUrl: (url: string) => void
  /** Send goal pose to robot via Nav2 */
  sendGoalPose: (goal: { x: number; y: number; theta: number; frameId?: string }) => boolean
  /** Cancel current navigation */
  cancelNavigation: () => boolean
  /** Selector: check if currently connected */
  isConnected: () => boolean
  /** Selector: check if there's an error */
  hasError: () => boolean
}

// Default WebSocket URL (our middleware server)
// Note: Socket.IO uses HTTP for initial handshake, then upgrades to WebSocket
function getDefaultWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL
  }

  // When running remotely (Tailscale, LAN), `localhost` points at the user's own
  // machine, not the server hosting websocket-server.
  if (typeof window !== 'undefined') {
    return `http://${getHostname()}:8081`
  }

  // SSR/test fallback.
  return 'http://localhost:8081'
}

// Default Rosbridge URL (robot's ROSBridge - user can change this)
function getDefaultRosbridgeUrl(): string {
  if (process.env.NEXT_PUBLIC_ROSBRIDGE_URL) {
    return process.env.NEXT_PUBLIC_ROSBRIDGE_URL
  }

  if (typeof window !== 'undefined') {
    return `ws://${getHostname()}:9090`
  }

  return 'ws://localhost:9090'
}

const DEFAULT_WS_URL = getDefaultWsUrl()
const DEFAULT_ROSBRIDGE_URL = getDefaultRosbridgeUrl()

/**
 * Initial state for the WebSocket store
 */
const initialState: WebSocketState = {
  status: 'disconnected',
  clientId: null,
  error: null,
  socket: null,
  wsUrl: DEFAULT_WS_URL,
  shouldReconnect: false,
  rosbridgeUrl: DEFAULT_ROSBRIDGE_URL,
  rosbridgeConnected: false,
  reconnectCount: 0,
  lastErrorAt: null,
}

/**
 * WebSocket Connection Store
 *
 * Manages the connection state for WebSocket communication.
 * Does NOT hold the WebSocket instance - that's handled by the useWebSocket hook.
 *
 * @example
 * ```tsx
 * // In a component
 * const status = useWebSocketStore((state) => state.status)
 * const { connect, disconnect } = useWebSocketStore.getState()
 *
 * // Check connection
 * const isOnline = useWebSocketStore((state) => state.isConnected())
 * ```
 */
export const useWebSocketStore = create<WebSocketState & WebSocketActions>((set, get) => ({
  // State
  ...initialState,

  // Actions
  connect: () =>
    set({
      status: 'connecting',
      error: null,
    }),

  setConnected: (clientId: string) =>
    set({
      status: 'connected',
      clientId,
      error: null,
      reconnectCount: 0,
    }),

  disconnect: () =>
    set({
      status: 'disconnected',
      clientId: null,
      error: null,
    }),

  setError: (message: string) =>
    set({
      status: 'error',
      error: message,
      lastErrorAt: Date.now(),
    }),

  setReconnecting: () =>
    set((state) => ({
      status: 'reconnecting',
      reconnectCount: state.reconnectCount + 1,
    })),

  setSocket: (socket: Socket | null) =>
    set({
      socket,
    }),

  sendTeleopCommand: (linear: number, angular: number): boolean => {
    const { socket, status } = get()
    if (!socket || status !== 'connected') {
      return false
    }

    socket.emit('teleop_command', { linear, angular })
    return true
  },

  setWsUrl: (url: string) => {
    set({
      wsUrl: url,
      shouldReconnect: true,
    })
  },

  triggerReconnect: () => {
    set({
      shouldReconnect: true,
    })
  },

  clearReconnectFlag: () => {
    set({
      shouldReconnect: false,
    })
  },

  setRosbridgeUrl: (url: string) => {
    set({
      rosbridgeUrl: url,
    })
  },

  setRosbridgeConnected: (connected: boolean) => {
    set({
      rosbridgeConnected: connected,
    })
  },

  changeRosbridgeUrl: (url: string) => {
    const { socket } = get()
    if (socket) {
      socket.emit('set_rosbridge_url', { url })
      set({
        rosbridgeUrl: url,
        rosbridgeConnected: false, // Will be updated when server confirms
      })
    }
  },

  sendGoalPose: (goal: { x: number; y: number; theta: number; frameId?: string }): boolean => {
    const { socket, status, rosbridgeConnected } = get()
    if (!socket || status !== 'connected' || !rosbridgeConnected) {
      return false
    }

    socket.emit('set_goal_pose', {
      x: goal.x,
      y: goal.y,
      theta: goal.theta,
      frameId: goal.frameId || 'map',
    })
    return true
  },

  cancelNavigation: (): boolean => {
    const { socket, status, rosbridgeConnected } = get()
    if (!socket || status !== 'connected' || !rosbridgeConnected) {
      console.warn('[WS Store] Cannot cancel navigation - not connected')
      return false
    }

    socket.emit('cancel_navigation')
    return true
  },

  // Selectors
  isConnected: () => get().status === 'connected',

  hasError: () => get().error !== null,
}))

/**
 * Export store type for testing and typing purposes
 */
export type WebSocketStore = typeof useWebSocketStore

// ---------------------------------------------------------------------------
// Queued command helpers (offline-safe wrappers)
// ---------------------------------------------------------------------------

import { useOfflineQueueStore } from './offline-queue-store'

/**
 * Send a teleop command, falling back to offline queue when disconnected.
 * Returns true if sent or queued successfully.
 */
export function sendTeleopCommandQueued(linear: number, angular: number): boolean {
  const sent = useWebSocketStore.getState().sendTeleopCommand(linear, angular)
  if (!sent) {
    useOfflineQueueStore.getState().enqueue('teleop', { linear, angular })
  }
  return true
}

/**
 * Send a goal pose, falling back to offline queue when disconnected.
 */
export function sendGoalPoseQueued(goal: {
  x: number
  y: number
  theta: number
  frameId?: string
}): boolean {
  const sent = useWebSocketStore.getState().sendGoalPose(goal)
  if (!sent) {
    useOfflineQueueStore.getState().enqueue('goal_pose', goal as Record<string, unknown>)
  }
  return true
}
