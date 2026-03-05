/**
 * Evidence SQLite database initialization.
 * Uses bun:sqlite (built-in, zero-dependency).
 */
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DB_PATH = 'data/evidence.db'

let _db: Database | null = null

export function getEvidenceDb(dbPath: string = DEFAULT_DB_PATH): Database {
  if (_db) return _db
  _db = createEvidenceDb(dbPath)
  return _db
}

export function createEvidenceDb(dbPath: string = DEFAULT_DB_PATH): Database {
  const dir = dirname(dbPath)
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('video_clip', 'snapshot', 'sensor_log', 'audit_entry', 'note')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      incidentId TEXT,
      missionId TEXT,
      robotId TEXT,
      cameraSourceId TEXT,
      capturedAt TEXT NOT NULL,
      mediaUrl TEXT,
      startOffset REAL,
      endOffset REAL,
      metadata TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)

  // Indexes for common queries
  db.exec('CREATE INDEX IF NOT EXISTS idx_evidence_incidentId ON evidence(incidentId)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_evidence_missionId ON evidence(missionId)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_evidence_capturedAt ON evidence(capturedAt)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_evidence_type ON evidence(type)')

  return db
}

export function closeEvidenceDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

/** Reset singleton — for tests */
export function resetEvidenceDb(): void {
  _db = null
}
