'use client'

import { useEffect, useState, useCallback } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Shows an install banner when the browser fires `beforeinstallprompt`.
 * Dismissable — stores choice so it won't nag again this session.
 */
export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setDeferredPrompt(null)
    }
  }, [deferredPrompt])

  const handleDismiss = useCallback(() => {
    setDismissed(true)
    setDeferredPrompt(null)
  }, [])

  if (!deferredPrompt || dismissed) return null

  return (
    <div
      role="banner"
      data-testid="pwa-install-prompt"
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-md items-center justify-between rounded-lg border border-cyan-800/50 bg-tactical-900/95 px-4 py-3 shadow-lg backdrop-blur-sm"
    >
      <span className="text-sm text-gray-200">Install app for offline access</span>
      <div className="flex gap-2">
        <button
          onClick={handleDismiss}
          className="rounded px-3 py-1 text-xs text-gray-400 hover:text-gray-200"
        >
          Later
        </button>
        <button
          onClick={handleInstall}
          data-testid="pwa-install-button"
          className="rounded bg-cyan-600 px-3 py-1 text-xs font-medium text-white hover:bg-cyan-500"
        >
          Install
        </button>
      </div>
    </div>
  )
}
