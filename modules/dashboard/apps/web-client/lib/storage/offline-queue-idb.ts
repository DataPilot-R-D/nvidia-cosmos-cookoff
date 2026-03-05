/**
 * IndexedDB adapter for offline command queue.
 *
 * Stores queued commands (teleop velocity, nav goals) for replay after reconnect.
 * Uses `idb` for a promise-based wrapper around IndexedDB.
 */

import { openDB, type IDBPDatabase } from 'idb'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QueuedCommandType = 'teleop' | 'goal_pose'

export interface QueuedCommand {
  /** Auto-incremented primary key */
  id?: number
  /** Command type — determines flush gate (teleop: WS only, goal: WS + ROSBridge) */
  type: QueuedCommandType
  /** Serialized command payload */
  payload: Record<string, unknown>
  /** Timestamp (ms) when the command was enqueued */
  createdAt: number
  /** Number of send attempts so far */
  retries: number
}

// ---------------------------------------------------------------------------
// DB setup
// ---------------------------------------------------------------------------

const DB_NAME = 'robot-offline-queue'
const DB_VERSION = 1
const STORE_NAME = 'commands'

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          })
          store.createIndex('by-type', 'type')
        }
      },
    })
  }
  return dbPromise
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** Add a command to the queue. Returns the generated id. */
export async function offlineQueueAdd(cmd: Omit<QueuedCommand, 'id'>): Promise<number> {
  const db = await getDb()
  return (await db.add(STORE_NAME, cmd)) as number
}

/** Get all queued commands, oldest first. */
export async function offlineQueueGetAll(): Promise<QueuedCommand[]> {
  const db = await getDb()
  return db.getAll(STORE_NAME)
}

/** Delete a single command by id. */
export async function offlineQueueDelete(id: number): Promise<void> {
  const db = await getDb()
  await db.delete(STORE_NAME, id)
}

/** Delete multiple commands by id (batch). */
export async function offlineQueueDeleteBatch(ids: number[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  await Promise.all(ids.map((id) => tx.store.delete(id)))
  await tx.done
}

/** Update retry count for a command. */
export async function offlineQueueBumpRetry(id: number): Promise<void> {
  const db = await getDb()
  const cmd = await db.get(STORE_NAME, id)
  if (cmd) {
    cmd.retries += 1
    await db.put(STORE_NAME, cmd)
  }
}

/** Clear the entire queue. */
export async function offlineQueueClear(): Promise<void> {
  const db = await getDb()
  await db.clear(STORE_NAME)
}
