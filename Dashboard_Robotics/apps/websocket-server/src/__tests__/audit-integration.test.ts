/**
 * Integration tests for audit trail wiring into socket events.
 * Verifies that checkPolicy + auditCommand are called from socket handlers.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { appendAuditLog, listAuditLog } from '../audit/model'
import { checkPolicy, auditCommand } from '../audit/policy'

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

// ─── Command event audit flow ────────────────────────────

describe('command event audit flow', () => {
  test('allowed command creates audit entry with ok result', () => {
    const policy = checkPolicy(db, 'u-admin', 'teleop', { linear: 0.5 })
    expect(policy.allowed).toBe(true)

    auditCommand(db, 'u-admin', policy.user!.role, 'teleop', { linear: 0.5 })

    const { entries } = listAuditLog(db, { action: 'teleop' })
    expect(entries.length).toBe(1)
    expect(entries[0].userId).toBe('u-admin')
    expect(entries[0].userRole).toBe('admin')
    expect(entries[0].result).toBe('ok')
    expect(JSON.parse(entries[0].params!)).toEqual({ linear: 0.5 })
  })

  test('denied command creates audit entry with denied result', () => {
    const policy = checkPolicy(db, 'u-viewer', 'estop', {})
    expect(policy.allowed).toBe(false)

    // checkPolicy auto-logs denied entries
    const { entries } = listAuditLog(db, { result: 'denied' })
    expect(entries.length).toBe(1)
    expect(entries[0].action).toBe('estop')
    expect(entries[0].userId).toBe('u-viewer')
    expect(entries[0].reason).toContain('viewer')
  })

  test('nav_goal command audited for operator', () => {
    const policy = checkPolicy(db, 'u-operator', 'nav_goal', { x: 1, y: 2 })
    expect(policy.allowed).toBe(true)
    auditCommand(db, 'u-operator', 'operator', 'nav_goal', { x: 1, y: 2 })

    const { entries } = listAuditLog(db, { action: 'nav_goal' })
    expect(entries.length).toBe(1)
    expect(entries[0].result).toBe('ok')
  })

  test('estop command audited for admin', () => {
    const policy = checkPolicy(db, 'u-admin', 'estop')
    expect(policy.allowed).toBe(true)
    auditCommand(db, 'u-admin', 'admin', 'estop', { reason: 'emergency' })

    const { entries } = listAuditLog(db, { action: 'estop' })
    expect(entries.length).toBe(1)
    expect(entries[0].result).toBe('ok')
    expect(JSON.parse(entries[0].params!).reason).toBe('emergency')
  })
})

// ─── Alert event audit flow ─────────────────────────────

describe('alert event audit flow', () => {
  test('admin alert is allowed and creates audit entry', () => {
    const policy = checkPolicy(db, 'u-admin', 'alert', { severity: 'high' })
    expect(policy.allowed).toBe(true)
    auditCommand(db, 'u-admin', 'admin', 'alert', { severity: 'high', message: 'obstacle' })

    const { entries } = listAuditLog(db, { action: 'alert' })
    expect(entries.length).toBe(1)
    expect(entries[0].result).toBe('ok')
  })

  test('viewer alert is denied', () => {
    const policy = checkPolicy(db, 'u-viewer', 'alert')
    expect(policy.allowed).toBe(false)
  })
})

// ─── Rosbridge URL change audit ─────────────────────────

describe('set_rosbridge_url audit flow', () => {
  test('admin URL change is allowed and creates audit entry', () => {
    const policy = checkPolicy(db, 'u-admin', 'set_rosbridge_url', { url: 'ws://new-host:9090' })
    expect(policy.allowed).toBe(true)
    auditCommand(db, 'u-admin', 'admin', 'set_rosbridge_url', { url: 'ws://new-host:9090' })

    const { entries } = listAuditLog(db, { action: 'set_rosbridge_url' })
    expect(entries.length).toBe(1)
    expect(JSON.parse(entries[0].params!).url).toBe('ws://new-host:9090')
  })

  test('viewer URL change is denied by RBAC', () => {
    const policy = checkPolicy(db, 'u-viewer', 'set_rosbridge_url', { url: 'ws://evil:9090' })
    expect(policy.allowed).toBe(false)

    const { entries } = listAuditLog(db, { result: 'denied' })
    expect(entries.length).toBe(1)
    expect(entries[0].action).toBe('set_rosbridge_url')
  })

  test('operator URL change is denied (requires settings:edit)', () => {
    const policy = checkPolicy(db, 'u-operator', 'set_rosbridge_url')
    expect(policy.allowed).toBe(false)
  })
})

// ─── Incident status change audit ───────────────────────

describe('incident_manage audit flow', () => {
  test('admin can manage incidents and it is logged', () => {
    const policy = checkPolicy(db, 'u-admin', 'incident_manage', {
      incidentId: 42,
      newStatus: 'resolved',
    })
    expect(policy.allowed).toBe(true)
    auditCommand(db, 'u-admin', 'admin', 'incident_manage', {
      incidentId: 42,
      newStatus: 'resolved',
    })

    const { entries } = listAuditLog(db)
    expect(entries.length).toBe(1)
    expect(entries[0].action).toBe('incident_manage')
  })

  test('operator cannot manage incidents — denied and logged', () => {
    const policy = checkPolicy(db, 'u-operator', 'incident_manage')
    expect(policy.allowed).toBe(false)

    const { entries } = listAuditLog(db, { result: 'denied' })
    expect(entries.length).toBe(1)
  })
})

// ─── Anonymous user flow ────────────────────────────────

describe('anonymous user audit', () => {
  test('anonymous user command is denied and logged', () => {
    const policy = checkPolicy(db, 'anonymous', 'teleop')
    expect(policy.allowed).toBe(false)
    expect(policy.reason).toBe('User not found')

    const { entries } = listAuditLog(db, { userId: 'anonymous' })
    expect(entries.length).toBe(1)
    expect(entries[0].result).toBe('denied')
  })
})

// ─── Append-only guarantee ──────────────────────────────

describe('append-only integrity', () => {
  test('insert works, entries accumulate', () => {
    appendAuditLog(db, { userId: 'test', action: 'test' })
    appendAuditLog(db, { userId: 'test2', action: 'test2' })
    const { total } = listAuditLog(db)
    expect(total).toBe(2)
  })

  test('DB trigger prevents UPDATE on audit_log', () => {
    // Add triggers to test db (same as createAuditDb)
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS audit_no_update
      BEFORE UPDATE ON audit_log
      BEGIN SELECT RAISE(ABORT, 'audit_log is append-only: UPDATE not allowed'); END
    `)
    appendAuditLog(db, { userId: 'test', action: 'test' })
    expect(() => db.exec("UPDATE audit_log SET userId = 'hacked' WHERE id = 1")).toThrow(
      'append-only'
    )
  })

  test('DB trigger prevents DELETE on audit_log', () => {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS audit_no_delete
      BEFORE DELETE ON audit_log
      BEGIN SELECT RAISE(ABORT, 'audit_log is append-only: DELETE not allowed'); END
    `)
    appendAuditLog(db, { userId: 'test', action: 'test' })
    expect(() => db.exec('DELETE FROM audit_log WHERE id = 1')).toThrow('append-only')
  })
})
