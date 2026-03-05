'use client'

import { useEffect } from 'react'

/**
 * Registers the custom Service Worker on mount.
 * Renders nothing — purely side-effect component.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // eslint-disable-next-line no-console
        console.log('[SW] registered, scope:', reg.scope)
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[SW] registration failed:', err)
      })
  }, [])

  return null
}
