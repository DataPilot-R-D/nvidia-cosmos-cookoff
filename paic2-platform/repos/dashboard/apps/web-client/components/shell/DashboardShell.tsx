/**
 * DashboardShell Component
 *
 * High-Contrast Liquid Glass Dashboard Shell with:
 * - Fixed Top Navigation Bar with WebSocket status
 * - Collapsible side menu with Toolbox (Drag & Drop)
 * - Layout management (name editing, save layout)
 * - Dynamic Tab System with state isolation
 *
 * @see High-Contrast Liquid Glass Design System
 */

'use client'

import { type ReactNode, useState, useCallback, useEffect } from 'react'

import { useDashboardStore } from '@/lib/stores'
import { SidebarTabs } from './SidebarTabs'
import { TopBar } from './TopBar'
import { Toolbox } from './Toolbox'
import { WidgetTray } from './WidgetTray'
import { HealthIndicator } from './HealthIndicator'
import { ToastContainer } from '@/components/notifications/ToastContainer'
import { useNotificationListeners } from '@/lib/hooks/use-notification-listeners'
import { useGlobalHotkeys } from '@/lib/hooks/use-global-hotkeys'
import { useSwipeTabs } from '@/lib/hooks/use-swipe-tabs'
import { CommandPalette } from './CommandPalette'
import { HelpOverlay } from './HelpOverlay'

// =============================================================================
// Types
// =============================================================================

export interface DashboardShellProps {
  /** Content to render in main area */
  children: ReactNode
  /** Callback when active tab changes */
  onTabChange?: (tabId: string) => void
  /** Callback when a module is clicked in the toolbox (click-to-add) */
  onAddModule?: (moduleType: string) => void
}

// =============================================================================
// Component
// =============================================================================

export function DashboardShell({
  children,
  onTabChange,
  onAddModule,
}: DashboardShellProps): ReactNode {
  const [layoutName, setLayoutNameLocal] = useState('')

  // Notification listeners
  useNotificationListeners()

  // Touch swipe for tab switching
  useSwipeTabs()

  // Global hotkeys
  const [helpOpen, setHelpOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useGlobalHotkeys({
    onHelp: useCallback(() => setHelpOpen((v) => !v), []),
    onCommandPalette: useCallback(() => setPaletteOpen((v) => !v), []),
    onNewModule: useCallback(() => {
      // Open sidebar if closed, tray is always visible
      const store = useDashboardStore.getState()
      if (!store.sidebarOpen) store.toggleSidebar()
    }, []),
  })

  // Store selectors
  const sidebarOpen = useDashboardStore((state) => state.sidebarOpen)
  const activeLayoutId = useDashboardStore((state) => state.activeLayoutId)
  const layouts = useDashboardStore((state) => state.layouts)
  const toggleSidebar = useDashboardStore((state) => state.toggleSidebar)
  const saveLayout = useDashboardStore((state) => state.saveLayout)
  const setLayoutName = useDashboardStore((state) => state.setLayoutName)

  // Get active layout name
  const activeLayout = layouts.find((l) => l.id === activeLayoutId)

  // Sync local layout name with store
  useEffect(() => {
    if (activeLayout) {
      setLayoutNameLocal(activeLayout.name)
    }
  }, [activeLayout])

  const handleSaveLayout = useCallback(() => {
    saveLayout()
  }, [saveLayout])

  const handleLayoutNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawName = e.target.value

      // Validate: max 100 chars, basic sanitization
      const name = rawName.slice(0, 100).trim()

      setLayoutNameLocal(name)
      setLayoutName(name)
    },
    [setLayoutName]
  )

  return (
    <div className="flex flex-col h-screen w-full" data-testid="dashboard-shell">
      {/* Top Navigation Bar - Fixed */}
      <TopBar />

      {/* Main Layout (Sidebar + Content) */}
      <div className="flex flex-1 pt-12">
        {/* Side Menu - Glass Dark */}
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/40 z-30 sm:hidden" onClick={toggleSidebar} />
        )}
        <aside
          className={`side-menu glass-dark ${sidebarOpen ? '' : 'collapsed'} ${sidebarOpen ? 'max-sm:fixed max-sm:z-40 max-sm:h-full' : 'max-sm:hidden'}`}
          data-testid="side-menu"
        >
          {/* Header with Toggle - Darker Glass */}
          <div
            className="side-menu-header glass-dark flex items-center justify-between"
            data-testid="shell-header"
          >
            <span className="menu-label text-white" data-testid="menu-label-title">
              {sidebarOpen ? 'DASHBOARD' : ''}
            </span>
            <button
              className="menu-toggle"
              onClick={toggleSidebar}
              data-testid="menu-toggle"
              aria-label={sidebarOpen ? 'Collapse menu' : 'Expand menu'}
            >
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                {sidebarOpen ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
              </svg>
            </button>
          </div>

          {/* Menu Content - Dynamic Tab System */}
          {sidebarOpen && (
            <div className="side-menu-content">
              <div className="mb-4">
                <span className="menu-label text-white text-xs" data-testid="menu-label-nav">
                  Widoki
                </span>
              </div>
              <SidebarTabs onTabChange={onTabChange} />
            </div>
          )}

          {/* Toolbox - Drag & Drop Modules */}
          <div className="border-t border-white/10 mt-auto">
            <Toolbox isCollapsed={!sidebarOpen} onAddModule={onAddModule} />
          </div>

          {/* Footer - Layout Management */}
          {sidebarOpen && (
            <div className="side-menu-footer space-y-3">
              <div>
                <label className="block text-xs text-white/60 uppercase tracking-wider mb-2">
                  Layout Name
                </label>
                <input
                  type="text"
                  className="layout-name-input"
                  value={layoutName}
                  onChange={handleLayoutNameChange}
                  placeholder="Enter layout name"
                  data-testid="layout-name-input"
                />
              </div>
              <button
                className="save-layout-btn"
                onClick={handleSaveLayout}
                data-testid="save-layout-btn"
              >
                SAVE LAYOUT
              </button>
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <main
          className="flex-1 relative overflow-hidden glass-light"
          role="main"
          data-testid="shell-content"
        >
          {children}

          {/* Widget Tray - FAB + Drag & Drop */}
          <WidgetTray />

          {/* Health Indicator - Connection Status */}
          <HealthIndicator />
        </main>
      </div>

      {/* Toast Notifications */}
      <ToastContainer />

      {/* Command Palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Help Overlay */}
      <HelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

export default DashboardShell
