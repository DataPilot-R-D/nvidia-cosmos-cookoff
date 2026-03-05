'use client'

/**
 * RoleBadge Component
 *
 * Displays the current user's role as a colored badge.
 * Designed for the TopBar header area.
 *
 * @see Issue #26 — T2.2 RBAC gating FE
 */

import { type ReactNode } from 'react'
import { useAuthStore, type UserRole } from '@/lib/stores/auth-store'

// =============================================================================
// Constants
// =============================================================================

const ROLE_CONFIG: Record<UserRole, { label: string; color: string }> = {
  admin: {
    label: 'ADMIN',
    color: 'bg-red-500/20 text-red-400 border-red-500/40',
  },
  operator: {
    label: 'OPERATOR',
    color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
  },
  viewer: {
    label: 'VIEWER',
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/40',
  },
}

// =============================================================================
// Component
// =============================================================================

export function RoleBadge(): ReactNode {
  const role = useAuthStore((s) => s.user?.role)

  if (!role) return null

  const config = ROLE_CONFIG[role]

  return (
    <span
      className={`px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider rounded border ${config.color}`}
      data-testid="role-badge"
      title={`Role: ${config.label}`}
    >
      {config.label}
    </span>
  )
}
