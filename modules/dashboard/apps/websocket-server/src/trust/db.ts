/**
 * Trust Layer SQLite database initialization.
 */
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DB_PATH = 'data/trust.db'

let _db: Database | null = null

export function getTrustDb(dbPath: string = DEFAULT_DB_PATH): Database {
  if (_db) return _db
  _db = createTrustDb(dbPath)
  return _db
}

export function createTrustDb(dbPath: string = DEFAULT_DB_PATH): Database {
  const dir = dirname(dbPath)
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS trust_scores (
      id TEXT PRIMARY KEY,
      robotId TEXT NOT NULL UNIQUE,
      confidenceScore REAL NOT NULL DEFAULT 100,
      riskLevel TEXT NOT NULL DEFAULT 'low' CHECK(riskLevel IN ('low', 'medium', 'high', 'critical')),
      handoverStatus TEXT NOT NULL DEFAULT 'autonomous' CHECK(handoverStatus IN ('autonomous', 'supervised', 'manual', 'emergency_stop')),
      reasons TEXT NOT NULL DEFAULT '[]',
      recommendations TEXT NOT NULL DEFAULT '[]',
      sensorHealth TEXT,
      metadata TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)

  db.exec('CREATE INDEX IF NOT EXISTS idx_trust_robotId ON trust_scores(robotId)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_trust_riskLevel ON trust_scores(riskLevel)')

  db.exec(`
    CREATE TABLE IF NOT EXISTS trust_category_scores (
      id TEXT PRIMARY KEY,
      robotId TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('navigation', 'manipulation', 'perception')),
      score REAL NOT NULL DEFAULT 50,
      factors TEXT NOT NULL DEFAULT '[]',
      updatedAt TEXT NOT NULL,
      UNIQUE(robotId, category)
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS trust_overrides (
      id TEXT PRIMARY KEY,
      robotId TEXT NOT NULL,
      category TEXT,
      previousScore REAL NOT NULL,
      overrideScore REAL NOT NULL,
      reason TEXT NOT NULL,
      operatorId TEXT NOT NULL,
      expiresAt TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    )
  `)

  db.exec('CREATE INDEX IF NOT EXISTS idx_trust_cat_robot ON trust_category_scores(robotId)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_trust_override_robot ON trust_overrides(robotId)')

  return db
}

export function closeTrustDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

export function resetTrustDb(): void {
  _db = null
}
