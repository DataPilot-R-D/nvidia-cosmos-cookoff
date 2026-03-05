/**
 * Permission Hook / Helper Tests
 */

import { hasPermission, getPermissions, type Permission } from '../use-permission'

describe('hasPermission', () => {
  const allPermissions: Permission[] = [
    'teleop',
    'navigation',
    'estop',
    'camera:control',
    'map:set-goal',
    'incident:manage',
    'settings:edit',
    'tab:manage',
  ]

  it('admin should have all permissions', () => {
    for (const p of allPermissions) {
      expect(hasPermission('admin', p)).toBe(true)
    }
  })

  it('operator should have teleop, navigation, estop, camera:control, map:set-goal', () => {
    expect(hasPermission('operator', 'teleop')).toBe(true)
    expect(hasPermission('operator', 'navigation')).toBe(true)
    expect(hasPermission('operator', 'estop')).toBe(true)
    expect(hasPermission('operator', 'camera:control')).toBe(true)
    expect(hasPermission('operator', 'map:set-goal')).toBe(true)
  })

  it('operator should NOT have admin-only permissions', () => {
    expect(hasPermission('operator', 'incident:manage')).toBe(false)
    expect(hasPermission('operator', 'settings:edit')).toBe(false)
    expect(hasPermission('operator', 'tab:manage')).toBe(false)
  })

  it('viewer should have no permissions', () => {
    for (const p of allPermissions) {
      expect(hasPermission('viewer', p)).toBe(false)
    }
  })

  it('undefined role should have no permissions', () => {
    expect(hasPermission(undefined, 'teleop')).toBe(false)
  })
})

describe('getPermissions', () => {
  it('admin should return 8 permissions', () => {
    expect(getPermissions('admin').size).toBe(8)
  })

  it('operator should return 5 permissions', () => {
    expect(getPermissions('operator').size).toBe(5)
  })

  it('viewer should return 0 permissions', () => {
    expect(getPermissions('viewer').size).toBe(0)
  })

  it('undefined should return empty set', () => {
    expect(getPermissions(undefined).size).toBe(0)
  })
})
