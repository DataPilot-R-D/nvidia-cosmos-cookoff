/**
 * ROS Bridge Client Handler
 *
 * Connects to external rosbridge_server and forwards messages
 * between web clients and ROS 2 ecosystem.
 *
 * Protocol: rosbridge v2.0 (JSON over WebSocket)
 */

import WebSocket from 'ws'
import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Logger } from 'pino'
import sharp from 'sharp'
import {
  getExplorationService,
  type ExplorationService,
} from '../../services/exploration-service.js'
// WASM processor available for CPU-intensive operations (e.g., frontier detection)
// Benchmarks show V8 JIT is faster for PointCloud2/LaserScan due to optimized Buffer ops
// import * as wasmProcessing from '@workspace/wasm-processing'
import {
  type RosbridgeMessage,
  type RosbridgeClientState,
  type QoSProfile,
  ROSBRIDGE_CONFIG,
  DEFAULT_TOPICS,
  QOS_PROFILES,
  inferTopicType,
} from './types.js'
import { createEmptyTopicStats, updateTopicStats, type TopicStats } from './topic-stats.js'
import {
  registerVisionLlmHandlers,
  handleVisionLlmResult,
  cleanupVisionLlmRequests,
  initVisionLlm,
} from '../vision-llm.js'

// Camera frame throttling state
const cameraFrameState: Map<string, { lastFrameTime: number; discovered: boolean }> = new Map()

// Store discovered cameras for sending to new clients
// Must match CameraEntitySchema from @workspace/shared-types
interface DiscoveredCamera {
  id: string
  robotId: string
  name: string
  topic: string
  status: 'active' | 'inactive' | 'error' | 'connecting'
  capabilities: {
    supportsWebRTC: boolean
    supportsHLS: boolean
    supportsPTZ: boolean
    maxResolution: { width: number; height: number }
    maxFps: number
  }
  webrtcEnabled: boolean
}
const discoveredCameras: Map<string, DiscoveredCamera> = new Map()

// Topic message-rate estimation (Hz)
const topicStats: Map<string, TopicStats> = new Map()

function getOrInitTopicStats(topic: string): TopicStats {
  const existing = topicStats.get(topic)
  if (existing) return existing
  const created = createEmptyTopicStats()
  topicStats.set(topic, created)
  return created
}

/**
 * Get all discovered cameras (for sending to new clients)
 */
export function getDiscoveredCameras(): DiscoveredCamera[] {
  return Array.from(discoveredCameras.values())
}

// PointCloud2 throttling state (prevents server overload from high-frequency LIDAR)
let lastPointCloudTime = 0
const POINTCLOUD_THROTTLE_MS = 200 // 5 FPS max for PointCloud2

// =============================================================================
// MEMORY OPTIMIZATION: Pre-allocated buffers for PointCloud2 processing
// =============================================================================

/**
 * Pre-allocated buffer for base64 decoding (avoids allocation per frame)
 * 2MB covers most PointCloud2 messages from Isaac Sim
 */
const PC2_BUFFER_SIZE = 2 * 1024 * 1024
let pc2DecodeBuffer = Buffer.alloc(PC2_BUFFER_SIZE)

/**
 * Module-level voxel map - reused between frames (V8 keeps hash table capacity on .clear())
 * Using integer keys instead of string keys eliminates ~100K string allocations/second
 */
const voxelMapPool = new Map<
  number,
  { x: number; y: number; z: number; intensity: number; count: number }
>()

/**
 * Compute integer hash for voxel coordinates
 * Works for coordinates in range [-1638, 1638] meters at 5cm voxel size
 * Formula: Szudzik-like pairing for 3D coordinates
 */
function voxelHash(vx: number, vy: number, vz: number): number {
  // Shift to positive range (assuming robot operates within ±50m)
  const px = vx + 32768
  const py = vy + 32768
  const pz = vz + 512
  // Pack into single integer (safe for JS up to 2^53)
  return (px * 65536 + py) * 1024 + pz
}

// Note: voxelGridFilter was inlined into handlePointCloud2 for better stream processing
// The voxelMapPool and voxelHash are still used by handlePointCloud2

// =============================================================================
// ROS Bridge Client
// =============================================================================

