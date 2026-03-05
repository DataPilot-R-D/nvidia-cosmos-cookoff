/**
 * Incident SQLite database initialization.
 * Uses bun:sqlite (built-in, zero-dependency).
 */
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DB_PATH = 'data/incidents.db'

let _db: Database | null = null

export function getDb(dbPath: string = DEFAULT_DB_PATH): Database {
  if (_db) return _db
  _db = createDb(dbPath)
  return _db
}

export function createDb(dbPath: string = DEFAULT_DB_PATH): Database {
  const dir = dirname(dbPath)
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New', 'Ack', 'Closed')),
      severity TEXT NOT NULL DEFAULT 'Low' CHECK(severity IN ('Low', 'Medium', 'High', 'Critical')),
      cameraSourceId TEXT,
      robotId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)

  return db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

/** Reset singleton — for tests */
export function resetDb(): void {
  _db = null
}
