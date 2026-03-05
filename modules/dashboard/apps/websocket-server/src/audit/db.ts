/**
 * Audit Log SQLite database initialization.
 * Append-only log for all command events.
 * Uses bun:sqlite (built-in, zero-dependency).
 */
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const DEFAULT_DB_PATH = 'data/audit.db'

let _db: Database | null = null

export function getAuditDb(dbPath: string = DEFAULT_DB_PATH): Database {
  if (_db) return _db
  _db = createAuditDb(dbPath)
  return _db
}

export function createAuditDb(dbPath: string = DEFAULT_DB_PATH): Database {
  const dir = dirname(dbPath)
  if (dir && dir !== '.' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  const db = new Database(dbPath)
  db.exec('PRAGMA journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      userId TEXT NOT NULL,
      userRole TEXT NOT NULL DEFAULT 'unknown',
      action TEXT NOT NULL,
      params TEXT,
      result TEXT NOT NULL DEFAULT 'ok',
      reason TEXT
    )
  `)

  // Enforce append-only at DB level
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS audit_no_update
    BEFORE UPDATE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit_log is append-only: UPDATE not allowed'); END
  `)
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS audit_no_delete
    BEFORE DELETE ON audit_log
    BEGIN SELECT RAISE(ABORT, 'audit_log is append-only: DELETE not allowed'); END
  `)

  // Index for common query patterns
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_userId ON audit_log(userId)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)')

  return db
}

export function closeAuditDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

/** Reset singleton — for tests */
export function resetAuditDb(): void {
  _db = null
}
