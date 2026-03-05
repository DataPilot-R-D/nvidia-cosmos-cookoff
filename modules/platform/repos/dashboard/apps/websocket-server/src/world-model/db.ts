/**
 * World Model SQLite database initialization.
 * Stores zones, assets, and constraints.
 * Uses bun:sqlite (built-in, zero-dependency).
 */
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DB_PATH = 'data/world-model.db'

let _db: Database | null = null

export function getWorldDb(dbPath: string = DEFAULT_DB_PATH): Database {
  if (_db) return _db
  _db = createWorldDb(dbPath)
  return _db
}

export function createWorldDb(dbPath: string = DEFAULT_DB_PATH): Database {
  const dir = dirname(dbPath)
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'patrol' CHECK(type IN ('patrol', 'restricted', 'charging')),
      polygon TEXT NOT NULL DEFAULT '[]',
      color TEXT NOT NULL DEFAULT '#3b82f6',
      maxRobots INTEGER,
      speedLimit REAL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'robot',
      zoneId TEXT,
      positionX REAL NOT NULL DEFAULT 0,
      positionY REAL NOT NULL DEFAULT 0,
      positionZ REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (zoneId) REFERENCES zones(id) ON DELETE SET NULL
    )
  `)

  return db
}

export function closeWorldDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

/** Reset singleton — for tests */
export function resetWorldDb(): void {
  _db = null
}
