'use client'

/**
 * ProtectedAction Component
 *
 * Reusable RBAC wrapper that gates children behind a permission check.
 * Shows disabled state + tooltip for unauthorized users.
 *
 * @see Issue #26 — T2.2 RBAC gating FE
 */

import { type ReactNode, type ReactElement, cloneElement, isValidElement } from 'react'
import { usePermission, type Permission } from '@/lib/hooks/use-permission'

// =============================================================================
// Types
// =============================================================================

export interface ProtectedActionProps {
  /** Required permission to enable the action */
  permission: Permission
  /** Content to render (buttons, controls, etc.) */
  children: ReactNode
  /** Custom message shown when unauthorized (tooltip) */
  fallbackMessage?: string
  /** If true, hide children entirely instead of disabling */
  hide?: boolean
}

// =============================================================================
// Component
// =============================================================================

export function ProtectedAction({
  permission,
  children,
  fallbackMessage = 'Insufficient permissions',
  hide = false,
}: ProtectedActionProps): ReactNode {
  const allowed = usePermission(permission)

  if (allowed) {
    return children
  }

  if (hide) {
    return null
  }

  // Wrap children in a disabled container with tooltip
  if (isValidElement(children)) {
    const child = children as ReactElement<Record<string, unknown>>
    return (
      <span title={fallbackMessage} className="inline-block cursor-not-allowed">
        {cloneElement(child, {
          disabled: true,
          'aria-disabled': true,
          className:
            `${(child.props.className as string) ?? ''} opacity-50 pointer-events-none`.trim(),
        })}
      </span>
    )
  }

  // Fallback for non-element children
  return (
    <span
      title={fallbackMessage}
      className="inline-block opacity-50 cursor-not-allowed"
      aria-disabled
    >
      {children}
    </span>
  )
}
