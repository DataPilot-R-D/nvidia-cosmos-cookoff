'use client'

import { MobileBottomNav, useMobileTab } from './MobileBottomNav'
import { useIsMobile } from '@/lib/hooks/use-media-query'

/**
 * Mobile-only shell: bottom nav + padding for nav bar.
 * Renders nothing on desktop (md+).
 */
export function MobileShell() {
  const isMobile = useIsMobile()
  const { activeTab, onTabChange } = useMobileTab()

  if (!isMobile) return null

  return <MobileBottomNav activeTab={activeTab} onTabChange={onTabChange} />
}
