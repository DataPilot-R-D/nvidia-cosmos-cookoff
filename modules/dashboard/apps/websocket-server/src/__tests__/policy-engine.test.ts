/**
 * Policy Engine Tests
 *
 * Tests for the config-driven policy engine (roles, permissions, action mapping).
 * @see Issue #29 — T2.5 Policy skeleton BE
 */

import { Database } from 'bun:sqlite'
import {
  checkPolicy,
  getUser,
  policyConfig,
  ROLE_PERMISSIONS,
  ACTION_PERMISSION_MAP,
} from '../audit/policy'

function createTestDb(): Database {
  const d = new Database(':memory:')
  d.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      userId TEXT NOT NULL,
      userRole TEXT NOT NULL,
      action TEXT NOT NULL,
      params TEXT,
      result TEXT NOT NULL CHECK(result IN ('ok','denied','error')),
      reason TEXT
    )
  `)
  return d
}

describe('Policy Engine Config', () => {
  it('loads policy config with version', () => {
    expect(policyConfig.version).toBe('1.0.0')
  })

  it('has all three roles defined', () => {
    expect(Object.keys(policyConfig.roles)).toEqual(
      expect.arrayContaining(['admin', 'operator', 'viewer'])
    )
  })

  it('admin has all permissions', () => {
    const adminPerms = ROLE_PERMISSIONS['admin']
    expect(adminPerms.has('teleop')).toBe(true)
    expect(adminPerms.has('navigation')).toBe(true)
    expect(adminPerms.has('estop')).toBe(true)
    expect(adminPerms.has('camera:control')).toBe(true)
    expect(adminPerms.has('incident:manage')).toBe(true)
    expect(adminPerms.has('settings:edit')).toBe(true)
    expect(adminPerms.has('audit:read')).toBe(true)
  })

  it('operator has operational permissions + incident:manage', () => {
    const opPerms = ROLE_PERMISSIONS['operator']
    expect(opPerms.has('teleop')).toBe(true)
    expect(opPerms.has('navigation')).toBe(true)
    expect(opPerms.has('estop')).toBe(true)
    expect(opPerms.has('camera:control')).toBe(true)
    expect(opPerms.has('incident:manage')).toBe(true)
    expect(opPerms.has('settings:edit')).toBe(false)
  })

  it('viewer has no permissions', () => {
    const viewerPerms = ROLE_PERMISSIONS['viewer']
    expect(viewerPerms.size).toBe(0)
  })

  it('action map covers all expected socket events', () => {
    const expected = [
      'teleop',
      'cmd_vel',
      'nav_goal',
      'navigate',
      'estop',
      'e_stop',
      'camera_control',
      'map_set_goal',
      'incident_manage',
      'incident_create',
      'settings_edit',
      'set_rosbridge_url',
      'alert',
      'audit_read',
    ]
    for (const action of expected) {
      expect(ACTION_PERMISSION_MAP[action]).toBeDefined()
    }
  })

  it('defaults deny unmapped actions', () => {
    expect(policyConfig.defaults.unmappedAction).toBe('deny')
    expect(policyConfig.defaults.unknownUser).toBe('deny')
  })
})

describe('Policy Check Integration', () => {
  let db: Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  it('admin allowed for all actions', () => {
    for (const action of Object.keys(ACTION_PERMISSION_MAP)) {
      const result = checkPolicy(db, 'u-admin', action)
      expect(result.allowed).toBe(true)
    }
  })

  it('operator allowed for teleop/nav/estop/camera/incident', () => {
    expect(checkPolicy(db, 'u-operator', 'teleop').allowed).toBe(true)
    expect(checkPolicy(db, 'u-operator', 'navigate').allowed).toBe(true)
    expect(checkPolicy(db, 'u-operator', 'estop').allowed).toBe(true)
    expect(checkPolicy(db, 'u-operator', 'camera_control').allowed).toBe(true)
    expect(checkPolicy(db, 'u-operator', 'incident_manage').allowed).toBe(true)
    expect(checkPolicy(db, 'u-operator', 'incident_create').allowed).toBe(true)
  })

  it('operator denied for settings', () => {
    const result = checkPolicy(db, 'u-operator', 'settings_edit')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('operator')
  })

  it('viewer denied for all write actions', () => {
    for (const action of ['teleop', 'estop', 'navigate', 'camera_control', 'incident_manage']) {
      const result = checkPolicy(db, 'u-viewer', action)
      expect(result.allowed).toBe(false)
    }
  })

  it('unknown user denied', () => {
    const result = checkPolicy(db, 'u-unknown', 'teleop')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('not found')
  })

  it('unmapped action denied by default', () => {
    const result = checkPolicy(db, 'u-admin', 'some_unknown_action')
    expect(result.allowed).toBe(false)
    expect(result.reason).toContain('not permitted')
  })

  it('denied actions create audit entries', () => {
    checkPolicy(db, 'u-viewer', 'teleop')

    const rows = db.query('SELECT * FROM audit_log WHERE result = ?').all('denied') as Array<{
      userId: string
      action: string
      result: string
    }>
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].userId).toBe('u-viewer')
    expect(rows[0].action).toBe('teleop')
  })

  it('allowed actions do NOT create audit entries (logged separately)', () => {
    checkPolicy(db, 'u-admin', 'teleop')

    const rows = db.query('SELECT * FROM audit_log').all()
    expect(rows.length).toBe(0) // checkPolicy only logs denials
  })
})
