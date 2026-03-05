/**
 * CleanupManager - Centralized session and resource cleanup
 *
 * Tracks all client sessions and their associated resources:
 * - ROS topic subscriptions
 * - Camera subscriptions
 * - WebRTC sessions
 * - Active timers
 *
 * Ensures proper cleanup on client disconnect to prevent memory leaks.
 */

import type { Logger } from 'pino'

export interface ClientSession {
  readonly socketId: string
  readonly connectedAt: number
  readonly subscribedTopics: Set<string>
  readonly cameraSubscriptions: Set<string>
  readonly webrtcSessions: Set<string>
  readonly timers: Set<NodeJS.Timeout>
  readonly intervals: Set<NodeJS.Timeout>
}

interface CleanupCallbacks {
  onTopicUnsubscribe?: (socketId: string, topic: string) => void
  onCameraUnsubscribe?: (socketId: string, cameraId: string) => void
  onWebRTCCleanup?: (socketId: string, sessionId: string) => void
}

export class CleanupManager {
  private readonly sessions = new Map<string, ClientSession>()
  private readonly callbacks: CleanupCallbacks
  private readonly logger: Logger
  private cleanupIntervalId: NodeJS.Timeout | null = null

  constructor(logger: Logger, callbacks: CleanupCallbacks = {}) {
    this.logger = logger
    this.callbacks = callbacks
  }

  /**
   * Start periodic cleanup of stale sessions (every 5 minutes)
   */
  startPeriodicCleanup(intervalMs: number = 5 * 60 * 1000): void {
    if (this.cleanupIntervalId) {
      return
    }

    this.cleanupIntervalId = setInterval(() => {
      this.cleanupStaleSessions()
    }, intervalMs)

    this.logger.info({ intervalMs }, 'Started periodic session cleanup')
  }

