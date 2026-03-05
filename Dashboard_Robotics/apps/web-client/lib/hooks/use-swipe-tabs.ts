/**
 * useSwipeTabs — swipe left/right to switch tabs on touch devices.
 */

import { useEffect, useRef } from 'react'
import { useTabStore } from '@/lib/stores/tab-store'

const MIN_SWIPE_DISTANCE = 50

export function useSwipeTabs(): void {
  const startX = useRef(0)
  const startY = useRef(0)

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX
      startY.current = e.touches[0].clientY
    }

    const handleTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current
      const dy = e.changedTouches[0].clientY - startY.current

      // Only horizontal swipes (not scrolling)
      if (Math.abs(dx) < MIN_SWIPE_DISTANCE || Math.abs(dy) > Math.abs(dx)) return

      const { tabs, activeTabId } = useTabStore.getState()
      if (tabs.length < 2) return

      const currentIdx = tabs.findIndex((t) => t.id === activeTabId)
      if (currentIdx < 0) return

      if (dx < 0 && currentIdx < tabs.length - 1) {
        // Swipe left → next tab
        useTabStore.getState().switchTab(tabs[currentIdx + 1].id)
      } else if (dx > 0 && currentIdx > 0) {
        // Swipe right → prev tab
        useTabStore.getState().switchTab(tabs[currentIdx - 1].id)
      }
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])
}
