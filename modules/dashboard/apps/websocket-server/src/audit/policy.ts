/**
 * Policy Middleware — RBAC enforcement for Socket.IO commands.
 *
 * Before any command is executed, checks the user's role against
 * the permission matrix. Denied commands get a 403-equivalent
 * error + audit log entry.
 *
 * User store: mock in-memory (same as frontend auth-store mock users).
 * In production, replace with JWT verification.
 */
import { readFileSync } from 'node:fs'
import type { Database } from 'bun:sqlite'
import { appendAuditLog } from './model'

// ── Types ────────────────────────────────────────────────

export type UserRole = 'admin' | 'operator' | 'viewer'

export interface UserRecord {
  id: string
  email: string
  name: string
  role: UserRole
}

// ── User Store (mock — matches frontend MOCK_USERS) ─────

const USER_STORE: Record<string, UserRecord> = {
  'u-admin': { id: 'u-admin', email: 'admin@robot.cc', name: 'Admin', role: 'admin' },
  'u-operator': {
    id: 'u-operator',
    email: 'operator@robot.cc',
    name: 'Operator',
    role: 'operator',
  },
  'u-viewer': { id: 'u-viewer', email: 'viewer@robot.cc', name: 'Viewer', role: 'viewer' },
}

export function getUser(userId: string): UserRecord | null {
  return USER_STORE[userId] ?? null
}

// ── Permission Matrix (loaded from config/policies.json) ──

export type Permission = string

export interface PolicyConfig {
  version: string
  description?: string
  roles: Record<string, { description?: string; permissions: string[] }>
  actionMap: Record<string, string>
  defaults: { unmappedAction: 'deny' | 'allow'; unknownUser: 'deny' | 'allow' }
}

function loadPolicyConfig(): PolicyConfig {
  try {
    const configPath = new URL('../../config/policies.json', import.meta.url).pathname
    const raw = readFileSync(configPath, 'utf-8')
    return JSON.parse(raw) as PolicyConfig
  } catch {
    // Fallback: hardcoded defaults (safety-critical — always deny by default)
    return {
      version: '1.0.0',
      roles: {
        admin: {
          permissions: [
            'teleop',
            'navigation',
            'estop',
            'camera:control',
            'map:set-goal',
            'incident:manage',
            'settings:edit',
            'audit:read',
          ],
        },
        operator: {
          permissions: [
            'teleop',
            'navigation',
            'estop',
            'camera:control',
            'map:set-goal',
            'incident:manage',
          ],
        },
        viewer: { permissions: [] },
      },
      actionMap: {
        teleop: 'teleop',
        cmd_vel: 'teleop',
        nav_goal: 'navigation',
        navigate: 'navigation',
        estop: 'estop',
        e_stop: 'estop',
        camera_control: 'camera:control',
        map_set_goal: 'map:set-goal',
        incident_manage: 'incident:manage',
        incident_create: 'incident:manage',
        settings_edit: 'settings:edit',
        set_rosbridge_url: 'settings:edit',
        alert: 'estop',
        audit_read: 'audit:read',
      },
      defaults: { unmappedAction: 'deny', unknownUser: 'deny' },
    }
  }
}

const policyConfig = loadPolicyConfig()

const ROLE_PERMISSIONS: Record<string, ReadonlySet<string>> = Object.fromEntries(
  Object.entries(policyConfig.roles).map(([role, def]) => [role, new Set(def.permissions)])
)

const ACTION_PERMISSION_MAP: Record<string, string> = { ...policyConfig.actionMap }

function hasPermission(role: UserRole, permission: string): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}

/** Exported for testing */
export { policyConfig, ROLE_PERMISSIONS, ACTION_PERMISSION_MAP }

// ── Policy Check ─────────────────────────────────────────

export interface PolicyResult {
  allowed: boolean
  reason?: string
  user?: UserRecord
}

/**
 * Check if a user is allowed to perform an action.
 * If denied, appends an audit log entry automatically.
 */
export function checkPolicy(
  auditDb: Database,
  userId: string,
  action: string,
  params?: Record<string, unknown>
): PolicyResult {
  const user = getUser(userId)

  if (!user) {
    appendAuditLog(auditDb, {
      userId,
      userRole: 'unknown',
      action,
      params,
      result: 'denied',
      reason: 'User not found',
    })
    return { allowed: false, reason: 'User not found' }
  }

  const requiredPermission = ACTION_PERMISSION_MAP[action]

  // Deny by default for unmapped actions (safety-critical robotics)
  if (!requiredPermission) {
    appendAuditLog(auditDb, {
      userId: user.id,
      userRole: user.role,
      action,
      params,
      result: 'denied',
      reason: `Action '${action}' not in permission map — denied by default`,
    })
    return { allowed: false, reason: `Forbidden: action '${action}' is not permitted`, user }
  }

  if (!hasPermission(user.role, requiredPermission)) {
    appendAuditLog(auditDb, {
      userId: user.id,
      userRole: user.role,
      action,
      params,
      result: 'denied',
      reason: `Role '${user.role}' lacks permission '${requiredPermission}'`,
    })
    return {
      allowed: false,
      reason: `Forbidden: role '${user.role}' cannot perform '${action}'`,
      user,
    }
  }

  return { allowed: true, user }
}

/**
 * Log a successful command execution to audit trail.
 */
export function auditCommand(
  auditDb: Database,
  userId: string,
  userRole: string,
  action: string,
  params?: Record<string, unknown>
): void {
  appendAuditLog(auditDb, {
    userId,
    userRole,
    action,
    params,
    result: 'ok',
  })
}
