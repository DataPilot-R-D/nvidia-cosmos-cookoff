/**
 * useGlobalHotkeys — global keyboard shortcuts for the dashboard.
 *
 * ? = help overlay, Ctrl+K = command palette, Escape = close panels,
 * N = new module (open tray), 1-9 = switch tabs
 */

import { useEffect } from 'react'
import { useTabStore } from '@/lib/stores/tab-store'
import { useNotificationStore } from '@/lib/stores/notification-store'

interface HotkeyHandlers {
  onHelp: () => void
  onCommandPalette: () => void
  onNewModule: () => void
}

export function useGlobalHotkeys({ onHelp, onCommandPalette, onNewModule }: HotkeyHandlers): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      // Skip when typing in inputs
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable
      ) {
        // Allow Escape and Ctrl+K even in inputs
        if (e.key !== 'Escape' && !(e.key === 'k' && (e.metaKey || e.ctrlKey))) return
      }

      // Ctrl+K / Cmd+K = command palette
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onCommandPalette()
        return
      }

      // Escape = close panels
      if (e.key === 'Escape') {
        useNotificationStore.getState().setPanel(false)
        return
      }

      // ? = help overlay
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        onHelp()
        return
      }

      // N = new module
      if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        onNewModule()
        return
      }

      // 1-9 = switch tabs
      if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const index = parseInt(e.key) - 1
        const tabs = useTabStore.getState().tabs
        if (index < tabs.length) {
          useTabStore.getState().switchTab(tabs[index].id)
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onHelp, onCommandPalette, onNewModule])
}
