/**
 * usePermission Hook
 *
 * RBAC permission checking based on user role.
 * - admin: all access
 * - operator: teleop, navigation, cameras, map
 * - viewer: read-only (no controls, no nav goals, no e-stop)
 */

import { useMemo } from 'react'
import { useAuthStore, type UserRole } from '@/lib/stores/auth-store'

// =============================================================================
// Permission Types
// =============================================================================

export type Permission =
  | 'teleop'
  | 'navigation'
  | 'estop'
  | 'camera:control'
  | 'map:set-goal'
  | 'incident:manage'
  | 'settings:edit'
  | 'tab:manage'

// =============================================================================
// Role → Permission Matrix
// =============================================================================

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  admin: new Set<Permission>([
    'teleop',
    'navigation',
    'estop',
    'camera:control',
    'map:set-goal',
    'incident:manage',
    'settings:edit',
    'tab:manage',
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

// =============================================================================
// Pure helpers (testable without React)
// =============================================================================

export function hasPermission(role: UserRole | undefined, permission: Permission): boolean {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false
}

export function getPermissions(role: UserRole | undefined): ReadonlySet<Permission> {
  if (!role) return new Set()
  return ROLE_PERMISSIONS[role] ?? new Set()
}

// =============================================================================
// Hook
// =============================================================================

export function usePermission(permission: Permission): boolean {
  const role = useAuthStore((s) => s.user?.role)
  return useMemo(() => hasPermission(role, permission), [role, permission])
}

export function usePermissions(): {
  can: (permission: Permission) => boolean
  role: UserRole | undefined
} {
  const role = useAuthStore((s) => s.user?.role)
  const can = useMemo(() => {
    const perms = getPermissions(role)
    return (p: Permission) => perms.has(p)
  }, [role])
  return { can, role }
}
