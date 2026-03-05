/**
 * Exploration Service
 *
 * Orchestrates autonomous frontier-based exploration.
 * Manages the exploration loop: detect frontiers → navigate → repeat.
 *
 * Features:
 * - State machine: idle → exploring → paused → complete → error
 * - Frontier detection from OccupancyGrid
 * - Automatic goal sequencing via Nav2
 * - Timeout and error recovery
 * - Progress tracking and broadcasting
 */

import type { Server as SocketIOServer } from 'socket.io'
import type { Logger } from 'pino'
import WebSocket from 'ws'
import {
  analyzeOccupancyGrid,
  type OccupancyGridData,
  type Frontier,
  type ExplorationAnalysis,
} from '../utils/frontier-detection.js'

// =============================================================================
// Types
// =============================================================================

export type ExplorationStatus = 'idle' | 'exploring' | 'paused' | 'complete' | 'error'

export interface RobotPosition {
  x: number
  y: number
  z: number
  heading: number
}

export interface ExplorationConfig {
  /** Maximum waypoints before stopping */
  maxWaypoints: number
  /** Timeout per navigation goal in ms */
  navigationTimeout: number
  /** Minimum explored percentage to consider complete */
  completionThreshold: number
  /** Delay between goals in ms */
  goalDelay: number
  /** Number of consecutive failures before stopping */
  maxConsecutiveFailures: number
}

interface NavigationResult {
  status: 'reached' | 'failed' | 'canceled' | 'timeout'
  actionId?: string
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_CONFIG: ExplorationConfig = {
  maxWaypoints: 100,
  navigationTimeout: 120_000, // 2 minutes per goal
  completionThreshold: 90, // 90% explored = complete
  goalDelay: 1000, // 1 second between goals
  maxConsecutiveFailures: 3,
}

// =============================================================================
// Exploration Service Class
// =============================================================================

export class ExplorationService {
  private io: SocketIOServer
  private logger: Logger
  private rosbridgeWs: WebSocket | null = null

  // State
  private status: ExplorationStatus = 'idle'
  private config: ExplorationConfig = DEFAULT_CONFIG
  private waypointCount = 0
  private exploredPercent = 0
  private currentGoalId: string | null = null
  private consecutiveFailures = 0

  // Latest data from ROS
  private latestOccupancyGrid: OccupancyGridData | null = null
  private latestRobotPosition: RobotPosition = { x: 0, y: 0, z: 0, heading: 0 }

  // Exploration loop control
  private explorationLoopActive = false
  private navigationResultPromise: {
    resolve: (result: NavigationResult) => void
    reject: (error: Error) => void
  } | null = null
  private navigationTimeoutId: NodeJS.Timeout | null = null

  // Current frontiers for visualization
  private currentFrontiers: Frontier[] = []
  private currentTarget: Frontier | null = null

