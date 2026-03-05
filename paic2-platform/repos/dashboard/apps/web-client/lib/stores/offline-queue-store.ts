/**
 * Offline Command Queue — Zustand Store
 *
 * Manages queued commands when the robot connection is offline.
 * Hydrates from IndexedDB on startup, flushes on reconnect.
 *
 * Safety: E-STOP is NEVER queued. Teleop commands older than TELEOP_TTL_MS
 * are discarded during flush (stale velocity = dangerous).
 */

import { create } from 'zustand'
import {
  offlineQueueAdd,
  offlineQueueGetAll,
  offlineQueueDeleteBatch,
  offlineQueueClear,
  type QueuedCommand,
  type QueuedCommandType,
} from '@/lib/storage/offline-queue-idb'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Max send attempts before discarding a command */
const MAX_RETRIES = 8
/** Base delay for exponential backoff (ms) */
const BACKOFF_BASE_MS = 500
/** Max backoff delay (ms) */
const BACKOFF_MAX_MS = 30_000
/**
 * Teleop TTL — discard velocity commands older than this during flush.
 * Stale velocity commands are a safety hazard (robot would move unexpectedly).
 */
const TELEOP_TTL_MS = 5_000

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SendFn = (payload: Record<string, unknown>) => boolean

interface OfflineQueueState {
  /** In-memory mirror of IDB queue */
  items: QueuedCommand[]
  /** Whether IDB has been loaded */
  hydrated: boolean
  /** Whether flush is currently running */
  flushing: boolean
  /** Registered sender functions per command type */
  senders: Partial<Record<QueuedCommandType, SendFn>>
}

interface OfflineQueueActions {
  /** Load queue from IDB into memory */
  hydrate: () => Promise<void>
  /** Enqueue a new command (writes to IDB + memory) */
  enqueue: (type: QueuedCommandType, payload: Record<string, unknown>) => Promise<void>
  /** Flush the queue — send all pending commands */
  flush: () => Promise<void>
  /** Clear entire queue */
  clear: () => Promise<void>
  /** Register sender functions for command types */
  setSenders: (senders: Partial<Record<QueuedCommandType, SendFn>>) => void
}

export type OfflineQueueStore = OfflineQueueState & OfflineQueueActions

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useOfflineQueueStore = create<OfflineQueueStore>((set, get) => ({
  // State
  items: [],
  hydrated: false,
  flushing: false,
  senders: {},

  // Actions
  hydrate: async () => {
    try {
      const items = await offlineQueueGetAll()
      set({ items, hydrated: true })
    } catch {
      // IDB may be unavailable (SSR, incognito limits)
      set({ hydrated: true })
    }
  },

  enqueue: async (type, payload) => {
    const cmd: Omit<QueuedCommand, 'id'> = {
      type,
      payload,
      createdAt: Date.now(),
      retries: 0,
    }
    try {
      const id = await offlineQueueAdd(cmd)
      set((s) => ({ items: [...s.items, { ...cmd, id }] }))
    } catch {
      // Best-effort: keep in memory even if IDB fails
      set((s) => ({ items: [...s.items, { ...cmd, id: Date.now() }] }))
    }
  },

  flush: async () => {
    const { items, senders, flushing } = get()
    if (flushing || items.length === 0) return

    set({ flushing: true })

    const toDelete: number[] = []
    const remaining: QueuedCommand[] = []
    const now = Date.now()

    for (const cmd of items) {
      // Discard stale teleop commands (safety: don't replay old velocities)
      if (cmd.type === 'teleop' && now - cmd.createdAt > TELEOP_TTL_MS) {
        if (cmd.id != null) toDelete.push(cmd.id)
        continue
      }

      // Discard if max retries exceeded
      if (cmd.retries >= MAX_RETRIES) {
        if (cmd.id != null) toDelete.push(cmd.id)
        continue
      }

      const sender = senders[cmd.type]
      if (!sender) {
        remaining.push(cmd)
        continue
      }

      const sent = sender(cmd.payload)
      if (sent) {
        if (cmd.id != null) toDelete.push(cmd.id)
      } else {
        // Failed — increment retry, backoff
        const retries = cmd.retries + 1
        remaining.push({ ...cmd, retries })

        const delay = Math.min(BACKOFF_BASE_MS * 2 ** cmd.retries, BACKOFF_MAX_MS)
        await new Promise((r) => setTimeout(r, delay))
      }
    }

    // Persist deletions
    if (toDelete.length > 0) {
      try {
        await offlineQueueDeleteBatch(toDelete)
      } catch {
        // best-effort
      }
    }

    set({ items: remaining, flushing: false })
  },

  clear: async () => {
    try {
      await offlineQueueClear()
    } catch {
      // best-effort
    }
    set({ items: [] })
  },

  setSenders: (senders) => set({ senders }),
}))
