/**
 * Mission Engine SQLite database initialization.
 * Uses bun:sqlite (built-in, zero-dependency).
 */
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DB_PATH = 'data/missions.db'

let _db: Database | null = null

export function getMissionDb(dbPath: string = DEFAULT_DB_PATH): Database {
  if (_db) return _db
  _db = createMissionDb(dbPath)
  return _db
}

export function createMissionDb(dbPath: string = DEFAULT_DB_PATH): Database {
  const dir = dirname(dbPath)
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'patrol' CHECK(type IN ('patrol', 'inspect', 'goto')),
      waypoints TEXT NOT NULL DEFAULT '[]',
      robotId TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'dispatched', 'in_progress', 'completed', 'failed', 'cancelled')),
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)

  return db
}

export function closeMissionDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

export function resetMissionDb(): void {
  _db = null
}
