/**
 * useWebSocket Hook
 *
 * Custom React hook for WebSocket communication with the command center server.
 * Handles connection management, message parsing, and store synchronization.
 *
 * Features:
 * - Automatic connection on mount
 * - Zod validation for incoming messages
 * - Robot state dispatch to robot store
 * - Connection state dispatch to websocket store
 * - Exponential backoff reconnection
 * - Cleanup on unmount
 *
 * @see plan.md Step 4: useWebSocket Custom Hook
 * @see research-summary.md for architecture details
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { io, Socket } from 'socket.io-client'
// import parser from 'socket.io-msgpack-parser' // Disabled for Bun testing
import {
  type CommandMessage,
  type RobotStateMessage,
  type CameraDiscoveredMessage,
  type CameraLostMessage,
  type CameraSubscribeMessage,
  type CameraUnsubscribeMessage,
  type VideoFramePayload,
  type MachineStatsMessage,
  RobotStateMessageSchema,
  CameraDiscoveredMessageSchema,
  CameraLostMessageSchema,
  MachineStatsMessageSchema,
} from '@workspace/shared-types'
import { useWebSocketStore } from '../stores/websocket-store'
import { useRobotStore } from '../stores/robot-store'
import { useCameraStore } from '../stores/camera-store'
import { useVideoFrameStore } from '../stores/video-frame-store'
import { useLidarStore } from '../stores/lidar-store'
import { useTopicStore, type RosTopic } from '../stores/topic-store'
import { useCostmapStore, type OccupancyGridData } from '../stores/costmap-store'
import { usePathStore, type PathData } from '../stores/path-store'
import { useImuStore, type ImuData } from '../stores/imu-store'
import { useExplorationStore, type ExplorationStatus } from '../stores/exploration-store'
import { useVisionLlmStore } from '../stores/vision-llm-store'
import { useMachineStatsStore } from '../stores/machine-stats-store'

// =============================================================================
// Configuration
// =============================================================================

/**
 * WebSocket connection configuration
 */
const WS_CONFIG = {
  /** Don't connect automatically - we control connection lifecycle */
  autoConnect: false,
  /** Enable reconnection on disconnect */
  reconnection: true,
  /** Maximum reconnection attempts before giving up */
  // Socket.IO accepts `Infinity` to retry indefinitely.
  reconnectionAttempts: Infinity,
  /** Initial reconnection delay in ms */
  reconnectionDelay: 1000,
  /** Maximum reconnection delay (exponential backoff cap) */
  reconnectionDelayMax: 10000,
  /** Timeout for initial connection */
  timeout: 20000,
  /** Transport methods to use */
  transports: ['websocket', 'polling'] as ('websocket' | 'polling')[],
  // MessagePack parser disabled for Bun compatibility testing
  // parser,
}

// =============================================================================
// Types
// =============================================================================

/**
 * Video frame callback type
 */
export type VideoFrameCallback = ((frame: VideoFramePayload) => void) | null

/**
 * Return type for useWebSocket hook
 */