  constructor(io: SocketIOServer, logger: Logger) {
    this.io = io
    this.logger = logger.child({ service: 'exploration' })
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Set the ROSBridge WebSocket connection
   */
  setRosbridgeConnection(ws: WebSocket | null): void {
    this.rosbridgeWs = ws
  }

  /**
   * Update the latest OccupancyGrid data
   */
  updateOccupancyGrid(data: OccupancyGridData): void {
    this.latestOccupancyGrid = data
    this.logger.debug(
      { width: data.width, height: data.height, topic: data.topic },
      'Updated occupancy grid'
    )
  }

  /**
   * Update the robot's current position
   */
  updateRobotPosition(position: RobotPosition): void {
    this.latestRobotPosition = position
  }

  /**
   * Handle navigation result from Nav2
   */
  handleNavigationResult(status: string, actionId?: string): void {
    this.logger.info(
      { status, actionId, currentGoalId: this.currentGoalId },
      'Navigation result received'
    )

    // Only process if we're waiting for this result
    if (this.navigationResultPromise && (!actionId || actionId === this.currentGoalId)) {
      // Clear timeout
      if (this.navigationTimeoutId) {
        clearTimeout(this.navigationTimeoutId)
        this.navigationTimeoutId = null
      }

      const result: NavigationResult = {
        status: status as NavigationResult['status'],
        actionId,
      }
      this.navigationResultPromise.resolve(result)
      this.navigationResultPromise = null
    }
  }

  /**
   * Start autonomous exploration
   */
  async start(config: Partial<ExplorationConfig> = {}): Promise<void> {
    if (this.status === 'exploring') {
      this.logger.warn('Exploration already in progress')
      return
    }

    this.config = { ...DEFAULT_CONFIG, ...config }
    this.status = 'exploring'
    this.waypointCount = 0
    this.exploredPercent = 0
    this.consecutiveFailures = 0
    this.explorationLoopActive = true

    this.logger.info({ config: this.config }, 'Starting exploration')
    this.broadcastStatus()

    // Start exploration loop
    this.runExplorationLoop().catch((error) => {
      this.logger.error({ error }, 'Exploration loop error')
      this.setError('Exploration loop crashed: ' + error.message)
    })
  }

  /**
   * Stop exploration
   */
  stop(): void {
    this.logger.info('Stopping exploration')
    this.explorationLoopActive = false
    this.status = 'idle'

    // Cancel any pending navigation
    this.cancelCurrentNavigation()

    // Resolve any pending promise
    if (this.navigationResultPromise) {
      this.navigationResultPromise.resolve({ status: 'canceled' })
      this.navigationResultPromise = null
    }

    // MEMORY FIX: Release large data structures
    this.latestOccupancyGrid = null
    this.currentFrontiers = []
    this.currentTarget = null

    this.broadcastStatus()
  }

  /**
   * Pause exploration
   */
  pause(): void {
    if (this.status !== 'exploring') return

    this.logger.info('Pausing exploration')
    this.status = 'paused'
    this.cancelCurrentNavigation()
    this.broadcastStatus()
  }

  /**
   * Resume exploration
   */
  resume(): void {
    if (this.status !== 'paused') return

    this.logger.info('Resuming exploration')
    this.status = 'exploring'
    this.explorationLoopActive = true
    this.broadcastStatus()

    // Restart loop
    this.runExplorationLoop().catch((error) => {
      this.logger.error({ error }, 'Exploration loop error on resume')
      this.setError('Exploration loop crashed: ' + error.message)
    })
  }

  /**
   * Get current status
   */
  getStatus(): {
    status: ExplorationStatus
    waypointCount: number
    exploredPercent: number
    frontiers: Frontier[]
    currentTarget: Frontier | null
  } {
    return {
      status: this.status,
      waypointCount: this.waypointCount,
      exploredPercent: this.exploredPercent,
      frontiers: this.currentFrontiers,
      currentTarget: this.currentTarget,
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Main exploration loop
   */
  private async runExplorationLoop(): Promise<void> {
    this.logger.info('Exploration loop started')

    while (this.explorationLoopActive && this.status === 'exploring') {
      // Check max waypoints
      if (this.waypointCount >= this.config.maxWaypoints) {
        this.logger.info({ waypointCount: this.waypointCount }, 'Max waypoints reached')
        this.complete()
        break
      }

      // Wait for map data
      if (!this.latestOccupancyGrid) {
        this.logger.warn('No occupancy grid available, waiting...')
        await this.sleep(2000)
        continue
      }

      // Analyze map for frontiers
      const analysis = this.analyzeMap()
      if (!analysis) {
        this.logger.warn('Map analysis failed, retrying...')
        await this.sleep(2000)
        continue
      }

      this.currentFrontiers = analysis.frontiers
      this.exploredPercent = analysis.exploredPercent
      this.broadcastProgress()

      // Check completion
      if (analysis.exploredPercent >= this.config.completionThreshold) {
        this.logger.info(
          { exploredPercent: analysis.exploredPercent },
          'Exploration complete - threshold reached'
        )
        this.complete()
        break
      }

      // Check if we have frontiers
      if (analysis.frontiers.length === 0 || !analysis.bestTarget) {
        this.logger.info('No frontiers found - exploration complete')
        this.complete()
        break
      }

      // Navigate to best frontier
      this.currentTarget = analysis.bestTarget
      this.broadcastFrontierSelected(analysis.bestTarget)

      this.logger.info(
        {
          target: { x: analysis.bestTarget.x, y: analysis.bestTarget.y },
          waypointCount: this.waypointCount,
        },
        'Navigating to frontier'
      )

      const result = await this.navigateToFrontier(analysis.bestTarget)

      if (result.status === 'reached') {
        this.waypointCount++
        this.consecutiveFailures = 0
        this.logger.info({ waypointCount: this.waypointCount }, 'Waypoint reached')
      } else if (result.status === 'canceled') {
        this.logger.info('Navigation canceled, stopping exploration')
        break
      } else {
        // Failed or timeout
        this.consecutiveFailures++
        this.logger.warn(
          { status: result.status, consecutiveFailures: this.consecutiveFailures },
          'Navigation failed'
        )

        if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
          this.logger.error('Too many consecutive failures, stopping exploration')
          this.setError('Too many navigation failures')
          break
        }
      }

      this.currentTarget = null
      this.broadcastProgress()

      // Small delay between goals
      await this.sleep(this.config.goalDelay)
    }

    this.logger.info('Exploration loop ended')
  }

  /**
   * Analyze the map for frontiers
   */
  private analyzeMap(): ExplorationAnalysis | null {
    if (!this.latestOccupancyGrid) return null

    return analyzeOccupancyGrid(
      this.latestOccupancyGrid,
      this.latestRobotPosition.x,
      this.latestRobotPosition.y
    )
  }

  /**
   * Navigate to a frontier point
   */
  private async navigateToFrontier(frontier: Frontier): Promise<NavigationResult> {
    if (!this.rosbridgeWs || this.rosbridgeWs.readyState !== WebSocket.OPEN) {
      this.logger.error('ROSBridge not connected')
      return { status: 'failed' }
    }

    // Calculate heading towards frontier
    const dx = frontier.x - this.latestRobotPosition.x
    const dy = frontier.y - this.latestRobotPosition.y
    const theta = Math.atan2(dy, dx)

    // Convert yaw to quaternion
    const halfTheta = theta / 2
    const qz = Math.sin(halfTheta)
    const qw = Math.cos(halfTheta)

    // Send goal via Nav2 action
    this.currentGoalId = `exploration_goal_${Date.now()}`
    const actionGoal = {
      op: 'send_action_goal',
      action: '/navigate_to_pose',
      action_type: 'nav2_msgs/action/NavigateToPose',
      args: {
        pose: {
          header: {
            frame_id: 'map',
            stamp: { sec: 0, nanosec: 0 },
          },
          pose: {
            position: { x: frontier.x, y: frontier.y, z: 0 },
            orientation: { x: 0, y: 0, z: qz, w: qw },
          },
        },
      },
      feedback: true,
      id: this.currentGoalId,
    }

    this.rosbridgeWs.send(JSON.stringify(actionGoal))
    this.logger.info(
      { goalId: this.currentGoalId, x: frontier.x, y: frontier.y },
      'Sent navigation goal'
    )

    // Wait for result with timeout
    return this.waitForNavigationResult()
  }

  /**
   * Wait for navigation result with timeout
   */
  private waitForNavigationResult(): Promise<NavigationResult> {
    return new Promise((resolve) => {
      this.navigationResultPromise = { resolve, reject: () => {} }

      // Set timeout
      this.navigationTimeoutId = setTimeout(() => {
        this.logger.warn({ goalId: this.currentGoalId }, 'Navigation timeout')
        this.cancelCurrentNavigation()

        if (this.navigationResultPromise) {
          this.navigationResultPromise.resolve({ status: 'timeout' })
          this.navigationResultPromise = null
        }
      }, this.config.navigationTimeout)
    })
  }

  /**
   * Cancel current navigation
   */
  private cancelCurrentNavigation(): void {
    if (!this.rosbridgeWs || this.rosbridgeWs.readyState !== WebSocket.OPEN) return

    // Send cancel to Nav2
    const cancelMsg = {
      op: 'call_service',
      service: '/navigate_to_pose/_action/cancel_goal',
      id: 'cancel_exploration_' + Date.now(),
      args: {},
    }
    this.rosbridgeWs.send(JSON.stringify(cancelMsg))

    // Stop robot
    const stopMsg = {
      op: 'publish',
      topic: '/cmd_vel',
      msg: {
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      },
    }
    this.rosbridgeWs.send(JSON.stringify(stopMsg))

    // Also stop robot0
    const stopMsg2 = {
      op: 'publish',
      topic: '/robot0/cmd_vel',
      msg: {
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      },
    }
    this.rosbridgeWs.send(JSON.stringify(stopMsg2))

    this.currentGoalId = null
  }

  /**
   * Mark exploration as complete
   */
  private complete(): void {
    this.status = 'complete'
    this.explorationLoopActive = false

    // MEMORY FIX: Release large data structures
    this.latestOccupancyGrid = null
    this.currentFrontiers = []
    this.currentTarget = null

    this.logger.info(
      { waypointCount: this.waypointCount, exploredPercent: this.exploredPercent },
      'Exploration complete'
    )
    this.broadcastStatus()
  }

  /**
   * Set error state
   */
  private setError(message: string): void {
    this.status = 'error'
    this.explorationLoopActive = false
    this.cancelCurrentNavigation()
    this.logger.error({ message }, 'Exploration error')
    this.broadcastError(message)
  }

  // ===========================================================================
  // Broadcasting
  // ===========================================================================

  private broadcastStatus(): void {
    this.io.emit('exploration_status', {
      type: 'exploration_status',
      timestamp: Date.now(),
      data: {
        status: this.status,
        currentWaypoint: this.waypointCount,
        totalWaypoints: this.config.maxWaypoints,
        exploredPercent: Math.round(this.exploredPercent * 10) / 10,
      },
    })
  }

  private broadcastProgress(): void {
    this.io.emit('exploration_progress', {
      type: 'exploration_progress',
      timestamp: Date.now(),
      data: {
        waypointCount: this.waypointCount,
        exploredPercent: Math.round(this.exploredPercent * 10) / 10,
        frontierCount: this.currentFrontiers.length,
        frontiers: this.currentFrontiers.slice(0, 10), // Top 10 frontiers for visualization
      },
    })
  }

  private broadcastFrontierSelected(frontier: Frontier): void {
    this.io.emit('exploration_frontier_selected', {
      type: 'exploration_frontier_selected',
      timestamp: Date.now(),
      data: {
        target: frontier,
        waypointCount: this.waypointCount,
      },
    })
  }

  private broadcastError(message: string): void {
    this.io.emit('exploration_status', {
      type: 'exploration_status',
      timestamp: Date.now(),
      data: {
        status: 'error',
        error: message,
        currentWaypoint: this.waypointCount,
        totalWaypoints: this.config.maxWaypoints,
        exploredPercent: Math.round(this.exploredPercent * 10) / 10,
      },
    })
  }

  // ===========================================================================
  // Utilities
  // ===========================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let explorationServiceInstance: ExplorationService | null = null

export function getExplorationService(io: SocketIOServer, logger: Logger): ExplorationService {
  if (!explorationServiceInstance) {
    explorationServiceInstance = new ExplorationService(io, logger)
  }
  return explorationServiceInstance
}
