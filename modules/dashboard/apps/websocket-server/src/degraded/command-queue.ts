/**
 * Offline Command Queue with TTL + Governance
 *
 * Buffers commands when robot/system is offline or degraded.
 * Replays them on reconnect with idempotency keys.
 * E-STOP always bypasses the queue.
 *
 * @see Issue #34 — T3.5 Degraded modes v1
 */

import { randomUUID } from 'node:crypto'

// ── Types ────────────────────────────────────────────────

export type ConnectionState = 'online' | 'degraded' | 'offline'

export interface QueuedCommand {
  id: string
  idempotencyKey: string
  action: string
  params: Record<string, unknown>
  userId: string
  priority: number // lower = higher priority
  enqueuedAt: number // Date.now()
  ttlMs: number
  attempts: number
}

export interface QueueConfig {
  defaultTtlMs: number
  maxDepth: number
  degradedTimeoutMs: number
  offlineTimeoutMs: number
  priorityActions: ReadonlySet<string>
  bypassActions: ReadonlySet<string>
}

export interface QueueEvent {
  type: 'enqueued' | 'expired' | 'replayed' | 'dropped' | 'bypassed'
  commandId: string
  action: string
  userId: string
  timestamp: number
  reason?: string
}

// ── Default Config ───────────────────────────────────────

const DEFAULT_CONFIG: QueueConfig = {
  defaultTtlMs: 30_000,
  maxDepth: 20,
  degradedTimeoutMs: 5_000,
  offlineTimeoutMs: 15_000,
  priorityActions: new Set(['estop', 'e_stop', 'alert']),
  bypassActions: new Set(['estop', 'e_stop']),
}

// ── Command Queue ────────────────────────────────────────

export class CommandQueue {
  private queue: QueuedCommand[] = []
  private state: ConnectionState = 'online'
  private lastHeartbeat: number = Date.now()
  private config: QueueConfig
  private eventLog: QueueEvent[] = []
  private onEvent?: (event: QueueEvent) => void

  constructor(config?: Partial<QueueConfig>, onEvent?: (event: QueueEvent) => void) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    if (config?.priorityActions) {
      this.config.priorityActions = new Set(config.priorityActions)
    }
    if (config?.bypassActions) {
      this.config.bypassActions = new Set(config.bypassActions)
    }
    this.onEvent = onEvent
  }

  // ── State Machine ──────────────────────────────────────

  getState(): ConnectionState {
    return this.state
  }

  /**
   * Update connection state based on heartbeat.
   * Call this on every heartbeat/pong received.
   */
  heartbeat(): void {
    this.lastHeartbeat = Date.now()
    if (this.state !== 'online') {
      this.state = 'online'
    }
  }

  /**
   * Check connection health. Call periodically (e.g., every 1s).
   * Transitions: online→degraded→offline based on time since last heartbeat.
   */
  checkHealth(now: number = Date.now()): ConnectionState {
    const elapsed = now - this.lastHeartbeat

    if (elapsed > this.config.offlineTimeoutMs) {
      this.state = 'offline'
    } else if (elapsed > this.config.degradedTimeoutMs) {
      this.state = 'degraded'
    } else {
      this.state = 'online'
    }

    return this.state
  }

  // ── Queue Operations ───────────────────────────────────

  /**
   * Enqueue a command.
   * Returns: { queued: true } if buffered, { bypass: true } if should send immediately.
   */
  enqueue(
    action: string,
    params: Record<string, unknown>,
    userId: string,
    options?: { ttlMs?: number; idempotencyKey?: string }
  ): { queued: boolean; bypass: boolean; command: QueuedCommand } {
    const command: QueuedCommand = {
      id: randomUUID(),
      idempotencyKey: options?.idempotencyKey ?? randomUUID(),
      action,
      params,
      userId,
      priority: this.config.priorityActions.has(action) ? 0 : 5,
      enqueuedAt: Date.now(),
      ttlMs: options?.ttlMs ?? this.config.defaultTtlMs,
      attempts: 0,
    }

    // E-STOP and bypass actions ALWAYS go through immediately
    if (this.config.bypassActions.has(action)) {
      this.emitEvent({
        type: 'bypassed',
        commandId: command.id,
        action,
        userId,
        timestamp: Date.now(),
      })
      return { queued: false, bypass: true, command }
    }

    // If online, don't queue
    if (this.state === 'online') {
      return { queued: false, bypass: false, command }
    }

    // Enforce max depth — drop oldest non-priority
    this.purgeExpired()
    if (this.queue.length >= this.config.maxDepth) {
      const dropped = this.dropOldest()
      if (!dropped) {
        // Queue full of priority commands, drop this one
        return { queued: false, bypass: false, command }
      }
    }

    // Insert sorted by priority (lower first), then by time
    const insertIdx = this.queue.findIndex((c) => c.priority > command.priority)
    if (insertIdx === -1) {
      this.queue.push(command)
    } else {
      this.queue.splice(insertIdx, 0, command)
    }

    this.emitEvent({
      type: 'enqueued',
      commandId: command.id,
      action,
      userId,
      timestamp: Date.now(),
    })
    return { queued: true, bypass: false, command }
  }

  /**
   * Drain queue — returns commands to replay on reconnect.
   * Removes expired, increments attempt count.
   */
  drain(): QueuedCommand[] {
    this.purgeExpired()
    const commands = this.queue.map((cmd) => ({
      ...cmd,
      attempts: cmd.attempts + 1,
    }))
    this.queue = []

    for (const cmd of commands) {
      this.emitEvent({
        type: 'replayed',
        commandId: cmd.id,
        action: cmd.action,
        userId: cmd.userId,
        timestamp: Date.now(),
      })
    }

    return commands
  }

  /**
   * Get current queue snapshot (read-only).
   */
  peek(): readonly QueuedCommand[] {
    return [...this.queue]
  }

  /**
   * Get queue depth.
   */
  depth(): number {
    return this.queue.length
  }

  /**
   * Get event log.
   */
  getEvents(): readonly QueueEvent[] {
    return [...this.eventLog]
  }

  /**
   * Clear event log.
   */
  clearEvents(): void {
    this.eventLog = []
  }

  /**
   * Reset queue and state.
   */
  reset(): void {
    this.queue = []
    this.state = 'online'
    this.lastHeartbeat = Date.now()
    this.eventLog = []
  }

  // ── Internals ──────────────────────────────────────────

  private purgeExpired(): void {
    const now = Date.now()
    this.queue = this.queue.filter((cmd) => {
      const expired = now - cmd.enqueuedAt > cmd.ttlMs
      if (expired) {
        this.emitEvent({
          type: 'expired',
          commandId: cmd.id,
          action: cmd.action,
          userId: cmd.userId,
          timestamp: now,
          reason: `TTL ${cmd.ttlMs}ms exceeded`,
        })
      }
      return !expired
    })
  }

  private dropOldest(): boolean {
    // Find oldest non-priority command to drop
    const idx = this.queue.findIndex((c) => c.priority > 0)
    if (idx === -1) return false

    const dropped = this.queue.splice(idx, 1)[0]
    this.emitEvent({
      type: 'dropped',
      commandId: dropped.id,
      action: dropped.action,
      userId: dropped.userId,
      timestamp: Date.now(),
      reason: 'Max queue depth exceeded',
    })
    return true
  }

  private emitEvent(event: QueueEvent): void {
    this.eventLog.push(event)
    this.onEvent?.(event)
  }
}
