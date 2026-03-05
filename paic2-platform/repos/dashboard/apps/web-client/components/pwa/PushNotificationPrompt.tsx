'use client'

import { useEffect, useState, useCallback } from 'react'

type PermissionState = 'default' | 'granted' | 'denied'

/**
 * Push notification permission prompt.
 * Shows a banner asking to enable notifications (only when permission = 'default').
 * Actual push subscription happens server-side — this just requests browser permission.
 */
export function PushNotificationPrompt() {
  const [permission, setPermission] = useState<PermissionState>('granted')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('Notification' in window)) return
    setPermission(Notification.permission as PermissionState)
  }, [])

  const handleEnable = useCallback(async () => {
    if (!('Notification' in window)) return
    const result = await Notification.requestPermission()
    setPermission(result as PermissionState)
  }, [])

  const handleDismiss = useCallback(() => {
    // Don't ask again this session
    setPermission('denied')
  }, [])

  if (permission !== 'default') return null

  return (
    <div
      data-testid="push-notification-prompt"
      className="fixed top-14 left-4 right-4 z-40 mx-auto flex max-w-md items-center justify-between rounded-lg border border-cyan-800/50 bg-tactical-900/95 px-4 py-3 shadow-lg backdrop-blur-sm"
    >
      <span className="text-sm text-gray-200">Enable alert notifications?</span>
      <div className="flex gap-2">
        <button
          onClick={handleDismiss}
          className="rounded px-3 py-1 text-xs text-gray-400 hover:text-gray-200"
        >
          Later
        </button>
        <button
          onClick={handleEnable}
          data-testid="push-enable-button"
          className="rounded bg-cyan-600 px-3 py-1 text-xs font-medium text-white hover:bg-cyan-500"
        >
          Enable
        </button>
      </div>
    </div>
  )
}