export interface UseWebSocketReturn {
  /** Current connection status */
  isConnected: boolean
  /** Send command to robot through WebSocket */
  sendCommand: (command: CommandMessage) => boolean
  /** Socket instance for advanced usage */
  socket: Socket | null
  /** Subscribe to camera stream */
  subscribeToCamera: (
    cameraId: string,
    robotId: string,
    quality?: number,
    maxFps?: number
  ) => boolean
  /** Unsubscribe from camera stream */
  unsubscribeFromCamera: (cameraId: string) => boolean
  /** Register callback for video frames */
  onVideoFrame: (callback: VideoFrameCallback) => void
  /** Request ROS topics list */
  requestTopics: () => boolean
  /** Subscribe to a ROS topic */
  subscribeToRosTopic: (topic: string, type?: string) => boolean
  /** Unsubscribe from a ROS topic */
  unsubscribeFromRosTopic: (topic: string) => boolean
  /** Send goal pose for navigation */
  sendGoalPose: (x: number, y: number, theta: number, frameId?: string) => boolean
  /** Send Vision LLM analysis request */
  sendVisionLlmRequest: (
    prompt: string,
    options?: {
      temperature?: number
      maxOutputTokens?: number
      robotId?: string
    }
  ) => string | null
  /** Load a saved map into Nav2 MapServer */
  loadMapToNav2: (mapId: string) => boolean
  /** Start SLAM mode (kills MapServer if running) */
  startSlam: () => boolean
  /** Stop all mapping processes (SLAM + Explore Lite) */
  stopMapping: () => boolean
  /** Request current map manager mode */
  requestMapMode: () => boolean
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert RobotStateMessage data to RobotEntity for store
 */
function robotStateToEntity(data: RobotStateMessage['data']) {
  const now = Date.now()
  return {
    id: data.robotId,
    name: data.name ?? `Robot ${data.robotId}`,
    position: data.position,
    battery: data.battery,
    status: data.status,
    velocity: data.velocity ?? 0,
    lastSeen: data.lastSeen,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Validate robot_state message using Zod schema
 */
function validateRobotStateMessage(data: unknown): RobotStateMessage | null {
  const result = RobotStateMessageSchema.safeParse(data)
  return result.success ? result.data : null
}

/**
 * Validate camera_discovered message using Zod schema
 */
function validateCameraDiscoveredMessage(data: unknown): CameraDiscoveredMessage | null {
  const result = CameraDiscoveredMessageSchema.safeParse(data)
  return result.success ? result.data : null
}

/**
 * Validate camera_lost message using Zod schema
 */
function validateCameraLostMessage(data: unknown): CameraLostMessage | null {
  const result = CameraLostMessageSchema.safeParse(data)
  return result.success ? result.data : null
}

/**
 * Validate server:stats message using Zod schema
 */
function validateMachineStatsMessage(data: unknown): MachineStatsMessage | null {
  const result = MachineStatsMessageSchema.safeParse(data)
  return result.success ? result.data : null
}

// =============================================================================
// Hook Implementation
// =============================================================================

/**
 * useWebSocket Hook
 *
 * Manages WebSocket connection to the command center server.
 * Automatically connects on mount and cleans up on unmount.
 * Supports dynamic URL changes from websocket-store.
 *
 * @param initialUrl - Initial WebSocket server URL (e.g., 'http://localhost:8080')
 * @returns WebSocket state and control functions
 *
 * @example
 * ```tsx
 * function Dashboard() {
 *   const { isConnected, sendCommand } = useWebSocket('http://localhost:8080')
 *
 *   const handleStop = () => {
 *     sendCommand({
 *       type: 'command',
 *       timestamp: Date.now(),
 *       data: { robotId: 'robot-001', action: 'stop', priority: 'high' }
 *     })
 *   }
 *
 *   return <div>{isConnected ? 'Connected' : 'Disconnected'}</div>
 * }
 * ```
 */
export function useWebSocket(initialUrl: string): UseWebSocketReturn {
  // Get URL from store (allows dynamic changes)
  const storeUrl = useWebSocketStore((state) => state.wsUrl)
  const shouldReconnect = useWebSocketStore((state) => state.shouldReconnect)
  const clearReconnectFlag = useWebSocketStore((state) => state.clearReconnectFlag)

  // Use store URL if available, otherwise fall back to initial URL
  const url = storeUrl || initialUrl
  // Refs to hold mutable values without causing re-renders
  const socketRef = useRef<Socket | null>(null)
  const mountedRef = useRef(true)
  const videoFrameCallbackRef = useRef<VideoFrameCallback>(null)

  // Local connection state for the hook's return value
  const [isConnected, setIsConnected] = useState(false)

  /**
   * Handle successful connection
   */
  const handleConnect = useCallback(() => {
    if (!mountedRef.current) return

    const socket = socketRef.current
    const clientId = socket?.id ?? null

    setIsConnected(true)
    useWebSocketStore.getState().setConnected(clientId ?? 'unknown')
    useWebSocketStore.getState().setSocket(socket)

    // Fallback: Add default robot if none received from ROSBridge after 3 seconds
    setTimeout(() => {
      if (!mountedRef.current) return
      const robotCount = useRobotStore.getState().robots.size
      if (robotCount === 0) {
        const now = Date.now()
        useRobotStore.getState().setRobot({
          id: 'robot0',
          name: 'Robot (Fallback)',
          position: { x: 0, y: 0, z: 0 },
          battery: 100,
          status: 'online',
          velocity: 0,
          lastSeen: now,
          createdAt: now,
          updatedAt: now,
        })
      }
    }, 3000)
  }, [])

  /**
   * Handle disconnection
   */
  const handleDisconnect = useCallback((reason: string) => {
    if (!mountedRef.current) return

    setIsConnected(false)

    // Check if this is a server-initiated disconnect that should trigger reconnection
    const shouldReconnect = reason === 'transport close' || reason === 'ping timeout'

    if (shouldReconnect) {
      useWebSocketStore.getState().setReconnecting()
    } else {
      useWebSocketStore.getState().disconnect()
    }
  }, [])

  /**
   * Handle connection error
   */
  const handleConnectError = useCallback((error: Error) => {
    if (!mountedRef.current) return

    setIsConnected(false)
    useWebSocketStore.getState().setError(error.message)
  }, [])

  /**
   * Handle incoming robot_state message
   */
  const handleRobotState = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    // Validate message with Zod schema
    const validatedMessage = validateRobotStateMessage(data)
    if (!validatedMessage) {
      // eslint-disable-next-line no-console
      console.warn('[WS] robot_state validation failed:', data)
      return
    }

    // Convert to entity and update store
    const entity = robotStateToEntity(validatedMessage.data)
    useRobotStore.getState().setRobot(entity)
  }, [])

  /**
   * Handle incoming camera_discovered message
   */
  const handleCameraDiscovered = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    // Validate message with Zod schema
    const validatedMessage = validateCameraDiscoveredMessage(data)
    if (!validatedMessage) {
      // Invalid message - ignore silently
      return
    }

    // Add camera to store
    useCameraStore.getState().addCamera(validatedMessage.data)
  }, [])

  /**
   * Handle incoming camera_lost message
   */
  const handleCameraLost = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    // Validate message with Zod schema
    const validatedMessage = validateCameraLostMessage(data)
    if (!validatedMessage) {
      // Invalid message - ignore silently
      return
    }

    // Remove camera from store
    useCameraStore.getState().removeCamera(validatedMessage.data.cameraId)
  }, [])

  /**
   * Handle incoming video_frame message
   */
  const handleVideoFrame = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    // Validate and extract frame data
    if (typeof data === 'object' && data !== null) {
      const framePayload = data as VideoFramePayload

      // Dispatch to video frame store if metadata and data are present
      if (framePayload.metadata && framePayload.data) {
        useVideoFrameStore
          .getState()
          .addFrame(framePayload.metadata.cameraId, framePayload.metadata, framePayload.data)
      }

      // Call registered callback if exists
      const callback = videoFrameCallbackRef.current
      if (callback) {
        callback(framePayload)
      }
    }
  }, [])

  /**
   * Handle incoming lidar_scan message
   */
  const handleLidarScan = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const scanData = data as {
        data?: {
          robotId?: string
          pointCount?: number
          points?: Array<{ x: number; y: number; z: number; intensity?: number }>
          frameId?: string
        }
      }

      const payload = scanData.data
      if (payload && payload.robotId && payload.points) {
        // Update LiDAR store
        useLidarStore.getState().addScan(
          payload.robotId,
          {
            header: {
              robotId: payload.robotId,
              frameId: payload.frameId || 'lidar',
              timestamp: Date.now(),
            },
            pointCount: payload.pointCount || payload.points.length,
            rangeMin: 0,
            rangeMax: 30,
            angleMin: -Math.PI,
            angleMax: Math.PI,
            angleIncrement: 0.01,
          },
          payload.points
        )

        // Emit custom event for Map2D visualization
        window.dispatchEvent(
          new CustomEvent('lidar_scan_update', {
            detail: {
              robotId: payload.robotId,
              points: payload.points,
              pointCount: payload.pointCount || payload.points.length,
              frameId: payload.frameId || 'lidar',
            },
          })
        )
      }
    }
  }, [])

  /**
   * Handle incoming slam_graph message
   */
  const handleSlamGraph = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const graphData = data as {
        data?: {
          nodes?: Array<{ id: number; x: number; y: number; z: number }>
          edges?: Array<{ points: Array<{ x: number; y: number; z: number }> }>
          markerCount?: number
        }
      }

      const payload = graphData.data
      if (payload) {
        // TODO: Add to a dedicated SLAM store for visualization
        // For now, emit as custom event for any listeners
        window.dispatchEvent(new CustomEvent('slam_graph_update', { detail: payload }))
      }
    }
  }, [])

  /**
   * Handle incoming rosbridge_status message
   */
  const handleRosbridgeStatus = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const statusData = data as {
        data?: {
          connected?: boolean
          url?: string
        }
      }

      const payload = statusData.data
      if (payload) {
        if (payload.connected !== undefined) {
          useWebSocketStore.getState().setRosbridgeConnected(payload.connected)
        }
        if (payload.url) {
          useWebSocketStore.getState().setRosbridgeUrl(payload.url)
        }
      }
    }
  }, [])

  /**
   * Handle incoming ros_topics message
   */
  const handleRosTopics = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const topicsData = data as {
        data?: {
          topics?: Array<{
            name: string
            type: string
            messageRate?: number | null
            lastMessage?: number | null
          }>
          count?: number
        }
      }

      const payload = topicsData.data
      if (payload?.topics) {
        const topics: RosTopic[] = payload.topics.map((t) => ({
          name: t.name,
          type: t.type,
          messageRate: t.messageRate ?? undefined,
          lastMessage: t.lastMessage ?? undefined,
        }))
        useTopicStore.getState().setTopics(topics)
      }
    }
  }, [])

  /**
   * Handle ros_topics_error message
   */
  const handleRosTopicsError = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const errorData = data as {
        data?: {
          error?: string
        }
      }

      const payload = errorData.data
      if (payload?.error) {
        useTopicStore.getState().setError(payload.error)
      }
    }
  }, [])

  /**
   * Handle incoming occupancy_grid message
   */
  const handleOccupancyGrid = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const gridMessage = data as {
        data?: OccupancyGridData
      }

      const payload = gridMessage.data
      if (payload && payload.topic && payload.data) {
        useCostmapStore.getState().addGrid(payload)

        // Emit custom event for Map2D
        window.dispatchEvent(
          new CustomEvent('occupancy_grid_update', {
            detail: payload,
          })
        )
      }
    }
  }, [])

  /**
   * Handle incoming navigation_path message
   */
  const handleNavigationPath = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const pathMessage = data as {
        data?: PathData
      }

      const payload = pathMessage.data
      if (payload && payload.topic && payload.points) {
        usePathStore.getState().addPath(payload)

        // Emit custom event for Map2D
        window.dispatchEvent(
          new CustomEvent('navigation_path_update', {
            detail: payload,
          })
        )
      }
    }
  }, [])

  /**
   * Handle incoming imu_data message
   */
  const handleImuData = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const imuMessage = data as {
        data?: {
          robotId?: string
          frameId?: string
          orientation?: { x: number; y: number; z: number; w: number } | null
          angularVelocity?: { x: number; y: number; z: number } | null
          linearAcceleration?: { x: number; y: number; z: number } | null
        }
      }

      const payload = imuMessage.data
      if (payload && payload.robotId) {
        const imuData: ImuData = {
          robotId: payload.robotId,
          frameId: payload.frameId || 'imu_link',
          orientation: payload.orientation || null,
          euler: null, // Will be computed in store
          angularVelocity: payload.angularVelocity || null,
          linearAcceleration: payload.linearAcceleration || null,
          timestamp: Date.now(),
        }
        useImuStore.getState().addImuData(imuData)

        // Emit custom event for ImuModule
        window.dispatchEvent(
          new CustomEvent('imu_data_update', {
            detail: imuData,
          })
        )
      }
    }
  }, [])

  /**
   * Handle goal_pose_ack from server
   */
  const handleGoalPoseAck = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const ackMessage = data as {
        data?: {
          x: number
          y: number
          theta: number
        }
      }

      const payload = ackMessage.data
      if (payload) {
        usePathStore.getState().updateGoalStatus('navigating')
      }
    }
  }, [])

  /**
   * Handle navigation_feedback from Nav2
   */
  const handleNavigationFeedback = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const message = data as {
        data?: {
          distanceRemaining: number | null
          navigationTime: number | null
          numberOfRecoveries: number
        }
      }

      const payload = message.data
      if (payload) {
        usePathStore.getState().updateNavigationProgress({
          distanceRemaining: payload.distanceRemaining,
          navigationTime: payload.navigationTime,
          numberOfRecoveries: payload.numberOfRecoveries,
        })
      }
    }
  }, [])

  /**
   * Handle navigation_status from Nav2 (goal succeeded, failed, etc.)
   */
  const handleNavigationStatus = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const message = data as {
        data?: {
          status: 'pending' | 'navigating' | 'reached' | 'failed' | 'canceled'
        }
      }

      const payload = message.data
      if (payload?.status) {
        usePathStore.getState().updateGoalStatus(payload.status)

        // Clear progress when navigation ends
        if (
          payload.status === 'reached' ||
          payload.status === 'failed' ||
          payload.status === 'canceled'
        ) {
          // Keep progress visible for a moment, then clear
          setTimeout(() => {
            usePathStore.getState().clearNavigationProgress()
          }, 5000)
        }
      }
    }
  }, [])

  /**
   * Handle exploration_status from server
   */
  const handleExplorationStatus = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const message = data as {
        data?: {
          status: ExplorationStatus
          currentWaypoint?: number
          totalWaypoints?: number
          exploredPercent?: number
          error?: string
        }
      }

      const payload = message.data
      if (payload?.status) {
        const store = useExplorationStore.getState()

        // Update status
        store.setStatus(payload.status, payload.error)

        // Update progress if available
        if (payload.currentWaypoint !== undefined && payload.totalWaypoints !== undefined) {
          store.updateProgress(payload.currentWaypoint, payload.totalWaypoints)
        }

        // Update explored percentage if available
        if (payload.exploredPercent !== undefined) {
          store.setExploredPercent(payload.exploredPercent)
        }
      }
    }
  }, [])

  /**
   * Handle exploration_progress from server (includes frontiers)
   */
  const handleExplorationProgress = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const message = data as {
        data?: {
          waypointCount?: number
          exploredPercent?: number
          frontierCount?: number
          frontiers?: Array<{ x: number; y: number; score: number; cellX: number; cellY: number }>
        }
      }

      const payload = message.data
      if (payload) {
        const store = useExplorationStore.getState()

        // Update frontiers if available
        if (payload.frontiers) {
          store.updateFrontiers(payload.frontiers)
        }

        // Update explored percentage if available
        if (payload.exploredPercent !== undefined) {
          store.setExploredPercent(payload.exploredPercent)
        }

        // Update waypoint count
        if (payload.waypointCount !== undefined) {
          store.updateProgress(payload.waypointCount, store.totalWaypoints)
        }
      }
    }
  }, [])

  /**
   * Handle exploration_frontier_selected from server (current target)
   */
  const handleExplorationFrontierSelected = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const message = data as {
        data?: {
          target?: { x: number; y: number; score: number; cellX: number; cellY: number }
          waypointCount?: number
        }
      }

      const payload = message.data
      if (payload?.target) {
        const store = useExplorationStore.getState()
        store.setCurrentTarget(payload.target)

        if (payload.waypointCount !== undefined) {
          store.updateProgress(payload.waypointCount, store.totalWaypoints)
        }
      }
    }
  }, [])

  /**
   * Handle vision_llm_response from server
   */
  const handleVisionLlmResponse = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const message = data as {
        data?: {
          requestId: string
          success: boolean
          response?: string
          error?: string
          processingTime?: number
          frameData?: string
          frameWidth?: number
          frameHeight?: number
        }
      }

      const payload = message.data
      if (payload?.requestId) {
        useVisionLlmStore.getState().handleResponse(payload)
      }
    }
  }, [])

  /**
   * Handle map_status from server (loading progress)
   */
  const handleMapStatus = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const message = data as {
        data?: {
          mapId: string | null
          status: 'idle' | 'loading' | 'success' | 'error'
          message?: string
          error?: string
        }
      }

      const payload = message.data
      if (payload?.status) {
        useExplorationStore
          .getState()
          .setMapLoadingStatus(payload.status, payload.message || null, payload.error || null)
      }
    }
  }, [])

  /**
   * Handle map_mode_changed from server (SLAM vs MapServer)
   */
  const handleMapModeChanged = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const message = data as {
        data?: {
          mode: 'slam' | 'map_server' | 'none'
          mapId?: string
          mapName?: string
        }
      }

      const payload = message.data
      if (payload?.mode) {
        useExplorationStore.getState().setMapServerMode(payload.mode, payload.mapId || null)
      }
    }
  }, [])

  /**
   * Handle mapping_status from server (real-time mapping indicator)
   */
  const handleMappingStatus = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    if (typeof data === 'object' && data !== null) {
      const message = data as {
        data?: {
          isMapping: boolean
          slamRunning: boolean
          exploreRunning: boolean
        }
      }

      const payload = message.data
      if (payload) {
        // Update store based on mapping status
        // If SLAM is running, set mode to 'slam'
        if (payload.slamRunning) {
          useExplorationStore.getState().setMapServerMode('slam')
        } else if (!payload.slamRunning && !payload.isMapping) {
          // If nothing is running, set mode to 'none' only if currently in 'slam' mode
          const currentMode = useExplorationStore.getState().mapServerMode
          if (currentMode === 'slam') {
            useExplorationStore.getState().setMapServerMode('none')
          }
        }
      }
    }
  }, [])

  /**
   * Handle server:stats message (machine statistics)
   */
  const handleMachineStats = useCallback((data: unknown) => {
    if (!mountedRef.current) return

    const validatedMessage = validateMachineStatsMessage(data)
    if (!validatedMessage) {
      // eslint-disable-next-line no-console
      console.warn('[WS] server:stats validation failed:', data)
      return
    }

    // Dispatch to machine stats store
    useMachineStatsStore.getState().updateStats(validatedMessage)
  }, [])

  /**
   * Send command through WebSocket
   *
   * @param command - Command message to send
   * @returns true if sent successfully, false otherwise
   */
  const sendCommand = useCallback((command: CommandMessage): boolean => {
    const socket = socketRef.current

    if (!socket?.connected) {
      return false
    }

    socket.emit('command', command)
    return true
  }, [])

  /**
   * Subscribe to camera stream
   *
   * @param cameraId - Camera ID to subscribe to
   * @param robotId - Robot ID that owns the camera
   * @param quality - JPEG quality (1-100, default 75)
   * @param maxFps - Maximum FPS (default 15)
   * @returns true if subscription request sent, false otherwise
   */
  const subscribeToCamera = useCallback(
    (cameraId: string, robotId: string, quality: number = 75, maxFps: number = 15): boolean => {
      const socket = socketRef.current

      if (!socket?.connected) {
        return false
      }

      const message: CameraSubscribeMessage = {
        type: 'camera_subscribe',
        timestamp: Date.now(),
        data: {
          cameraId,
          robotId,
          quality,
          maxFps,
        },
      }

      socket.emit('camera_subscribe', message)
      return true
    },
    []
  )

  /**
   * Unsubscribe from camera stream
   *
   * @param cameraId - Camera ID to unsubscribe from
   * @returns true if unsubscription request sent, false otherwise
   */
  const unsubscribeFromCamera = useCallback((cameraId: string): boolean => {
    const socket = socketRef.current

    if (!socket?.connected) {
      return false
    }

    const message: CameraUnsubscribeMessage = {
      type: 'camera_unsubscribe',
      timestamp: Date.now(),
      data: {
        cameraId,
      },
    }

    socket.emit('camera_unsubscribe', message)
    return true
  }, [])

  /**
   * Register callback for video frames
   *
   * @param callback - Function to call when video frame received, or null to unregister
   */
  const onVideoFrame = useCallback((callback: VideoFrameCallback): void => {
    videoFrameCallbackRef.current = callback
  }, [])

  /**
   * Request ROS topics list from ROSBridge
   *
   * @returns true if request sent, false otherwise
   */
  const requestTopics = useCallback((): boolean => {
    const socket = socketRef.current

    if (!socket?.connected) {
      return false
    }

    useTopicStore.getState().setLoading(true)
    socket.emit('request_ros_topics')
    return true
  }, [])

  /**
   * Subscribe to a ROS topic
   *
   * @param topic - Topic name to subscribe to
   * @param type - Optional message type
   * @returns true if subscription request sent, false otherwise
   */
  const subscribeToRosTopic = useCallback((topic: string, type?: string): boolean => {
    const socket = socketRef.current

    if (!socket?.connected) {
      return false
    }

    socket.emit('ros_subscribe', { topic, type })
    useTopicStore.getState().addSubscription(topic)
    return true
  }, [])

  /**
   * Unsubscribe from a ROS topic
   *
   * @param topic - Topic name to unsubscribe from
   * @returns true if unsubscription request sent, false otherwise
   */
  const unsubscribeFromRosTopic = useCallback((topic: string): boolean => {
    const socket = socketRef.current

    if (!socket?.connected) {
      return false
    }

    socket.emit('ros_unsubscribe', { topic })
    useTopicStore.getState().removeSubscription(topic)
    return true
  }, [])

  /**
   * Send goal pose for navigation
   *
   * @param x - X position in meters
   * @param y - Y position in meters
   * @param theta - Orientation in radians
   * @param frameId - Frame ID (default 'map')
   * @returns true if sent successfully, false otherwise
   */
  const sendGoalPose = useCallback(
    (x: number, y: number, theta: number, frameId: string = 'map'): boolean => {
      const socket = socketRef.current

      // Update store with pending goal regardless of connection
      usePathStore.getState().setGoalPose({ x, y, theta, frameId })

      if (!socket?.connected) {
        return false
      }

      socket.emit('set_goal_pose', { x, y, theta, frameId })
      return true
    },
    []
  )

  /**
   * Load a saved map into Nav2 MapServer
   *
   * @param mapId - Map ID to load
   * @returns true if request sent, false otherwise
   */
  const loadMapToNav2 = useCallback((mapId: string): boolean => {
    const socket = socketRef.current

    if (!socket?.connected) {
      return false
    }

    // Update store state
    useExplorationStore.getState().loadMapToNav2(mapId)

    socket.emit('load_map_to_nav2', { mapId })
    return true
  }, [])

  /**
   * Start SLAM mode (kills MapServer if running)
   *
   * @returns true if request sent, false otherwise
   */
  const startSlam = useCallback((): boolean => {
    const socket = socketRef.current

    if (!socket?.connected) {
      return false
    }

    // Update store state
    useExplorationStore.getState().startSlam()

    socket.emit('start_slam')
    return true
  }, [])

  /**
   * Stop all mapping processes (SLAM + Explore Lite)
   *
   * @returns true if request sent, false otherwise
   */
  const stopMapping = useCallback((): boolean => {
    const socket = socketRef.current

    if (!socket?.connected) {
      return false
    }

    // Reset exploration store state
    useExplorationStore.getState().setMapServerMode('none')
    useExplorationStore.getState().setMapLoadingStatus('idle')

    socket.emit('stop_mapping')
    return true
  }, [])

  /**
   * Request current map manager mode
   *
   * @returns true if request sent, false otherwise
   */
  const requestMapMode = useCallback((): boolean => {
    const socket = socketRef.current

    if (!socket?.connected) {
      return false
    }

    socket.emit('get_map_mode')
    return true
  }, [])

  /**
   * Send Vision LLM analysis request
   *
   * @param prompt - Analysis prompt
   * @param options - Optional parameters (temperature, maxOutputTokens, robotId)
   * @returns Request ID if sent successfully, null otherwise
   */
  const sendVisionLlmRequest = useCallback(
    (
      prompt: string,
      options?: {
        temperature?: number
        maxOutputTokens?: number
        robotId?: string
      }
    ): string | null => {
      const socket = socketRef.current

      if (!socket?.connected) {
        return null
      }

      // Generate request ID and update store
      const store = useVisionLlmStore.getState()
      const requestId = store.sendRequest(prompt)

      // Send to server
      socket.emit('vision_llm_analyze', {
        type: 'vision_llm_request',
        timestamp: Date.now(),
        data: {
          requestId,
          prompt,
          temperature: options?.temperature ?? store.temperature,
          maxOutputTokens: options?.maxOutputTokens ?? store.maxOutputTokens,
          robotId: options?.robotId,
        },
      })

      return requestId
    },
    []
  )

  /**
   * Initialize WebSocket connection
   */
  useEffect(() => {
    mountedRef.current = true

    // Set initial connecting state
    useWebSocketStore.getState().connect()

    // Create socket instance
    const socket = io(url, WS_CONFIG)
    socketRef.current = socket

    // Register event handlers
    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on('connect_error', handleConnectError)
    socket.on('robot_state', handleRobotState)
    socket.on('camera_discovered', handleCameraDiscovered)
    socket.on('camera_lost', handleCameraLost)
    socket.on('video_frame', handleVideoFrame)
    socket.on('lidar_scan', handleLidarScan)
    socket.on('slam_graph', handleSlamGraph)
    socket.on('rosbridge_status', handleRosbridgeStatus)
    socket.on('ros_topics', handleRosTopics)
    socket.on('ros_topics_error', handleRosTopicsError)
    socket.on('occupancy_grid', handleOccupancyGrid)
    socket.on('navigation_path', handleNavigationPath)
    socket.on('imu_data', handleImuData)
    socket.on('goal_pose_ack', handleGoalPoseAck)
    socket.on('navigation_feedback', handleNavigationFeedback)
    socket.on('navigation_status', handleNavigationStatus)
    socket.on('exploration_status', handleExplorationStatus)
    socket.on('exploration_progress', handleExplorationProgress)
    socket.on('exploration_frontier_selected', handleExplorationFrontierSelected)
    socket.on('vision_llm_response', handleVisionLlmResponse)
    socket.on('map_status', handleMapStatus)
    socket.on('map_mode_changed', handleMapModeChanged)
    socket.on('mapping_status', handleMappingStatus)
    socket.on('server:stats', handleMachineStats)

    // Initiate connection
    socket.connect()

    // Cleanup on unmount
    return () => {
      mountedRef.current = false

      // Remove event handlers
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off('connect_error', handleConnectError)
      socket.off('robot_state', handleRobotState)
      socket.off('camera_discovered', handleCameraDiscovered)
      socket.off('camera_lost', handleCameraLost)
      socket.off('video_frame', handleVideoFrame)
      socket.off('lidar_scan', handleLidarScan)
      socket.off('slam_graph', handleSlamGraph)
      socket.off('rosbridge_status', handleRosbridgeStatus)
      socket.off('ros_topics', handleRosTopics)
      socket.off('ros_topics_error', handleRosTopicsError)
      socket.off('occupancy_grid', handleOccupancyGrid)
      socket.off('navigation_path', handleNavigationPath)
      socket.off('imu_data', handleImuData)
      socket.off('goal_pose_ack', handleGoalPoseAck)
      socket.off('navigation_feedback', handleNavigationFeedback)
      socket.off('navigation_status', handleNavigationStatus)
      socket.off('exploration_status', handleExplorationStatus)
      socket.off('exploration_progress', handleExplorationProgress)
      socket.off('exploration_frontier_selected', handleExplorationFrontierSelected)
      socket.off('vision_llm_response', handleVisionLlmResponse)
      socket.off('map_status', handleMapStatus)
      socket.off('map_mode_changed', handleMapModeChanged)
      socket.off('mapping_status', handleMappingStatus)

      // Disconnect socket
      socket.disconnect()

      // Update store state
      useWebSocketStore.getState().setSocket(null)
      useWebSocketStore.getState().disconnect()

      socketRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]) // Only reconnect when URL changes - handlers are stable (useCallback with [] deps)

  // Clear reconnect flag after URL change triggers reconnection
  useEffect(() => {
    if (shouldReconnect) {
      clearReconnectFlag()
    }
  }, [shouldReconnect, clearReconnectFlag])

  return {
    isConnected,
    sendCommand,
    socket: socketRef.current,
    subscribeToCamera,
    unsubscribeFromCamera,
    onVideoFrame,
    requestTopics,
    subscribeToRosTopic,
    unsubscribeFromRosTopic,
    sendGoalPose,
    sendVisionLlmRequest,
    loadMapToNav2,
    startSlam,
    stopMapping,
    requestMapMode,
  }
}

/**
 * Export hook type for testing
 */
export type UseWebSocket = typeof useWebSocket
