'use client'

import { useMemo } from 'react'
import { useWebSocketStore } from '@/lib/stores'

/**
 * Shows a top banner when the WebSocket connection is offline or reconnecting.
 * Renders nothing when connected.
 */
export function ConnectionBanner() {
  const status = useWebSocketStore((s) => s.status)

  const banner = useMemo(() => {
    if (status === 'disconnected' || status === 'error')
      return { text: '⚠ Offline — commands will be queued', color: 'bg-amber-700' }
    if (status === 'connecting' || status === 'reconnecting')
      return { text: '⟳ Reconnecting…', color: 'bg-yellow-700' }
    return null
  }, [status])

  if (!banner) return null

  return (
    <div
      role="status"
      data-testid="connection-banner"
      className={`fixed top-0 left-0 right-0 z-50 px-4 py-2 text-center text-sm font-medium text-white ${banner.color}`}
    >
      {banner.text}
    </div>
  )
}
