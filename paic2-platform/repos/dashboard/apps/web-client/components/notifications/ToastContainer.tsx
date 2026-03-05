/**
 * ToastContainer — renders toast notifications in bottom-right corner.
 */
'use client'

import React, { useCallback } from 'react'
import {
  useNotificationStore,
  type Notification,
  type NotificationLevel,
} from '@/lib/stores/notification-store'

const LEVEL_STYLES: Record<
  NotificationLevel,
  { bg: string; border: string; icon: string; text: string }
> = {
  info: { bg: 'bg-cyan-900/90', border: 'border-cyan-500/30', icon: 'ℹ️', text: 'text-cyan-300' },
  success: {
    bg: 'bg-green-900/90',
    border: 'border-green-500/30',
    icon: '✅',
    text: 'text-green-300',
  },
  warning: {
    bg: 'bg-yellow-900/90',
    border: 'border-yellow-500/30',
    icon: '⚠️',
    text: 'text-yellow-300',
  },
  error: { bg: 'bg-red-900/90', border: 'border-red-500/30', icon: '🚨', text: 'text-red-300' },
}

function Toast({
  notification,
  onDismiss,
}: {
  notification: Notification
  onDismiss: (id: string) => void
}) {
  const style = LEVEL_STYLES[notification.level]

  return (
    <div
      className={`${style.bg} ${style.border} border rounded-lg shadow-lg p-3 max-w-xs w-full backdrop-blur-sm animate-slide-in`}
      role="alert"
      data-testid={`toast-${notification.id}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm flex-shrink-0">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-medium ${style.text}`}>{notification.title}</div>
          {notification.message && (
            <div className="text-[10px] text-white/50 mt-0.5 truncate">{notification.message}</div>
          )}
        </div>
        <button
          onClick={() => onDismiss(notification.id)}
          className="text-white/30 hover:text-white/60 text-xs flex-shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export function ToastContainer() {
  const toasts = useNotificationStore((s) => s.toasts)
  const dismissToast = useNotificationStore((s) => s.dismissToast)

  const handleDismiss = useCallback(
    (id: string) => {
      dismissToast(id)
    },
    [dismissToast]
  )

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" data-testid="toast-container">
      {toasts.slice(-5).map((t) => (
        <Toast key={t.id} notification={t} onDismiss={handleDismiss} />
      ))}
    </div>
  )
}