export function createRosbridgeClient(
  io: SocketIOServer,
  logger: Logger,
  rosbridgeUrl: string
): RosbridgeClientState {
  const state: RosbridgeClientState = {
    ws: null,
    isConnected: false,
    reconnectAttempts: 0,
    subscribedTopics: new Set(),
    heartbeatInterval: null,
    lastPong: Date.now(),
    lastTopicsEmittedAt: 0,
  }

  // Non-typed extensions (used by socket handlers)
  state.lastTopicsEmittedAt = 0

  // Initialize exploration service
  const explorationService: ExplorationService = getExplorationService(io, logger)

  /**
   * Start heartbeat mechanism to keep ROSBridge connection alive
   * Sends periodic pings and monitors for pong responses
   */
  function startHeartbeat(): void {
    // Clear any existing heartbeat
    if (state.heartbeatInterval) {
      clearInterval(state.heartbeatInterval)
    }

    state.lastPong = Date.now()

    state.heartbeatInterval = setInterval(() => {
      if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
        logger.warn('Heartbeat: WebSocket not open, stopping heartbeat')
        stopHeartbeat()
        return
      }

      // Check if we received pong within timeout
      const timeSinceLastPong = Date.now() - state.lastPong
      if (timeSinceLastPong > ROSBRIDGE_CONFIG.heartbeatInterval + ROSBRIDGE_CONFIG.pingTimeout) {
        logger.error({ timeSinceLastPong }, 'Heartbeat timeout - no pong received, reconnecting')
        state.ws.close()
        return
      }

      // Send ping to keep connection alive
      // ROSBridge supports WebSocket ping/pong frames
      try {
        state.ws.ping()
        logger.debug('Heartbeat: sent ping to ROSBridge')
      } catch (error) {
        logger.error({ error }, 'Heartbeat: failed to send ping')
      }
    }, ROSBRIDGE_CONFIG.heartbeatInterval)

    logger.info({ interval: ROSBRIDGE_CONFIG.heartbeatInterval }, 'Heartbeat started')
  }

  /**
   * Stop heartbeat mechanism
   */
  function stopHeartbeat(): void {
    if (state.heartbeatInterval) {
      clearInterval(state.heartbeatInterval)
      state.heartbeatInterval = null
      logger.debug('Heartbeat stopped')
    }
  }

  function connect(): void {
    if (state.ws?.readyState === WebSocket.OPEN) {
      logger.debug('Rosbridge already connected')
      return
    }

    logger.info({ url: rosbridgeUrl }, 'Connecting to rosbridge...')

    try {
      state.ws = new WebSocket(rosbridgeUrl)

      state.ws.on('open', () => {
        logger.info({ url: rosbridgeUrl }, 'Connected to rosbridge')
        state.isConnected = true
        state.reconnectAttempts = 0

        // Connect exploration service to ROSBridge WebSocket
        explorationService.setRosbridgeConnection(state.ws)

        // Start heartbeat to keep connection alive
        startHeartbeat()

        // Notify all clients
        io.emit('rosbridge_status', {
          type: 'rosbridge_status',
          timestamp: Date.now(),
          data: { connected: true, url: rosbridgeUrl },
        })

        // Emit initial robot state for robot0 (Go2 Unitree from Isaac Sim)
        io.emit('robot_state', {
          type: 'robot_state',
          timestamp: Date.now(),
          data: {
            robotId: 'robot0',
            name: 'Go2 Unitree',
            position: { x: 0, y: 0, z: 0 },
            battery: 100,
            status: 'online',
            velocity: 0,
            lastSeen: Date.now(),
          },
        })

        // First get list of available topics
        getAvailableTopics()

        // Subscribe to default topics
        subscribeToTopics()

        // Force map republish after subscriptions establish (workaround for QoS timing)
        // SLAM Toolbox may have published map before we subscribed with transient_local
        setTimeout(() => {
          logger.info('Requesting SLAM map republish via dynamic_map service...')

          // Call slam_toolbox dynamic_map service to trigger republish
          const republishMsg: RosbridgeMessage = {
            op: 'call_service',
            service: '/slam_toolbox/dynamic_map',
            id: 'force_map_republish_' + Date.now(),
          }

          if (state.ws?.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify(republishMsg))
            logger.info('Sent dynamic_map service call to trigger map republish')
          }
        }, 2000) // Wait 2s for subscriptions to fully establish
      })

      // Handle pong response for heartbeat
      state.ws.on('pong', () => {
        state.lastPong = Date.now()
        logger.debug('Heartbeat: received pong from ROSBridge')
      })

      state.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message: RosbridgeMessage = JSON.parse(data.toString())
          // Log all incoming messages for debugging
          if (message.op === 'publish') {
            logger.info({ topic: message.topic }, 'Received rosbridge publish')
          }
          handleRosbridgeMessage(message)
        } catch (error) {
          logger.error({ error }, 'Failed to parse rosbridge message')
        }
      })

      state.ws.on('close', () => {
        logger.warn('Rosbridge connection closed')
        state.isConnected = false
        state.subscribedTopics.clear()

        // Stop heartbeat
        stopHeartbeat()

        // Clear transient per-connection caches
        cameraFrameState.clear()
        topicStats.clear()
        // Mark existing cameras as inactive (don't delete - clients keep reference)
        for (const [id, cam] of discoveredCameras) {
          discoveredCameras.set(id, { ...cam, status: 'inactive' })
        }
        logger.debug('Cleared camera frame state on disconnect')

        io.emit('rosbridge_status', {
          type: 'rosbridge_status',
          timestamp: Date.now(),
          data: { connected: false, url: rosbridgeUrl },
        })

        // Attempt reconnect
        scheduleReconnect()
      })

      state.ws.on('error', (error) => {
        logger.error({ error }, 'Rosbridge WebSocket error')
      })
    } catch (error) {
      logger.error({ error }, 'Failed to create rosbridge connection')
      scheduleReconnect()
    }
  }

  function scheduleReconnect(): void {
    if (state.reconnectAttempts >= ROSBRIDGE_CONFIG.maxReconnectAttempts) {
      logger.error('Max reconnect attempts reached for rosbridge')
      return
    }

    state.reconnectAttempts++
    const delay = ROSBRIDGE_CONFIG.reconnectDelay * state.reconnectAttempts

    logger.info({ attempt: state.reconnectAttempts, delay }, 'Scheduling rosbridge reconnect')

    setTimeout(connect, delay)
  }

  /**
   * Build fallback topic list from DEFAULT_TOPICS when rosapi is not available
   */
  function buildFallbackTopicList(): Array<{ name: string; type: string }> {
    const topicList: Array<{ name: string; type: string }> = []

    // Add all default topics with inferred types
    Object.values(DEFAULT_TOPICS).forEach((topic) => {
      topicList.push({
        name: topic,
        type: inferTopicType(topic),
      })
    })

    // Add any additional subscribed topics
    state.subscribedTopics.forEach((topic) => {
      if (!topicList.find((t) => t.name === topic)) {
        topicList.push({
          name: topic,
          type: inferTopicType(topic),
        })
      }
    })

    return topicList
  }

  /**
   * Emit fallback topic list to all clients
   */
  function emitFallbackTopics(): void {
    const now = Date.now()
    const topicList = buildFallbackTopicList().map((t) => {
      const stats = topicStats.get(t.name)
      return {
        ...t,
        messageRate: stats?.emaHz ?? null,
        lastMessage: stats?.lastMessageAt ?? null,
      }
    })

    state.lastTopicsEmittedAt = now

    io.emit('ros_topics', {
      type: 'ros_topics',
      timestamp: now,
      data: {
        topics: topicList,
        count: topicList.length,
        source: 'fallback', // Indicate this is fallback data
      },
    })

    logger.info({ count: topicList.length }, 'Emitted fallback topic list (rosapi unavailable)')
  }

  // Timeout for rosapi service call
  let topicsRequestTimeout: NodeJS.Timeout | null = null

  function getAvailableTopics(): void {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return

    // Set timeout - if no response in 3 seconds, use fallback
    if (topicsRequestTimeout) {
      clearTimeout(topicsRequestTimeout)
    }
    topicsRequestTimeout = setTimeout(() => {
      logger.warn('rosapi/topics service timeout - using fallback topic list')
      emitFallbackTopics()
    }, 3000)

    // Call rosapi/topics service to get available topics
    const callService: RosbridgeMessage = {
      op: 'call_service',
      service: '/rosapi/topics',
      id: 'get_topics_' + Date.now(),
    }

    state.ws.send(JSON.stringify(callService))
    logger.info('Requesting available topics from rosbridge')
  }

  function subscribeToTopics(): void {
    // Subscribe to clock to verify simulation is running
    subscribe('/clock', 'rosgraph_msgs/Clock')

    // ===== Navigation Topics =====
    subscribe(DEFAULT_TOPICS.scan, 'sensor_msgs/LaserScan')
    subscribe(DEFAULT_TOPICS.cmdVel, 'geometry_msgs/Twist')
    subscribe(DEFAULT_TOPICS.odom, 'nav_msgs/Odometry')
    // Map topics: /map needs transient_local, /map_live uses volatile (republisher)
    subscribe(DEFAULT_TOPICS.map, 'nav_msgs/OccupancyGrid', QOS_PROFILES.MAP)
    subscribe(DEFAULT_TOPICS.mapLive, 'nav_msgs/OccupancyGrid') // Republisher uses volatile QoS
    subscribe(DEFAULT_TOPICS.goalPose, 'geometry_msgs/PoseStamped')
    subscribe(DEFAULT_TOPICS.plan, 'nav_msgs/Path')

    // ===== Robot0 (Go2 Unitree / Isaac Sim) Topics =====
    // Odometry and state
    subscribe(DEFAULT_TOPICS.robot0Odom, 'nav_msgs/Odometry')
    subscribe(DEFAULT_TOPICS.robot0States, 'std_msgs/String') // Robot state info
    subscribe(DEFAULT_TOPICS.robot0Imu, 'sensor_msgs/Imu')
    subscribe(DEFAULT_TOPICS.robot0JointStates, 'sensor_msgs/JointState')

    // Camera
    subscribe(DEFAULT_TOPICS.robot0Camera, 'sensor_msgs/Image')

    // LIDAR (PointCloud2)
    subscribe(DEFAULT_TOPICS.robot0Lidar, 'sensor_msgs/PointCloud2')
    subscribe(DEFAULT_TOPICS.robot0LidarExtra, 'sensor_msgs/PointCloud2')

    // ===== SLAM Topics =====
    subscribe(DEFAULT_TOPICS.slamScan, 'sensor_msgs/LaserScan')
    subscribe(DEFAULT_TOPICS.slamGraph, 'visualization_msgs/MarkerArray')
    // Alternative map topic from SLAM Toolbox (may publish here instead of /map)
    subscribe(DEFAULT_TOPICS.slamMap, 'nav_msgs/OccupancyGrid', QOS_PROFILES.MAP)

    // ===== Nav2 Action Feedback =====
    subscribe(DEFAULT_TOPICS.navFeedback, 'nav2_msgs/action/NavigateToPose_FeedbackMessage')
    subscribe(DEFAULT_TOPICS.navStatus, 'action_msgs/GoalStatusArray')

    // ===== Costmaps (require transient_local QoS) =====
    subscribe(DEFAULT_TOPICS.globalCostmap, 'nav_msgs/OccupancyGrid', QOS_PROFILES.MAP)
    subscribe(DEFAULT_TOPICS.localCostmap, 'nav_msgs/OccupancyGrid', QOS_PROFILES.MAP)

    // ===== Vision LLM =====
    // TODO: Enable when my_srvs package is installed on ROS2 server
    // subscribe(DEFAULT_TOPICS.visionLlmResult, 'my_srvs/msg/VisionLLMResult')

    // ===== Dashboard Notifications =====
    subscribe(DEFAULT_TOPICS.dashboardNotifications, 'std_msgs/String')

    logger.info('Subscribed to Isaac Sim robot topics')
  }

  function subscribe(topic: string, type?: string, qos?: QoSProfile): void {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      logger.warn({ topic }, 'Cannot subscribe - rosbridge not connected')
      return
    }

    if (state.subscribedTopics.has(topic)) {
      logger.debug({ topic }, 'Already subscribed to topic')
      return
    }

    const subscribeMsg: RosbridgeMessage = {
      op: 'subscribe',
      topic,
      type,
      ...(qos && { qos }), // Include QoS if provided (critical for transient_local topics)
    }

    state.ws.send(JSON.stringify(subscribeMsg))
    state.subscribedTopics.add(topic)
    logger.info({ topic, type, qos: qos?.durability || 'default' }, 'Subscribed to rosbridge topic')
  }

  function unsubscribe(topic: string): void {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return

    const unsubscribeMsg: RosbridgeMessage = {
      op: 'unsubscribe',
      topic,
    }

    state.ws.send(JSON.stringify(unsubscribeMsg))
    state.subscribedTopics.delete(topic)
    logger.info({ topic }, 'Unsubscribed from rosbridge topic')
  }

  function publish(topic: string, msg: unknown): void {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
      logger.warn({ topic }, 'Cannot publish - rosbridge not connected')
      return
    }

    const publishMsg: RosbridgeMessage = {
      op: 'publish',
      topic,
      msg,
    }

    state.ws.send(JSON.stringify(publishMsg))
    logger.debug({ topic }, 'Published to rosbridge')
  }

  function handleRosbridgeMessage(message: RosbridgeMessage): void {
    // Handle service responses (e.g., topic list)
    if (message.op === 'service_response') {
      logger.info(
        { id: message.id, result: message.result, hasValues: !!message.values },
        '>>> Received service_response from ROSBridge'
      )

      // Handle Vision LLM service response
      if (message.id?.startsWith('vision_llm_')) {
        const requestId = message.id.replace('vision_llm_', '')
        const values = message.values as { text?: string } | string | undefined
        const result = message.result as boolean

        logger.info(
          { requestId, result, valuesType: typeof values },
          '>>> Vision LLM service_response received'
        )

        if (result && values) {
          // Extract text from response - could be object with text field or error string
          const responseText = typeof values === 'object' ? values.text : String(values)

          if (responseText) {
            logger.info(
              { requestId, responseLength: responseText.length },
              '>>> Vision LLM response text received, emitting to clients'
            )

            // Emit to all clients (the store will match by requestId)
            io.emit('vision_llm_response', {
              type: 'vision_llm_response',
              timestamp: Date.now(),
              data: {
                requestId,
                success: true,
                response: responseText,
                processingTime: 0, // We don't have this from service_response
              },
            })
          }
        } else {
          // Service call failed
          const errorMsg = typeof values === 'string' ? values : 'Service call failed'
          logger.error({ requestId, error: errorMsg }, '>>> Vision LLM service call failed')

          io.emit('vision_llm_response', {
            type: 'vision_llm_response',
            timestamp: Date.now(),
            data: {
              requestId,
              success: false,
              error: errorMsg,
            },
          })
        }
        return
      }

      if (message.id?.startsWith('get_topics_')) {
        // Clear timeout since we got a response
        if (topicsRequestTimeout) {
          clearTimeout(topicsRequestTimeout)
          topicsRequestTimeout = null
        }

        const values = message.values as Record<string, unknown>
        const result = message.result as boolean | undefined
        const topics = values?.topics as string[]
        const types = values?.types as string[] | undefined

        // Check if service call failed
        if (result === false || !topics || topics.length === 0) {
          logger.warn(
            { result, hasTopics: !!topics },
            'rosapi/topics service failed or returned empty - using fallback'
          )
          emitFallbackTopics()
          return
        }

        logger.info({ topics: topics.slice(0, 30), total: topics.length }, 'Available ROS topics')

        // Log camera-related topics specifically
        const cameraTopics = topics.filter(
          (t) => t.includes('camera') || t.includes('image') || t.includes('cam')
        )
        logger.info({ cameraTopics }, 'Camera-related topics available')

        // Prune stats for topics that disappeared
        const topicSet = new Set(topics)
        for (const key of topicStats.keys()) {
          if (!topicSet.has(key)) {
            topicStats.delete(key)
          }
        }

        // Emit full topic list to all clients
        const now = Date.now()
        const topicList = topics.map((topic, index) => {
          const stats = topicStats.get(topic)
          return {
            name: topic,
            type: types?.[index] || inferTopicType(topic),
            messageRate: stats?.emaHz ?? null,
            lastMessage: stats?.lastMessageAt ?? null,
          }
        })

        state.lastTopicsEmittedAt = now

        io.emit('ros_topics', {
          type: 'ros_topics',
          timestamp: now,
          data: {
            topics: topicList,
            count: topicList.length,
            source: 'rosapi',
          },
        })

        logger.info({ count: topicList.length }, 'Emitted topic list to clients')

        // Auto-subscribe to found topics
        topics.forEach((topic) => {
          if (topic.includes('scan') || topic.includes('lidar') || topic.includes('point_cloud')) {
            const type = topic.includes('point_cloud')
              ? 'sensor_msgs/PointCloud2'
              : 'sensor_msgs/LaserScan'
            subscribe(topic, type)
          } else if (topic.includes('compressed')) {
            // Compressed images (including front_cam/rgb/compressed)
            subscribe(topic, 'sensor_msgs/CompressedImage')
          } else if (topic.includes('image') && !topic.includes('compressed')) {
            subscribe(topic, 'sensor_msgs/Image')
          } else if (
            (topic.includes('cam/rgb') || topic.includes('front_cam')) &&
            !topic.includes('compressed')
          ) {
            // Raw camera images only (not compressed)
            subscribe(topic, 'sensor_msgs/Image')
          } else if (topic.includes('odom')) {
            subscribe(topic, 'nav_msgs/Odometry')
          } else if (topic.includes('cmd_vel')) {
            // Don't subscribe to cmd_vel - we publish to it
          }
        })
      }
      return
    }

    // Handle service call errors
    if (message.op === 'call_service' && message.id?.startsWith('get_topics_')) {
      // This shouldn't happen but handle it just in case
      logger.warn({ message }, 'Unexpected call_service response')
      return
    }

    // Handle Nav2 action feedback (from /navigate_to_pose action)
    if (message.op === 'action_feedback') {
      const feedback = message.values as Record<string, unknown> | undefined
      const actionFeedback = (feedback?.feedback || message.feedback) as
        | Record<string, unknown>
        | undefined

      logger.info(
        { actionId: message.id, hasFeedback: !!actionFeedback },
        'Received Nav2 action feedback'
      )

      if (actionFeedback) {
        const distanceRemaining = actionFeedback.distance_remaining as number | undefined
        const navigationTime = actionFeedback.navigation_time as Record<string, number> | undefined
        const numberOfRecoveries = actionFeedback.number_of_recoveries as number | undefined

        io.emit('navigation_feedback', {
          type: 'navigation_feedback',
          timestamp: Date.now(),
          data: {
            actionId: message.id,
            distanceRemaining: distanceRemaining ?? null,
            navigationTime: navigationTime
              ? navigationTime.sec + (navigationTime.nanosec || 0) / 1e9
              : null,
            numberOfRecoveries: numberOfRecoveries ?? 0,
          },
        })
      }
      return
    }

    // Handle Nav2 action result (goal reached, aborted, canceled)
    if (message.op === 'action_result') {
      const statusCode = message.status as number
      const result = message.result as Record<string, unknown> | undefined

      // Status codes: 1=ACCEPTED, 2=EXECUTING, 4=SUCCEEDED, 5=CANCELED, 6=ABORTED
      let status: string
      switch (statusCode) {
        case 4:
          status = 'reached'
          break
        case 5:
          status = 'canceled'
          break
        case 6:
          status = 'failed'
          break
        default:
          status = 'unknown'
      }

      logger.info(
        { actionId: message.id, statusCode, status, result },
        'Nav2 action result received'
      )

      io.emit('navigation_status', {
        type: 'navigation_status',
        timestamp: Date.now(),
        data: {
          status,
          actionId: message.id,
          statusCode,
        },
      })

      // Forward navigation result to exploration service
      explorationService.handleNavigationResult(status, message.id as string)

      return
    }

    if (message.op !== 'publish') return

    const { topic, msg } = message

    // Update per-topic activity + message rate estimate
    if (topic) {
      const prev = getOrInitTopicStats(topic)
      topicStats.set(topic, updateTopicStats(prev, Date.now()))
    }

    // Handle camera topics dynamically (any topic containing 'image' or 'cam')
    if (topic && (topic.includes('image') || topic.includes('cam') || topic.includes('camera'))) {
      if (topic.includes('compressed')) {
        handleCompressedImage(msg as Record<string, unknown>, topic)
      } else {
        // Handle async conversion without blocking message processing
        handleRawImage(msg as Record<string, unknown>, topic).catch((err) => {
          logger.error({ error: err, topic }, 'handleRawImage failed')
        })
      }
      return
    }

    // Handle LIDAR topics (LaserScan)
    if (topic === DEFAULT_TOPICS.scan || topic === DEFAULT_TOPICS.slamScan) {
      handleLidarScan(msg as Record<string, unknown>, topic)
      return
    }

    // Handle PointCloud2 topics (robot0 LIDAR)
    if (topic === DEFAULT_TOPICS.robot0Lidar || topic === DEFAULT_TOPICS.robot0LidarExtra) {
      handlePointCloud2(msg as Record<string, unknown>, topic)
      return
    }

    // Handle odometry topics
    if (topic === DEFAULT_TOPICS.odom || topic === DEFAULT_TOPICS.robot0Odom) {
      handleOdometry(msg as Record<string, unknown>)
      return
    }

    // Handle robot state topics
    if (topic === DEFAULT_TOPICS.robot0States) {
      handleRobotStates(msg as Record<string, unknown>)
      return
    }

    // Handle IMU
    if (topic === DEFAULT_TOPICS.robot0Imu) {
      handleImu(msg as Record<string, unknown>)
      return
    }

    // Handle SLAM graph visualization
    if (topic === DEFAULT_TOPICS.slamGraph) {
      handleSlamGraph(msg as Record<string, unknown>)
      return
    }

    // Handle OccupancyGrid topics (map, costmaps)
    if (
      topic === DEFAULT_TOPICS.map ||
      topic === DEFAULT_TOPICS.mapLive ||
      topic === DEFAULT_TOPICS.globalCostmap ||
      topic === DEFAULT_TOPICS.localCostmap ||
      topic?.includes('costmap') ||
      topic?.includes('/map')
    ) {
      handleOccupancyGrid(msg as Record<string, unknown>, topic)
      return
    }

    // Handle Path topics (navigation plan)
    if (
      topic === DEFAULT_TOPICS.plan ||
      topic === DEFAULT_TOPICS.localPlan ||
      topic?.includes('plan') ||
      topic?.includes('path')
    ) {
      handlePath(msg as Record<string, unknown>, topic)
      return
    }

    // Handle Nav2 action feedback
    if (topic === DEFAULT_TOPICS.navFeedback) {
      handleNavigationFeedback(msg as Record<string, unknown>)
      return
    }

    // Handle Nav2 action status
    if (topic === DEFAULT_TOPICS.navStatus) {
      handleNavigationStatus(msg as Record<string, unknown>)
      return
    }

    // Handle Vision LLM result topic
    if (topic === DEFAULT_TOPICS.visionLlmResult) {
      logger.info(
        { topic, msgKeys: Object.keys(msg as object) },
        '>>> Received Vision LLM result from topic'
      )
      handleVisionLlmResult(msg as Record<string, unknown>).catch((err) => {
        logger.error({ error: err, topic }, 'handleVisionLlmResult failed')
      })
      return
    }

    // Handle dashboard notifications from planner/executor
    if (topic === DEFAULT_TOPICS.dashboardNotifications) {
      const raw = (msg as { data?: string }).data
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Record<string, unknown>
          if (parsed.category && parsed.title) {
            io.emit('dashboard_notification', {
              type: 'dashboard_notification',
              timestamp: Date.now(),
              data: parsed,
            })
          }
        } catch {
          logger.warn({ topic }, 'Invalid dashboard notification JSON')
        }
      }
      return
    }

    // Forward other topics to clients
    io.emit('ros_message', {
      type: 'ros_message',
      timestamp: Date.now(),
      data: { topic, msg },
    })
  }

  function handleLidarScan(msg: Record<string, unknown>, topic: string): void {
    // Convert LaserScan to points for frontend
    // Note: Benchmarks show V8 JIT is faster than WASM for this operation
    const ranges = msg.ranges as number[]
    const angleMin = msg.angle_min as number
    const angleIncrement = msg.angle_increment as number
    const frameId = ((msg.header as Record<string, unknown>)?.frame_id as string) || 'laser'

    logger.debug({ rangesLength: ranges?.length, topic }, 'Processing LaserScan')

    const points: Array<{ x: number; y: number; z: number; intensity: number }> = []

    ranges.forEach((range, i) => {
      if (range > 0 && isFinite(range)) {
        const angle = angleMin + i * angleIncrement
        points.push({
          x: range * Math.cos(angle),
          y: range * Math.sin(angle),
          z: 0,
          intensity: 1,
        })
      }
    })

    // Extract robotId from topic name (e.g., /robot1/scan -> robot1)
    const topicParts = topic.split('/')
    const robotId =
      topicParts.length > 1 && topicParts[1].startsWith('robot') ? topicParts[1] : 'robot0'

    // Emit to all clients
    io.emit('lidar_scan', {
      type: 'lidar_scan',
      timestamp: Date.now(),
      data: {
        robotId,
        pointCount: points.length,
        points,
        frameId,
        topic,
        source: 'laserscan',
      },
    })

    logger.debug({ pointCount: points.length }, 'Emitted LaserScan')
  }

  function handlePointCloud2(msg: Record<string, unknown>, topic: string): void {
    // PointCloud2 processing for Isaac Sim LIDAR
    // Optimized with throttling and VoxelGrid filter to prevent server overload

    // === THROTTLE CHECK (5 FPS max) ===
    const now = Date.now()
    if (now - lastPointCloudTime < POINTCLOUD_THROTTLE_MS) {
      logger.trace({ topic }, 'PointCloud2 throttled')
      return
    }
    lastPointCloudTime = now

    const width = msg.width as number
    const height = msg.height as number
    const pointCount = width * (height || 1)
    const header = msg.header as Record<string, unknown>
    const frameId = (header?.frame_id as string) || 'lidar'
    const pointStep = msg.point_step as number // bytes per point
    const data = msg.data as string // base64 encoded binary data

    // PointCloud2 field definitions
    const fields = msg.fields as Array<{
      name: string
      offset: number
      datatype: number
      count: number
    }>
    const fieldNames = fields?.map((f) => f.name) || []

    // Find x, y, z field offsets
    const xField = fields?.find((f) => f.name === 'x')
    const yField = fields?.find((f) => f.name === 'y')
    const zField = fields?.find((f) => f.name === 'z')

    if (!xField || !yField || !zField || !data) {
      logger.warn(
        { topic, fieldNames, hasData: !!data },
        'PointCloud2 missing required fields or data'
      )
      io.emit('lidar_scan', {
        type: 'lidar_scan',
        timestamp: Date.now(),
        data: {
          robotId: 'robot0',
          pointCount: 0,
          points: [],
          frameId,
          topic,
          source: 'pointcloud2',
        },
      })
      return
    }

    logger.debug({ topic, pointCount, frameId, pointStep, fieldNames }, 'Processing PointCloud2')

    try {
      // === MEMORY OPTIMIZATION: Decode into pre-allocated buffer ===
      const decodedLength = Buffer.byteLength(data, 'base64')

      // Grow buffer only if needed (rare - most frames are similar size)
      if (decodedLength > pc2DecodeBuffer.length) {
        pc2DecodeBuffer = Buffer.alloc(decodedLength)
        logger.info({ newSize: decodedLength }, 'Grew PointCloud2 decode buffer')
      }

      // Write decoded data into pre-allocated buffer (avoids creating new Buffer)
      pc2DecodeBuffer.write(data, 'base64')

      // === PHASE 1: Extract raw points directly into voxel filter (stream processing) ===
      // MEMORY OPTIMIZATION: Accumulate directly to voxel map instead of intermediate array
      const MAX_RAW_POINTS = 20000
      const VOXEL_SIZE = 0.05
      const invVoxel = 1 / VOXEL_SIZE

      // Clear and reuse the module-level voxel map
      voxelMapPool.clear()

      let processedCount = 0
      for (let i = 0; i < pointCount && processedCount < MAX_RAW_POINTS; i++) {
        const offset = i * pointStep

        // Read floats from pre-allocated buffer (V8 JIT optimizes this well)
        const x = pc2DecodeBuffer.readFloatLE(offset + xField.offset)
        const y = pc2DecodeBuffer.readFloatLE(offset + yField.offset)
        const z = pc2DecodeBuffer.readFloatLE(offset + zField.offset)

        // Skip invalid points (NaN or infinite)
        if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue

        // Skip points at origin (often invalid)
        if (x === 0 && y === 0 && z === 0) continue

        // === STREAM DIRECTLY TO VOXEL MAP (no intermediate rawPoints array) ===
        const vx = Math.floor(x * invVoxel)
        const vy = Math.floor(y * invVoxel)
        const vz = Math.floor(z * invVoxel)
        const key = voxelHash(vx, vy, vz)

        const existing = voxelMapPool.get(key)
        if (existing) {
          const newCount = existing.count + 1
          existing.x = (existing.x * existing.count + x) / newCount
          existing.y = (existing.y * existing.count + y) / newCount
          existing.z = (existing.z * existing.count + z) / newCount
          existing.count = newCount
        } else {
          voxelMapPool.set(key, { x, y, z, intensity: 1, count: 1 })
        }

        processedCount++
      }

      // Extract filtered points from voxel map
      const filteredPoints = Array.from(voxelMapPool.values()).map(({ x, y, z, intensity }) => ({
        x,
        y,
        z,
        intensity,
      }))

      // === PHASE 3: Final limit for frontend (max 5000 points) ===
      const MAX_FRONTEND_POINTS = 5000
      const points =
        filteredPoints.length > MAX_FRONTEND_POINTS
          ? filteredPoints.slice(0, MAX_FRONTEND_POINTS)
          : filteredPoints

      // Extract robot ID from topic (e.g., /robot0/point_cloud2_L1 -> robot0)
      const topicParts = topic.split('/')
      const robotId = topicParts.length > 2 ? topicParts[1] : 'robot0'

      io.emit('lidar_scan', {
        type: 'lidar_scan',
        timestamp: Date.now(),
        data: {
          robotId,
          pointCount: points.length,
          points,
          frameId,
          topic,
          source: 'pointcloud2',
        },
      })

      logger.debug(
        {
          topic,
          originalCount: pointCount,
          rawProcessed: processedCount,
          afterVoxelFilter: filteredPoints.length,
          emittedCount: points.length,
          voxelSize: VOXEL_SIZE,
        },
        'Emitted PointCloud2 with VoxelGrid filter'
      )
    } catch (error) {
      logger.error({ error, topic, pointCount }, 'Failed to decode PointCloud2 data')
    }
  }

  function handleRobotStates(msg: Record<string, unknown>): void {
    // Handle /robot0/go2_states (std_msgs/String or custom message)
    const data = msg.data as string

    logger.info({ data: data?.substring(0, 100) }, 'Received robot states')

    // Parse state data if it's JSON
    let parsedStates: Record<string, unknown> = {}
    try {
      if (data && data.startsWith('{')) {
        parsedStates = JSON.parse(data)
      }
    } catch {
      // Not JSON, treat as plain string
      parsedStates = { raw: data }
    }

    io.emit('robot_states', {
      type: 'robot_states',
      timestamp: Date.now(),
      data: {
        robotId: 'robot0',
        states: parsedStates,
        raw: data,
      },
    })
  }

  function handleImu(msg: Record<string, unknown>): void {
    // Handle sensor_msgs/Imu
    const header = msg.header as Record<string, unknown>
    const orientation = msg.orientation as Record<string, number>
    const angularVelocity = msg.angular_velocity as Record<string, number>
    const linearAcceleration = msg.linear_acceleration as Record<string, number>

    logger.debug(
      {
        frameId: header?.frame_id,
        orientation: orientation ? `w=${orientation.w?.toFixed(2)}` : 'none',
      },
      'Processing IMU data'
    )

    io.emit('imu_data', {
      type: 'imu_data',
      timestamp: Date.now(),
      data: {
        robotId: 'robot0',
        frameId: header?.frame_id || 'imu_link',
        orientation: orientation
          ? {
              x: orientation.x,
              y: orientation.y,
              z: orientation.z,
              w: orientation.w,
            }
          : null,
        angularVelocity: angularVelocity
          ? {
              x: angularVelocity.x,
              y: angularVelocity.y,
              z: angularVelocity.z,
            }
          : null,
        linearAcceleration: linearAcceleration
          ? {
              x: linearAcceleration.x,
              y: linearAcceleration.y,
              z: linearAcceleration.z,
            }
          : null,
      },
    })
  }

  function handleSlamGraph(msg: Record<string, unknown>): void {
    // visualization_msgs/MarkerArray contains array of markers
    // Each marker represents a node or edge in the SLAM graph
    const markers = msg.markers as Array<Record<string, unknown>>

    if (!markers || !Array.isArray(markers)) {
      logger.warn({ msgKeys: Object.keys(msg) }, 'SLAM graph: no markers array found')
      return
    }

    // Extract nodes (SPHERE markers) and edges (LINE_LIST markers)
    const nodes: Array<{ id: number; x: number; y: number; z: number }> = []
    const edges: Array<{ points: Array<{ x: number; y: number; z: number }> }> = []

    for (const marker of markers) {
      const markerType = marker.type as number
      const pose = marker.pose as Record<string, unknown>
      const position = pose?.position as Record<string, number>
      const points = marker.points as Array<Record<string, number>>
      const markerId = marker.id as number

      // Type 2 = SPHERE (node), Type 4 = LINE_LIST (edges)
      if (markerType === 2 && position) {
        nodes.push({
          id: markerId,
          x: position.x || 0,
          y: position.y || 0,
          z: position.z || 0,
        })
      } else if (markerType === 4 && points && points.length > 0) {
        edges.push({
          points: points.map((p) => ({
            x: p.x || 0,
            y: p.y || 0,
            z: p.z || 0,
          })),
        })
      }
    }

    logger.info(
      { nodeCount: nodes.length, edgeCount: edges.length, totalMarkers: markers.length },
      'Processing SLAM graph'
    )

    // Emit to clients
    io.emit('slam_graph', {
      type: 'slam_graph',
      timestamp: Date.now(),
      data: {
        nodes,
        edges,
        markerCount: markers.length,
      },
    })
  }

  /**
   * Handle OccupancyGrid messages (nav_msgs/OccupancyGrid)
   * Used for /map, /global_costmap/costmap, /local_costmap/costmap
   */
  function handleOccupancyGrid(msg: Record<string, unknown>, topic: string): void {
    const info = msg.info as Record<string, unknown>
    const header = msg.header as Record<string, unknown>
    const data = msg.data as number[] | string // Can be array or base64

    if (!info || !data) {
      logger.warn(
        { topic, hasInfo: !!info, hasData: !!data },
        'OccupancyGrid missing required fields'
      )
      return
    }

    const width = info.width as number
    const height = info.height as number
    const resolution = info.resolution as number
    const origin = info.origin as Record<string, unknown>
    const originPosition = origin?.position as Record<string, number>
    const originOrientation = origin?.orientation as Record<string, number>

    // Convert data to base64 if it's an array (for efficient transfer)
    let gridData: string
    if (Array.isArray(data)) {
      // Convert int8 array to base64
      const buffer = Buffer.from(data.map((v) => (v < 0 ? 256 + v : v)))
      gridData = buffer.toString('base64')
    } else {
      gridData = data
    }

    logger.info(
      {
        topic,
        width,
        height,
        resolution,
        cellCount: width * height,
      },
      'Processing OccupancyGrid'
    )

    const defaultOrientation = { x: 0, y: 0, z: 0, w: 1 }
    const occupancyGridData = {
      topic,
      frameId: (header?.frame_id as string) || 'map',
      width,
      height,
      resolution,
      origin: {
        x: originPosition?.x || 0,
        y: originPosition?.y || 0,
        z: originPosition?.z || 0,
        orientation: originOrientation
          ? {
              x: originOrientation.x ?? 0,
              y: originOrientation.y ?? 0,
              z: originOrientation.z ?? 0,
              w: originOrientation.w ?? 1,
            }
          : defaultOrientation,
      },
      data: gridData,
    }

    io.emit('occupancy_grid', {
      type: 'occupancy_grid',
      timestamp: Date.now(),
      data: occupancyGridData,
    })

    // Feed occupancy grid to exploration service (for frontier detection)
    explorationService.updateOccupancyGrid(occupancyGridData)

    logger.debug({ topic, width, height }, 'Emitted OccupancyGrid to clients')
  }

  /**
   * Handle Path messages (nav_msgs/Path)
   * Used for /plan, /local_plan, navigation paths
   */
  function handlePath(msg: Record<string, unknown>, topic: string): void {
    const header = msg.header as Record<string, unknown>
    const poses = msg.poses as Array<Record<string, unknown>>

    if (!poses || !Array.isArray(poses)) {
      logger.warn({ topic, hasPoses: !!poses }, 'Path missing poses array')
      return
    }

    // Extract path points
    const points: Array<{ x: number; y: number; z: number }> = poses.map((poseStamped) => {
      const pose = poseStamped.pose as Record<string, unknown>
      const position = pose?.position as Record<string, number>
      return {
        x: position?.x || 0,
        y: position?.y || 0,
        z: position?.z || 0,
      }
    })

    logger.info({ topic, pointCount: points.length }, 'Processing navigation Path')

    io.emit('navigation_path', {
      type: 'navigation_path',
      timestamp: Date.now(),
      data: {
        topic,
        frameId: (header?.frame_id as string) || 'map',
        points,
        pointCount: points.length,
      },
    })

    logger.debug({ topic, pointCount: points.length }, 'Emitted navigation Path to clients')
  }

  /**
   * Handle Nav2 navigation feedback (distance remaining, recoveries)
   */
  function handleNavigationFeedback(msg: Record<string, unknown>): void {
    const feedback = msg.feedback as Record<string, unknown>

    if (!feedback) {
      logger.debug('Navigation feedback message has no feedback field')
      return
    }

    const distanceRemaining = feedback.distance_remaining as number | undefined
    const navigationTime = feedback.navigation_time as Record<string, number> | undefined
    const numberOfRecoveries = feedback.number_of_recoveries as number | undefined

    io.emit('navigation_feedback', {
      type: 'navigation_feedback',
      timestamp: Date.now(),
      data: {
        distanceRemaining: distanceRemaining ?? null,
        navigationTime: navigationTime ? navigationTime.sec + navigationTime.nanosec / 1e9 : null,
        numberOfRecoveries: numberOfRecoveries ?? 0,
      },
    })

    logger.debug({ distanceRemaining, numberOfRecoveries }, 'Emitted navigation feedback')
  }

  /**
   * Handle Nav2 action status (EXECUTING, SUCCEEDED, FAILED, etc.)
   */
  function handleNavigationStatus(msg: Record<string, unknown>): void {
    const statusList = msg.status_list as Array<Record<string, unknown>>

    if (!statusList || statusList.length === 0) {
      return
    }

    // Get the most recent status
    const latest = statusList[statusList.length - 1]
    const statusCode = latest?.status as number

    // Status codes: 1=ACCEPTED, 2=EXECUTING, 4=SUCCEEDED, 5=CANCELED, 6=ABORTED
    let status: string
    switch (statusCode) {
      case 1:
        status = 'pending'
        break
      case 2:
        status = 'navigating'
        break
      case 4:
        status = 'reached'
        break
      case 5:
        status = 'canceled'
        break
      case 6:
        status = 'failed'
        break
      default:
        status = 'pending'
    }

    io.emit('navigation_status', {
      type: 'navigation_status',
      timestamp: Date.now(),
      data: { status },
    })

    logger.info({ statusCode, status }, 'Navigation status update')
  }

  function handleCompressedImage(msg: Record<string, unknown>, topic?: string): void {
    const format = msg.format as string
    const data = msg.data as string // Base64 encoded

    // Generate camera ID from topic name
    const cameraId = topic ? topic.replace(/\//g, '-').slice(1) : 'robot0-camera'

    // Get or create frame state for this camera
    const now = Date.now()
    let frameState = cameraFrameState.get(cameraId)
    if (!frameState) {
      frameState = { lastFrameTime: 0, discovered: false }
      cameraFrameState.set(cameraId, frameState)
    }

    // Throttle frames to target FPS
    const elapsed = now - frameState.lastFrameTime
    if (elapsed < ROSBRIDGE_CONFIG.minFrameInterval) {
      return // Skip frame - too soon
    }
    frameState.lastFrameTime = now

    // Emit camera discovered event only ONCE per camera
    if (!frameState.discovered) {
      frameState.discovered = true
      // Generate human-readable camera name from topic
      const cameraName = topic?.includes('front')
        ? 'Go2 Front Camera (Compressed)'
        : topic?.includes('back')
          ? 'Go2 Back Camera (Compressed)'
          : topic || 'Robot Camera'
      const cameraData: DiscoveredCamera = {
        id: cameraId,
        robotId: 'robot0',
        name: cameraName,
        topic: topic || '/robot0/front_cam/rgb/compressed',
        status: 'active',
        capabilities: {
          supportsWebRTC: true,
          supportsHLS: false,
          supportsPTZ: false,
          maxResolution: { width: 640, height: 480 },
          maxFps: 30,
        },
        webrtcEnabled: false,
      }
      // Store for new clients
      discoveredCameras.set(cameraId, cameraData)
      io.emit('camera_discovered', {
        type: 'camera_discovered',
        timestamp: now,
        data: cameraData,
      })
      logger.info({ topic, format, cameraId }, 'Camera discovered (compressed)')
    }

    // Decode Base64 from ROS to binary Buffer (one-time decode)
    // This avoids the +33% overhead of re-encoding to Base64 for transport
    const jpegBuffer = Buffer.from(data, 'base64')

    io.emit('video_frame', {
      type: 'video_frame',
      timestamp: now,
      metadata: {
        cameraId,
        robotId: 'robot0',
        width: 640,
        height: 480,
        format: format || 'jpeg',
        timestamp: now,
        sequenceNumber: 0,
      },
      data: jpegBuffer, // Binary Buffer - Socket.IO handles efficiently
    })
  }

  async function handleRawImage(msg: Record<string, unknown>, topic?: string): Promise<void> {
    // sensor_msgs/Image - raw RGB image
    // Convert to JPEG for efficient transfer (raw RGB is too large for WebSocket)
    const width = msg.width as number
    const height = msg.height as number
    const encoding = msg.encoding as string // e.g., 'rgb8', 'bgr8', 'rgba8'
    const data = msg.data as string // Base64 encoded raw pixel data

    // Generate camera ID from topic name
    const cameraId = topic ? topic.replace(/\//g, '-').slice(1) : 'robot0-front-cam'
    const cameraName = topic?.includes('front') ? 'Go2 Front Camera' : topic || 'Robot Camera'

    // Get or create frame state for this camera
    const now = Date.now()
    let frameState = cameraFrameState.get(cameraId)
    if (!frameState) {
      frameState = { lastFrameTime: 0, discovered: false }
      cameraFrameState.set(cameraId, frameState)
    }

    // Throttle frames to target FPS
    const elapsed = now - frameState.lastFrameTime
    if (elapsed < ROSBRIDGE_CONFIG.minFrameInterval) {
      return // Skip frame - too soon
    }
    frameState.lastFrameTime = now

    // Emit camera discovered event only ONCE per camera
    if (!frameState.discovered) {
      frameState.discovered = true
      const cameraData: DiscoveredCamera = {
        id: cameraId,
        robotId: 'robot0',
        name: cameraName,
        topic: topic || '/robot0/front_cam/rgb',
        status: 'active',
        capabilities: {
          supportsWebRTC: true,
          supportsHLS: false,
          supportsPTZ: false,
          maxResolution: { width: width || 640, height: height || 480 },
          maxFps: 30,
        },
        webrtcEnabled: false,
      }
      // Store for new clients
      discoveredCameras.set(cameraId, cameraData)
      io.emit('camera_discovered', {
        type: 'camera_discovered',
        timestamp: now,
        data: cameraData,
      })
      logger.info({ width, height, encoding, topic, cameraId }, 'Camera discovered (raw image)')
    }

    try {
      // Decode base64 to raw buffer
      const rawBuffer = Buffer.from(data, 'base64')

      // Determine Sharp input format based on ROS encoding
      let channels: 3 | 4 = 3
      if (encoding === 'rgba8' || encoding === 'bgra8') {
        channels = 4
      }

      // Convert to JPEG using Sharp (async, non-blocking)
      // Resize to 640x360 for faster transfer while maintaining aspect ratio
      const jpegBuffer = await sharp(rawBuffer, {
        raw: {
          width: width || 640,
          height: height || 480,
          channels,
        },
      })
        .resize(640, 360, { fit: 'inside' })
        .jpeg({ quality: 70 })
        .toBuffer()

      // Send JPEG buffer directly as binary (no Base64 encoding)
      // Socket.IO handles binary data efficiently as attachment
      const framePayload = {
        type: 'video_frame',
        timestamp: now,
        metadata: {
          cameraId,
          robotId: 'robot0',
          width: 640,
          height: 360,
          format: 'jpeg',
          timestamp: now,
          sequenceNumber: 0,
        },
        data: jpegBuffer, // Binary Buffer - no .toString('base64')
      }

      // Log size comparison for verification (~25% savings over Base64)
      logger.debug(
        {
          cameraId,
          binarySize: jpegBuffer.length,
          base64WouldBe: Math.ceil(jpegBuffer.length * 1.33),
          savings: `${Math.round((1 - 1 / 1.33) * 100)}%`,
        },
        'Binary video_frame emitted'
      )
      io.emit('video_frame', framePayload)
    } catch (err) {
      logger.error(
        { error: err, cameraId, width, height, encoding },
        'Failed to convert raw image to JPEG'
      )
    }
  }

  function handleOdometry(msg: Record<string, unknown>): void {
    // ROS2 nav_msgs/Odometry has:
    // - pose.pose.position and pose.pose.orientation
    // - twist.twist.linear and twist.twist.angular
    const poseWrapper = msg.pose as Record<string, unknown>
    const twistWrapper = msg.twist as Record<string, unknown>

    const pose = poseWrapper?.pose as Record<string, unknown>
    const position = pose?.position as Record<string, number>
    const orientation = pose?.orientation as Record<string, number>

    const twist = twistWrapper?.twist as Record<string, unknown>
    const linearVel = twist?.linear as Record<string, number>
    // Note: angular velocity available via twist?.angular if needed

    if (position) {
      // Calculate heading from quaternion (in radians for navigation, degrees for display)
      let heading = 0
      if (orientation) {
        const yawRad = Math.atan2(
          2 * (orientation.w * orientation.z + orientation.x * orientation.y),
          1 - 2 * (orientation.y * orientation.y + orientation.z * orientation.z)
        )
        heading = ((yawRad * 180) / Math.PI + 360) % 360
      }

      // Calculate velocity magnitude from linear velocity vector
      const velocity = linearVel
        ? Math.sqrt((linearVel.x || 0) ** 2 + (linearVel.y || 0) ** 2 + (linearVel.z || 0) ** 2)
        : 0

      const robotPosition = {
        x: position.x || 0,
        y: position.y || 0,
        z: position.z || 0,
        heading,
      }

      const robotState = {
        type: 'robot_state',
        timestamp: Date.now(),
        data: {
          robotId: 'robot0',
          name: 'Go2 Unitree',
          position: robotPosition,
          battery: 85,
          status: velocity > 0.1 ? 'patrol' : 'online',
          velocity: Math.round(velocity * 100) / 100, // Round to 2 decimals
          lastSeen: Date.now(),
        },
      }
      io.emit('robot_state', robotState)

      // Feed robot position to exploration service
      explorationService.updateRobotPosition(robotPosition)

      logger.debug(
        {
          robotId: 'robot0',
          x: position.x.toFixed(2),
          y: position.y.toFixed(2),
          velocity: velocity.toFixed(2),
        },
        'Emitted robot_state'
      )
    }
  }

  // Public interface - use getters for reactive state properties
  const publicInterface = {
    get ws() {
      return state.ws
    },
    get isConnected() {
      return state.isConnected
    },
    get reconnectAttempts() {
      return state.reconnectAttempts
    },
    get subscribedTopics() {
      return state.subscribedTopics
    },
    connect,
    subscribe,
    unsubscribe,
    publish,
    disconnect: () => {
      stopHeartbeat()
      if (state.ws) {
        state.ws.close()
        state.ws = null
      }
    },
  }

  return publicInterface as RosbridgeClientState & {
    connect: () => void
    subscribe: (topic: string, type?: string) => void
    unsubscribe: (topic: string) => void
    publish: (topic: string, msg: unknown) => void
    disconnect: () => void
  }
}

// =============================================================================
// Socket Handler Registration
// =============================================================================

// Variable to hold the current rosbridge URL for reconnection
let currentRosbridgeUrl: string = ''

export function setCurrentRosbridgeClient(
  _client: ReturnType<typeof createRosbridgeClient>,
  url: string
): void {
  // Client stored for potential future use (e.g., reconnection with different URL)
  currentRosbridgeUrl = url
}

export function getCurrentRosbridgeUrl(): string {
  return currentRosbridgeUrl
}

export function registerRosbridgeHandlers(
  _io: SocketIOServer,
  socket: Socket,
  rosbridgeClient: ReturnType<typeof createRosbridgeClient>,
  logger: Logger
): void {
  // Handle teleop commands from web client
  socket.on('teleop_command', (data: { linear: number; angular: number }) => {
    logger.info({ data }, 'Received teleop command from web client')

    // Publish to /cmd_vel and /robot0/cmd_vel for compatibility
    const twistMsg = {
      linear: { x: data.linear, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: data.angular },
    }

    const publishFn = (
      rosbridgeClient as ReturnType<typeof createRosbridgeClient> & {
        publish: (topic: string, msg: unknown) => void
      }
    ).publish
    publishFn(DEFAULT_TOPICS.cmdVel, twistMsg)
    publishFn(DEFAULT_TOPICS.robot0CmdVel, twistMsg)

    // Echo back for UI feedback
    socket.emit('teleop_ack', {
      type: 'teleop_ack',
      timestamp: Date.now(),
      data: { linear: data.linear, angular: data.angular },
    })
  })

  // ==========================================================================
  // Nav2 Navigation (Full Stack with Path Planning and Obstacle Avoidance)
  // ==========================================================================

  // Handle goal pose from web client - sends to Nav2 via /navigate_to_pose ACTION
  // Nav2's bt_navigator accepts goals through action interface (not topic!)
  socket.on('set_goal_pose', (data: { x: number; y: number; theta: number; frameId?: string }) => {
    logger.info({ data }, 'Received goal pose - sending to Nav2 via action')

    // Convert yaw angle to quaternion
    const halfTheta = data.theta / 2
    const qz = Math.sin(halfTheta)
    const qw = Math.cos(halfTheta)

    // Check if ROSBridge is connected
    if (!rosbridgeClient.ws || rosbridgeClient.ws.readyState !== 1) {
      logger.error('Cannot send goal - ROSBridge not connected')
      socket.emit('goal_pose_error', {
        type: 'goal_pose_error',
        timestamp: Date.now(),
        data: { error: 'ROSBridge not connected' },
      })
      return
    }

    // Send goal via Nav2 action interface (NOT topic publish!)
    // ROSBridge protocol for action goals: https://github.com/RobotWebTools/rosbridge_suite/blob/ros2/ROSBRIDGE_PROTOCOL.md
    const actionGoalId = `nav_goal_${Date.now()}`
    const actionGoal = {
      op: 'send_action_goal',
      action: '/navigate_to_pose',
      action_type: 'nav2_msgs/action/NavigateToPose',
      // Note: rosbridge uses 'args' field (not 'goal') per protocol spec
      args: {
        pose: {
          header: {
            frame_id: data.frameId || 'map',
            stamp: { sec: 0, nanosec: 0 },
          },
          pose: {
            position: { x: data.x, y: data.y, z: 0 },
            orientation: { x: 0, y: 0, z: qz, w: qw },
          },
        },
      },
      feedback: true,
      id: actionGoalId,
    }

    rosbridgeClient.ws.send(JSON.stringify(actionGoal))
    logger.info(
      { actionGoalId, goal: { x: data.x, y: data.y, theta: data.theta } },
      'Goal sent to Nav2 via action'
    )

    // Acknowledge to client
    socket.emit('goal_pose_ack', {
      type: 'goal_pose_ack',
      timestamp: Date.now(),
      data: { x: data.x, y: data.y, theta: data.theta, actionId: actionGoalId },
    })
  })

  // Handle cancel navigation - calls Nav2 cancel service and stops velocity
  socket.on('stop_navigation', () => {
    logger.info('Cancelling Nav2 navigation')

    // Stop robot by publishing zero velocity
    const publishFn = (
      rosbridgeClient as ReturnType<typeof createRosbridgeClient> & {
        publish: (topic: string, msg: unknown) => void
      }
    ).publish
    publishFn(DEFAULT_TOPICS.cmdVel, {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })
    publishFn(DEFAULT_TOPICS.robot0CmdVel, {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })

    // Call Nav2 cancel action service via ROSBridge
    if (rosbridgeClient.ws && rosbridgeClient.ws.readyState === 1) {
      const cancelMsg = {
        op: 'call_service',
        service: '/navigate_to_pose/_action/cancel_goal',
        id: 'cancel_nav_' + Date.now(),
        args: {},
      }
      rosbridgeClient.ws.send(JSON.stringify(cancelMsg))
      logger.info('Sent Nav2 cancel action request')
    }
  })

  // Alias for cancel_navigation (same functionality)
  socket.on('cancel_navigation', () => {
    logger.info('Cancel navigation requested')

    const publishFn = (
      rosbridgeClient as ReturnType<typeof createRosbridgeClient> & {
        publish: (topic: string, msg: unknown) => void
      }
    ).publish
    publishFn(DEFAULT_TOPICS.cmdVel, {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })
    publishFn(DEFAULT_TOPICS.robot0CmdVel, {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })

    if (rosbridgeClient.ws && rosbridgeClient.ws.readyState === 1) {
      const cancelMsg = {
        op: 'call_service',
        service: '/navigate_to_pose/_action/cancel_goal',
        id: 'cancel_nav_' + Date.now(),
        args: {},
      }
      rosbridgeClient.ws.send(JSON.stringify(cancelMsg))
    }

    // Emit status update to client
    socket.emit('navigation_status', {
      type: 'navigation_status',
      timestamp: Date.now(),
      data: { status: 'canceled' },
    })
  })

  // ==========================================================================
  // Autonomous Exploration (Frontier-based)
  // ==========================================================================

  // Get exploration service instance
  const explorationService = getExplorationService(_io, logger)

  // Handle start exploration command from web client
  socket.on('start_exploration', (data: { maxWaypoints?: number }) => {
    logger.info({ data }, 'Starting autonomous exploration')

    // Start the exploration service with the full loop
    explorationService
      .start({
        maxWaypoints: data.maxWaypoints || 100,
      })
      .catch((error) => {
        logger.error({ error }, 'Failed to start exploration')
      })

    // Acknowledge to requesting client
    socket.emit('exploration_started', {
      type: 'exploration_started',
      timestamp: Date.now(),
      data: { maxWaypoints: data.maxWaypoints || 100 },
    })
  })

  // Handle stop exploration command
  socket.on('stop_exploration', () => {
    logger.info('Stopping autonomous exploration')

    // Stop exploration service (handles navigation cancellation internally)
    explorationService.stop()

    socket.emit('exploration_stopped', {
      type: 'exploration_stopped',
      timestamp: Date.now(),
    })
  })

  // Handle pause exploration
  socket.on('pause_exploration', () => {
    logger.info('Pausing autonomous exploration')
    explorationService.pause()
  })

  // Handle resume exploration
  socket.on('resume_exploration', () => {
    logger.info('Resuming autonomous exploration')
    explorationService.resume()
  })

  // Handle exploration waypoint reached - client sends this when goal is reached
  socket.on(
    'exploration_waypoint_reached',
    (data: { waypointIndex: number; totalWaypoints: number }) => {
      logger.info({ data }, 'Exploration waypoint reached')

      // Emit progress update to all clients
      _io.emit('exploration_status', {
        type: 'exploration_status',
        timestamp: Date.now(),
        data: {
          status: 'exploring',
          currentWaypoint: data.waypointIndex,
          totalWaypoints: data.totalWaypoints,
        },
      })
    }
  )

  // Handle exploration complete
  socket.on('exploration_complete', (data: { exploredPercent: number; totalWaypoints: number }) => {
    logger.info({ data }, 'Exploration complete')

    // Emit completion status to all clients
    _io.emit('exploration_status', {
      type: 'exploration_status',
      timestamp: Date.now(),
      data: {
        status: 'complete',
        currentWaypoint: data.totalWaypoints,
        totalWaypoints: data.totalWaypoints,
        exploredPercent: data.exploredPercent,
      },
    })
  })

  // Handle exploration error
  socket.on('exploration_error', (data: { error: string }) => {
    logger.error({ error: data.error }, 'Exploration error')

    // Stop robot
    const publishFn = (
      rosbridgeClient as ReturnType<typeof createRosbridgeClient> & {
        publish: (topic: string, msg: unknown) => void
      }
    ).publish
    publishFn(DEFAULT_TOPICS.cmdVel, {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })
    publishFn(DEFAULT_TOPICS.robot0CmdVel, {
      linear: { x: 0, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: 0 },
    })

    // Emit error status to all clients
    _io.emit('exploration_status', {
      type: 'exploration_status',
      timestamp: Date.now(),
      data: {
        status: 'error',
        error: data.error,
      },
    })
  })

  // Handle custom topic subscription
  socket.on('ros_subscribe', (data: { topic: string; type?: string }) => {
    logger.info({ data }, 'Client requesting topic subscription')
    ;(
      rosbridgeClient as ReturnType<typeof createRosbridgeClient> & {
        subscribe: (topic: string, type?: string) => void
      }
    ).subscribe(data.topic, data.type)
  })

  // Handle custom topic unsubscription
  socket.on('ros_unsubscribe', (data: { topic: string }) => {
    logger.info({ data }, 'Client requesting topic unsubscription')
    ;(
      rosbridgeClient as ReturnType<typeof createRosbridgeClient> & {
        unsubscribe: (topic: string) => void
      }
    ).unsubscribe(data.topic)
  })

  // Handle request for topics list
  socket.on('request_ros_topics', () => {
    logger.info({ socketId: socket.id }, 'Client requesting ROS topics list')
    if (rosbridgeClient.isConnected && rosbridgeClient.ws && rosbridgeClient.ws.readyState === 1) {
      // Try rosapi first, but it will fallback automatically after timeout
      const startedAt = Date.now()
      const callService = {
        op: 'call_service',
        service: '/rosapi/topics',
        id: 'get_topics_' + startedAt,
      }
      rosbridgeClient.ws.send(JSON.stringify(callService))

      // Set a timeout to emit fallback if no response
      setTimeout(() => {
        const lastTopicsEmittedAt = rosbridgeClient.lastTopicsEmittedAt

        // If rosapi response already arrived and emitted, don't spam fallback.
        if (lastTopicsEmittedAt > startedAt) {
          return
        }

        // Build and emit fallback topic list directly to requesting socket
        const topicList = Object.values(DEFAULT_TOPICS).map((topic) => ({
          name: topic,
          type: inferTopicType(topic),
          messageRate: null,
          lastMessage: null,
        }))

        // Add subscribed topics
        rosbridgeClient.subscribedTopics.forEach((topic) => {
          if (!topicList.find((t) => t.name === topic)) {
            topicList.push({
              name: topic,
              type: inferTopicType(topic),
              messageRate: null,
              lastMessage: null,
            })
          }
        })

        socket.emit('ros_topics', {
          type: 'ros_topics',
          timestamp: Date.now(),
          data: {
            topics: topicList,
            count: topicList.length,
            source: 'fallback',
          },
        })
        logger.info({ count: topicList.length }, 'Emitted fallback topic list to requesting client')
      }, 3500) // Slightly longer than the main timeout to avoid race
    } else {
      // ROSBridge not connected - emit fallback based on DEFAULT_TOPICS
      const topicList = Object.values(DEFAULT_TOPICS).map((topic) => ({
        name: topic,
        type: inferTopicType(topic),
        messageRate: null,
        lastMessage: null,
      }))

      socket.emit('ros_topics', {
        type: 'ros_topics',
        timestamp: Date.now(),
        data: {
          topics: topicList,
          count: topicList.length,
          source: 'default',
        },
      })
      logger.info(
        { count: topicList.length },
        'ROSBridge not connected - emitted default topic list'
      )
    }
  })

  // ==========================================================================
  // Vision LLM Handlers
  // ==========================================================================

  // Initialize Vision LLM module with io and logger references
  initVisionLlm(_io, logger)

  // Create helper functions for Vision LLM handlers
  const callService = (service: string, args: unknown, id: string): void => {
    logger.info(
      {
        service,
        id,
        wsReadyState: rosbridgeClient.ws?.readyState,
        isConnected: rosbridgeClient.isConnected,
      },
      '>>> callService invoked'
    )
    if (!rosbridgeClient.ws || rosbridgeClient.ws.readyState !== 1) {
      logger.warn(
        { service, wsReadyState: rosbridgeClient.ws?.readyState },
        'Cannot call service - ROSBridge not connected'
      )
      return
    }
    const serviceCall = {
      op: 'call_service',
      service,
      id,
      args,
    }
    const payload = JSON.stringify(serviceCall)
    logger.info(
      { service, id, payloadLength: payload.length, payload },
      '>>> Sending service call to ROSBridge (FULL PAYLOAD)'
    )
    rosbridgeClient.ws.send(payload)
    logger.info({ service, id }, 'Sent service call to ROSBridge')
  }

  const subscribeFn = (topic: string, type?: string): void => {
    // eslint-disable-next-line no-extra-semi -- disambiguation semicolon for IIFE-like call
    ;(
      rosbridgeClient as ReturnType<typeof createRosbridgeClient> & {
        subscribe: (topic: string, type?: string) => void
      }
    ).subscribe(topic, type)
  }

  // Register Vision LLM socket handlers
  registerVisionLlmHandlers(_io, socket, callService, subscribeFn, logger)

  // Handle disconnect - cleanup Vision LLM pending requests
  socket.on('disconnect', () => {
    cleanupVisionLlmRequests(socket.id)
  })

  // Send current rosbridge status and URL on connect
  socket.emit('rosbridge_status', {
    type: 'rosbridge_status',
    timestamp: Date.now(),
    data: {
      connected: rosbridgeClient.isConnected,
      url: currentRosbridgeUrl,
    },
  })
}
