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

// ── Permission Matrix ────────────────────────────────────

type Permission =
  | 'teleop'
  | 'navigation'
  | 'estop'
  | 'camera:control'
  | 'map:set-goal'
  | 'incident:manage'
  | 'settings:edit'

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    'teleop',
    'navigation',
    'estop',
    'camera:control',
    'map:set-goal',
    'incident:manage',
    'settings:edit',
  ]),
  operator: new Set<Permission>([
    'teleop',
    'navigation',
    'estop',
    'camera:control',
    'map:set-goal',
  ]),
  viewer: new Set<Permission>([]),
}

// Map socket event names → required permission
const ACTION_PERMISSION_MAP: Record<string, Permission> = {
  teleop: 'teleop',
  cmd_vel: 'teleop',
  nav_goal: 'navigation',
  navigate: 'navigation',
  estop: 'estop',
  e_stop: 'estop',
  camera_control: 'camera:control',
  map_set_goal: 'map:set-goal',
  incident_manage: 'incident:manage',
  settings_edit: 'settings:edit',
  set_rosbridge_url: 'settings:edit',
  alert: 'estop',
}

function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}

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
