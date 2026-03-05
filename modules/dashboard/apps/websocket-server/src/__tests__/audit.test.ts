/**
 * Tests for Audit Trail (T2.3) + Policy (T2.5)
 * Uses bun:test + bun:sqlite (same pattern as incidents tests).
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { appendAuditLog, listAuditLog } from '../audit/model'
import { checkPolicy, auditCommand, getUser } from '../audit/policy'

let db: Database

function initTestDb(): Database {
  const d = new Database(':memory:')
  d.exec('PRAGMA journal_mode = WAL')
  d.exec(`
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
  d.exec('CREATE INDEX IF NOT EXISTS idx_audit_userId ON audit_log(userId)')
  d.exec('CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action)')
  d.exec('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)')
  return d
}

beforeEach(() => {
  db = initTestDb()
})

afterEach(() => {
  db.close()
})

// ─── Audit Model ─────────────────────────────────────────

describe('appendAuditLog', () => {
  test('appends entry and returns it', () => {
    const entry = appendAuditLog(db, {
      userId: 'u-admin',
      userRole: 'admin',
      action: 'teleop',
      params: { linear: 0.5, angular: 0 },
      result: 'ok',
    })
    expect(entry.id).toBe(1)
    expect(entry.userId).toBe('u-admin')
    expect(entry.action).toBe('teleop')
    expect(JSON.parse(entry.params!)).toEqual({ linear: 0.5, angular: 0 })
    expect(entry.result).toBe('ok')
    expect(entry.timestamp).toBeTruthy()
  })

  test('auto-increments id', () => {
    appendAuditLog(db, { userId: 'u-1', action: 'a' })
    const e2 = appendAuditLog(db, { userId: 'u-2', action: 'b' })
    expect(e2.id).toBe(2)
  })

  test('rejects empty userId', () => {
    expect(() => appendAuditLog(db, { userId: '', action: 'x' })).toThrow()
  })
})

describe('listAuditLog', () => {
  beforeEach(() => {
    appendAuditLog(db, { userId: 'u-admin', userRole: 'admin', action: 'teleop', result: 'ok' })
    appendAuditLog(db, {
      userId: 'u-viewer',
      userRole: 'viewer',
      action: 'estop',
      result: 'denied',
      reason: 'no perm',
    })
    appendAuditLog(db, { userId: 'u-admin', userRole: 'admin', action: 'nav_goal', result: 'ok' })
  })

  test('returns all entries by default', () => {
    const { entries, total } = listAuditLog(db)
    expect(total).toBe(3)
    expect(entries.length).toBe(3)
    // Default order: newest first
    expect(entries[0].action).toBe('nav_goal')
  })

  test('filters by userId', () => {
    const { entries, total } = listAuditLog(db, { userId: 'u-viewer' })
    expect(total).toBe(1)
    expect(entries[0].action).toBe('estop')
  })

  test('filters by action', () => {
    const { entries } = listAuditLog(db, { action: 'teleop' })
    expect(entries.length).toBe(1)
  })

  test('filters by result', () => {
    const { entries } = listAuditLog(db, { result: 'denied' })
    expect(entries.length).toBe(1)
    expect(entries[0].reason).toBe('no perm')
  })

  test('supports pagination', () => {
    const { entries } = listAuditLog(db, { limit: 2, offset: 0 })
    expect(entries.length).toBe(2)
    const { entries: page2 } = listAuditLog(db, { limit: 2, offset: 2 })
    expect(page2.length).toBe(1)
  })
})

// ─── Policy ──────────────────────────────────────────────

describe('getUser', () => {
  test('returns user for known id', () => {
    const u = getUser('u-admin')
    expect(u).not.toBeNull()
    expect(u!.role).toBe('admin')
  })

  test('returns null for unknown id', () => {
    expect(getUser('u-unknown')).toBeNull()
  })
})

describe('checkPolicy', () => {
  test('admin can teleop', () => {
    const result = checkPolicy(db, 'u-admin', 'teleop')
    expect(result.allowed).toBe(true)
  })

  test('operator can teleop', () => {
    const result = checkPolicy(db, 'u-operator', 'teleop')
    expect(result.allowed).toBe(true)
  })

  test('viewer cannot teleop', () => {
    const result = checkPolicy(db, 'u-viewer', 'teleop')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('viewer')
  })

  test('viewer denied → creates audit entry', () => {
    checkPolicy(db, 'u-viewer', 'estop')
    const { entries } = listAuditLog(db)
    expect(entries.length).toBe(1)
    expect(entries[0].result).toBe('denied')
    expect(entries[0].action).toBe('estop')
  })

  test('unknown user → denied', () => {
    const result = checkPolicy(db, 'u-ghost', 'teleop')
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('User not found')
  })

  test('unmapped action → denied by default', () => {
    const result = checkPolicy(db, 'u-viewer', 'some_unknown_action')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('not permitted')
  })

  test('admin can manage incidents', () => {
    expect(checkPolicy(db, 'u-admin', 'incident_manage').allowed).toBe(true)
  })

  test('operator can manage incidents', () => {
    expect(checkPolicy(db, 'u-operator', 'incident_manage').allowed).toBe(true)
  })
})

describe('auditCommand', () => {
  test('logs successful command', () => {
    auditCommand(db, 'u-admin', 'admin', 'teleop', { linear: 1 })
    const { entries } = listAuditLog(db)
    expect(entries.length).toBe(1)
    expect(entries[0].result).toBe('ok')
    expect(entries[0].userId).toBe('u-admin')
  })
})
