'use client'

import { useState, useCallback } from 'react'

export type MobileTab = 'dashboard' | 'controls' | 'camera' | 'map' | 'settings'

interface MobileBottomNavProps {
  activeTab: MobileTab
  onTabChange: (tab: MobileTab) => void
}

const TABS: { id: MobileTab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'controls', label: 'Controls', icon: '🎮' },
  { id: 'camera', label: 'Camera', icon: '📷' },
  { id: 'map', label: 'Map', icon: '🗺️' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

/**
 * Bottom navigation bar for mobile layout.
 * Only visible on small screens (< 768px via CSS).
 */
export function MobileBottomNav({ activeTab, onTabChange }: MobileBottomNavProps) {
  return (
    <nav
      data-testid="mobile-bottom-nav"
      className="fixed bottom-0 left-0 right-0 z-30 flex h-14 items-center justify-around border-t border-white/10 bg-tactical-950/95 backdrop-blur-sm md:hidden"
    >
      {TABS.map((tab) => (
        <button
          key={tab.id}
          data-testid={`nav-tab-${tab.id}`}
          onClick={() => onTabChange(tab.id)}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-xs transition-colors ${
            activeTab === tab.id ? 'text-cyan-400' : 'text-gray-500 active:text-gray-300'
          }`}
          aria-label={tab.label}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          <span className="text-lg">{tab.icon}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}

/** Hook for mobile tab state */
export function useMobileTab() {
  const [activeTab, setActiveTab] = useState<MobileTab>('dashboard')
  const onTabChange = useCallback((tab: MobileTab) => setActiveTab(tab), [])
  return { activeTab, onTabChange }
}
