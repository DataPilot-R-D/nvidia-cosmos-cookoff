/**
 * Degraded Modes Tests — Command Queue + Connection State Machine
 *
 * @see Issue #34 — T3.5 Degraded modes v1
 */

import { describe, it, expect, beforeEach } from 'bun:test'
import { CommandQueue, type QueueEvent } from '../degraded/command-queue'

describe('Connection State Machine', () => {
  let q: CommandQueue

  beforeEach(() => {
    q = new CommandQueue({
      degradedTimeoutMs: 100,
      offlineTimeoutMs: 300,
    })
  })

  it('starts online', () => {
    expect(q.getState()).toBe('online')
  })

  it('transitions to degraded after timeout', () => {
    q.checkHealth(Date.now() + 150)
    expect(q.getState()).toBe('degraded')
  })

  it('transitions to offline after longer timeout', () => {
    q.checkHealth(Date.now() + 400)
    expect(q.getState()).toBe('offline')
  })

  it('returns to online on heartbeat', () => {
    q.checkHealth(Date.now() + 400) // offline
    expect(q.getState()).toBe('offline')
    q.heartbeat()
    expect(q.getState()).toBe('online')
  })
})

describe('Command Queue — Enqueue', () => {
  let q: CommandQueue

  beforeEach(() => {
    q = new CommandQueue({ degradedTimeoutMs: 0, offlineTimeoutMs: 0 })
    q.checkHealth(Date.now() + 1) // force offline
  })

  it('queues commands when offline', () => {
    const result = q.enqueue('teleop', { linear: 1 }, 'user-1')
    expect(result.queued).toBe(true)
    expect(result.bypass).toBe(false)
    expect(q.depth()).toBe(1)
  })

  it('does not queue when online', () => {
    q.heartbeat() // back online
    const result = q.enqueue('teleop', { linear: 1 }, 'user-1')
    expect(result.queued).toBe(false)
    expect(q.depth()).toBe(0)
  })

  it('enforces max depth (drops oldest non-priority)', () => {
    const small = new CommandQueue({ maxDepth: 3, degradedTimeoutMs: 0, offlineTimeoutMs: 0 })
    small.checkHealth(Date.now() + 1)

    small.enqueue('cmd1', {}, 'u1')
    small.enqueue('cmd2', {}, 'u1')
    small.enqueue('cmd3', {}, 'u1')
    expect(small.depth()).toBe(3)

    small.enqueue('cmd4', {}, 'u1')
    expect(small.depth()).toBe(3) // oldest dropped

    const events = small.getEvents()
    expect(events.some((e) => e.type === 'dropped')).toBe(true)
  })

  it('priority commands go first in queue', () => {
    q.enqueue('teleop', {}, 'u1')
    q.enqueue('estop', {}, 'u1') // bypass, not queued

    // estop is bypass, so queue only has teleop
    expect(q.depth()).toBe(1)
  })
})

describe('E-STOP Bypass', () => {
  let q: CommandQueue

  beforeEach(() => {
    q = new CommandQueue({ degradedTimeoutMs: 0, offlineTimeoutMs: 0 })
    q.checkHealth(Date.now() + 1) // force offline
  })

  it('estop bypasses queue regardless of connection state', () => {
    const result = q.enqueue('estop', {}, 'user-1')
    expect(result.bypass).toBe(true)
    expect(result.queued).toBe(false)
    expect(q.depth()).toBe(0)
  })

  it('e_stop also bypasses', () => {
    const result = q.enqueue('e_stop', {}, 'user-1')
    expect(result.bypass).toBe(true)
  })

  it('logs bypass event', () => {
    q.enqueue('estop', {}, 'user-1')
    const events = q.getEvents()
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('bypassed')
  })
})

describe('TTL Expiration', () => {
  it('purges expired commands on drain', () => {
    const q = new CommandQueue({
      defaultTtlMs: 50,
      degradedTimeoutMs: 0,
      offlineTimeoutMs: 0,
    })
    q.checkHealth(Date.now() + 1)

    q.enqueue('teleop', {}, 'u1', { ttlMs: 1 }) // 1ms TTL

    // Wait for expiry
    const start = Date.now()
    while (Date.now() - start < 5) {} // busy-wait 5ms

    const drained = q.drain()
    expect(drained).toHaveLength(0)

    const events = q.getEvents()
    expect(events.some((e) => e.type === 'expired')).toBe(true)
  })

  it('keeps non-expired commands', () => {
    const q = new CommandQueue({
      defaultTtlMs: 60_000,
      degradedTimeoutMs: 0,
      offlineTimeoutMs: 0,
    })
    q.checkHealth(Date.now() + 1)

    q.enqueue('teleop', {}, 'u1')
    const drained = q.drain()
    expect(drained).toHaveLength(1)
  })
})

describe('Drain + Replay', () => {
  let q: CommandQueue

  beforeEach(() => {
    q = new CommandQueue({ degradedTimeoutMs: 0, offlineTimeoutMs: 0 })
    q.checkHealth(Date.now() + 1)
  })

  it('drains all commands and clears queue', () => {
    q.enqueue('cmd1', {}, 'u1')
    q.enqueue('cmd2', {}, 'u1')

    const drained = q.drain()
    expect(drained).toHaveLength(2)
    expect(q.depth()).toBe(0)
  })

  it('increments attempt count on drain', () => {
    q.enqueue('cmd1', {}, 'u1')
    const drained = q.drain()
    expect(drained[0].attempts).toBe(1)
  })

  it('logs replay events', () => {
    q.enqueue('cmd1', {}, 'u1')
    q.drain()

    const events = q.getEvents()
    expect(events.filter((e) => e.type === 'replayed')).toHaveLength(1)
  })

  it('preserves idempotency keys', () => {
    q.enqueue('cmd1', {}, 'u1', { idempotencyKey: 'key-123' })
    const drained = q.drain()
    expect(drained[0].idempotencyKey).toBe('key-123')
  })
})

describe('Event Log', () => {
  it('tracks all events', () => {
    const events: QueueEvent[] = []
    const q = new CommandQueue({ degradedTimeoutMs: 0, offlineTimeoutMs: 0 }, (e) => events.push(e))
    q.checkHealth(Date.now() + 1)

    q.enqueue('teleop', {}, 'u1') // enqueued
    q.enqueue('estop', {}, 'u1') // bypassed
    q.drain() // replayed

    expect(events).toHaveLength(3)
    expect(events[0].type).toBe('enqueued')
    expect(events[1].type).toBe('bypassed')
    expect(events[2].type).toBe('replayed')
  })

  it('clearEvents resets log', () => {
    const q = new CommandQueue({ degradedTimeoutMs: 0, offlineTimeoutMs: 0 })
    q.checkHealth(Date.now() + 1)
    q.enqueue('cmd', {}, 'u1')
    expect(q.getEvents()).toHaveLength(1)
    q.clearEvents()
    expect(q.getEvents()).toHaveLength(0)
  })
})

describe('Reset', () => {
  it('resets everything', () => {
    const q = new CommandQueue({ degradedTimeoutMs: 0, offlineTimeoutMs: 0 })
    q.checkHealth(Date.now() + 1)
    q.enqueue('cmd', {}, 'u1')

    q.reset()
    expect(q.getState()).toBe('online')
    expect(q.depth()).toBe(0)
    expect(q.getEvents()).toHaveLength(0)
  })
})
