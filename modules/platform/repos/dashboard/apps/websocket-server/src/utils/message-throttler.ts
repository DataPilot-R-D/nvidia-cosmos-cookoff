/**
 * MessageThrottler - Rate limiting and batching for high-frequency messages
 *
 * Prevents message flooding by:
 * - Throttling messages per topic/channel
 * - Batching multiple messages into single emissions
 * - Dropping old messages when buffer is full
 *
 * Inspired by Foxglove's approach to handling high-frequency ROS topics.
 */

import type { Logger } from 'pino'

export interface ThrottleConfig {
  intervalMs: number // Minimum interval between emissions
  maxBatchSize: number // Maximum messages per batch (0 = single message, no batching)
  dropOld: boolean // If true, drop old messages; if false, queue them
}

interface ChannelState {
  lastEmitTime: number
  buffer: unknown[]
  timer: NodeJS.Timeout | null
}

type EmitCallback = (channel: string, messages: unknown[]) => void

const DEFAULT_CONFIG: ThrottleConfig = {
  intervalMs: 100,
  maxBatchSize: 1,
  dropOld: true,
}

// Preset configurations for common message types
export const THROTTLE_PRESETS: Record<string, ThrottleConfig> = {
  // Robot state updates - batch every 100ms
  robot_state: {
    intervalMs: 100,
    maxBatchSize: 1, // Only latest state matters
    dropOld: true,
  },
  // LIDAR scans - batch every 50ms, keep some history
  lidar_scan: {
    intervalMs: 50,
    maxBatchSize: 3,
    dropOld: true,
  },
  // Occupancy grid - less frequent, larger batches allowed
  occupancy_grid: {
    intervalMs: 200,
    maxBatchSize: 1,
    dropOld: true,
  },
  // IMU data - high frequency, only latest matters
  imu_data: {
    intervalMs: 50,
    maxBatchSize: 1,
    dropOld: true,
  },
  // Navigation path - queue all updates
  navigation_path: {
    intervalMs: 100,
    maxBatchSize: 5,
    dropOld: false,
  },
}

export class MessageThrottler {
  private readonly channels = new Map<string, ChannelState>()
  private readonly configs = new Map<string, ThrottleConfig>()
  private readonly emitCallback: EmitCallback
  private readonly logger: Logger
  private isShutdown = false

  constructor(logger: Logger, emitCallback: EmitCallback) {
    this.logger = logger
    this.emitCallback = emitCallback

    // Apply preset configurations
    for (const [channel, config] of Object.entries(THROTTLE_PRESETS)) {
      this.configs.set(channel, config)
    }
  }

  /**
   * Set configuration for a specific channel
   */
  setConfig(channel: string, config: Partial<ThrottleConfig>): void {
    const existing = this.configs.get(channel) ?? DEFAULT_CONFIG
    this.configs.set(channel, { ...existing, ...config })
  }

  /**
   * Get configuration for a channel (returns default if not set)
   */
  getConfig(channel: string): ThrottleConfig {
    return this.configs.get(channel) ?? DEFAULT_CONFIG
  }

  /**
   * Throttle a message for a specific channel
   * Returns true if message was accepted, false if dropped
   */
  throttle(channel: string, message: unknown): boolean {
    if (this.isShutdown) {
      return false
    }

    const config = this.getConfig(channel)
    let state = this.channels.get(channel)

    // Initialize channel state if needed
    if (!state) {
      state = {
        lastEmitTime: 0,
        buffer: [],
        timer: null,
      }
      this.channels.set(channel, state)
    }

    const now = Date.now()
    const timeSinceLastEmit = now - state.lastEmitTime

    // If enough time has passed, emit immediately
    if (timeSinceLastEmit >= config.intervalMs && state.buffer.length === 0) {
      state.lastEmitTime = now
      this.emitCallback(channel, [message])
      return true
    }

    // Otherwise, buffer the message
    if (config.dropOld && state.buffer.length >= config.maxBatchSize) {
      // Drop oldest message(s) to make room
      state.buffer.shift()
    }

    if (state.buffer.length < config.maxBatchSize || !config.dropOld) {
      state.buffer.push(message)
    }

    // Schedule flush if not already scheduled
    if (!state.timer) {
      const delay = Math.max(0, config.intervalMs - timeSinceLastEmit)
      state.timer = setTimeout(() => {
        this.flushChannel(channel)
      }, delay)
    }

    return true
  }

  /**
   * Flush all buffered messages for a channel
   */
  private flushChannel(channel: string): void {
    const state = this.channels.get(channel)
    if (!state || state.buffer.length === 0) {
      return
    }

    const config = this.getConfig(channel)

    // Clear timer
    if (state.timer) {
      clearTimeout(state.timer)
      state.timer = null
    }

    // Emit buffered messages
    const messages = state.buffer.splice(0, config.maxBatchSize)
    state.lastEmitTime = Date.now()

    this.emitCallback(channel, messages)

    // If there are still messages in buffer, schedule next flush
    if (state.buffer.length > 0) {
      state.timer = setTimeout(() => {
        this.flushChannel(channel)
      }, config.intervalMs)
    }
  }

  /**
   * Flush all channels immediately
   */
  flushAll(): void {
    for (const channel of this.channels.keys()) {
      this.flushChannel(channel)
    }
  }

  /**
   * Get statistics for a channel
   */
  getStats(channel: string): { buffered: number; lastEmitTime: number } | null {
    const state = this.channels.get(channel)
    if (!state) {
      return null
    }
    return {
      buffered: state.buffer.length,
      lastEmitTime: state.lastEmitTime,
    }
  }

  /**
   * Get overall statistics
   */
  getAllStats(): Record<string, { buffered: number; lastEmitTime: number }> {
    const stats: Record<string, { buffered: number; lastEmitTime: number }> = {}
    for (const [channel, state] of this.channels) {
      stats[channel] = {
        buffered: state.buffer.length,
        lastEmitTime: state.lastEmitTime,
      }
    }
    return stats
  }

  /**
   * Clear a specific channel
   */
  clearChannel(channel: string): void {
    const state = this.channels.get(channel)
    if (state) {
      if (state.timer) {
        clearTimeout(state.timer)
      }
      this.channels.delete(channel)
    }
  }

  /**
   * Shutdown the throttler, clearing all timers
   */
  shutdown(): void {
    this.isShutdown = true

    for (const [_channel, state] of this.channels) {
      if (state.timer) {
        clearTimeout(state.timer)
      }
    }

    this.channels.clear()
    this.logger.info('MessageThrottler shutdown complete')
  }
}

// Singleton instance
let throttlerInstance: MessageThrottler | null = null

export function createMessageThrottler(
  logger: Logger,
  emitCallback: EmitCallback
): MessageThrottler {
  throttlerInstance = new MessageThrottler(logger, emitCallback)
  return throttlerInstance
}

export function getMessageThrottler(): MessageThrottler | null {
  return throttlerInstance
}