  /**
   * Stop periodic cleanup
   */
  stopPeriodicCleanup(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId)
      this.cleanupIntervalId = null
      this.logger.info('Stopped periodic session cleanup')
    }
  }

  /**
   * Register a new client session
   */
  registerSession(socketId: string): ClientSession {
    const session: ClientSession = {
      socketId,
      connectedAt: Date.now(),
      subscribedTopics: new Set(),
      cameraSubscriptions: new Set(),
      webrtcSessions: new Set(),
      timers: new Set(),
      intervals: new Set(),
    }

    this.sessions.set(socketId, session)
    this.logger.debug({ socketId }, 'Session registered')

    return session
  }

  /**
   * Get session by socket ID
   */
  getSession(socketId: string): ClientSession | undefined {
    return this.sessions.get(socketId)
  }

  /**
   * Track a topic subscription
   */
  trackTopicSubscription(socketId: string, topic: string): void {
    const session = this.sessions.get(socketId)
    if (session) {
      session.subscribedTopics.add(topic)
      this.logger.debug({ socketId, topic }, 'Topic subscription tracked')
    }
  }

  /**
   * Untrack a topic subscription
   */
  untrackTopicSubscription(socketId: string, topic: string): void {
    const session = this.sessions.get(socketId)
    if (session) {
      session.subscribedTopics.delete(topic)
      this.logger.debug({ socketId, topic }, 'Topic subscription untracked')
    }
  }

  /**
   * Track a camera subscription
   */
  trackCameraSubscription(socketId: string, cameraId: string): void {
    const session = this.sessions.get(socketId)
    if (session) {
      session.cameraSubscriptions.add(cameraId)
      this.logger.debug({ socketId, cameraId }, 'Camera subscription tracked')
    }
  }

  /**
   * Track a WebRTC session
   */
  trackWebRTCSession(socketId: string, sessionId: string): void {
    const session = this.sessions.get(socketId)
    if (session) {
      session.webrtcSessions.add(sessionId)
      this.logger.debug({ socketId, sessionId }, 'WebRTC session tracked')
    }
  }

  /**
   * Track a timer for cleanup
   */
  trackTimer(socketId: string, timer: NodeJS.Timeout): void {
    const session = this.sessions.get(socketId)
    if (session) {
      session.timers.add(timer)
    }
  }

  /**
   * Track an interval for cleanup
   */
  trackInterval(socketId: string, interval: NodeJS.Timeout): void {
    const session = this.sessions.get(socketId)
    if (session) {
      session.intervals.add(interval)
    }
  }

  /**
   * Untrack a timer
   */
  untrackTimer(socketId: string, timer: NodeJS.Timeout): void {
    const session = this.sessions.get(socketId)
    if (session) {
      session.timers.delete(timer)
    }
  }

  /**
   * Main cleanup method - cleans up all resources for a session
   */
  cleanupSession(socketId: string): void {
    const session = this.sessions.get(socketId)
    if (!session) {
      this.logger.debug({ socketId }, 'No session found for cleanup')
      return
    }

    const stats = {
      topics: session.subscribedTopics.size,
      cameras: session.cameraSubscriptions.size,
      webrtc: session.webrtcSessions.size,
      timers: session.timers.size,
      intervals: session.intervals.size,
    }

    this.logger.info({ socketId, stats }, 'Cleaning up session')

    // Clear all timers
    for (const timer of session.timers) {
      clearTimeout(timer)
    }
    session.timers.clear()

    // Clear all intervals
    for (const interval of session.intervals) {
      clearInterval(interval)
    }
    session.intervals.clear()

    // Notify about topic unsubscriptions
    if (this.callbacks.onTopicUnsubscribe) {
      for (const topic of session.subscribedTopics) {
        this.callbacks.onTopicUnsubscribe(socketId, topic)
      }
    }
    session.subscribedTopics.clear()

    // Notify about camera unsubscriptions
    if (this.callbacks.onCameraUnsubscribe) {
      for (const cameraId of session.cameraSubscriptions) {
        this.callbacks.onCameraUnsubscribe(socketId, cameraId)
      }
    }
    session.cameraSubscriptions.clear()

    // Notify about WebRTC cleanup
    if (this.callbacks.onWebRTCCleanup) {
      for (const sessionId of session.webrtcSessions) {
        this.callbacks.onWebRTCCleanup(socketId, sessionId)
      }
    }
    session.webrtcSessions.clear()

    // Remove session
    this.sessions.delete(socketId)
    this.logger.info({ socketId }, 'Session cleanup complete')
  }

  /**
   * Clean up stale sessions (sessions older than maxAge without activity)
   */
  private cleanupStaleSessions(maxAgeMs: number = 30 * 60 * 1000): void {
    const now = Date.now()
    let cleaned = 0

    for (const [socketId, session] of this.sessions) {
      const age = now - session.connectedAt
      // Only clean up if session is old AND has no active subscriptions
      const isEmpty =
        session.subscribedTopics.size === 0 &&
        session.cameraSubscriptions.size === 0 &&
        session.webrtcSessions.size === 0

      if (age > maxAgeMs && isEmpty) {
        this.cleanupSession(socketId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      this.logger.info({ cleaned }, 'Cleaned up stale sessions')
    }
  }

  /**
   * Get current session count
   */
  getSessionCount(): number {
    return this.sessions.size
  }

  /**
   * Get all active sessions (for debugging)
   */
  getAllSessions(): Map<string, ClientSession> {
    return new Map(this.sessions)
  }

  /**
   * Shutdown - cleanup all sessions and stop periodic cleanup
   */
  shutdown(): void {
    this.stopPeriodicCleanup()

    for (const socketId of this.sessions.keys()) {
      this.cleanupSession(socketId)
    }

    this.logger.info('CleanupManager shutdown complete')
  }
}

// Singleton instance for global access
let cleanupManagerInstance: CleanupManager | null = null

export function createCleanupManager(
  logger: Logger,
  callbacks: CleanupCallbacks = {}
): CleanupManager {
  cleanupManagerInstance = new CleanupManager(logger, callbacks)
  return cleanupManagerInstance
}

export function getCleanupManager(): CleanupManager | null {
  return cleanupManagerInstance
}
