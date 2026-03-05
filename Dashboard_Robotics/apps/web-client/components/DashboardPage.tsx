/**
 * Security Robot Command Center - Dashboard
 *
 * High-Contrast Liquid Glass Dashboard with Universal Window System.
 * Features:
 * - Glass-styled window frames (dark header, light body)
 * - FAB for adding new panels
 * - Collapsible side menu with layout management
 * - Dynamic Tab System with state isolation per tab
 *
 * Design: High-Contrast Liquid Glass System
 * @see DashboardShell, GenericWindow, useTabStore
 */

'use client'

import React, { useEffect, useCallback, useMemo } from 'react'
import {
  Responsive,
  useContainerWidth,
  verticalCompactor,
  type Layout,
  type LayoutItem,
  type ResponsiveLayouts,
} from 'react-grid-layout'
import { GenericWindow, type ModuleType, isValidModuleType } from '@/components/widgets'
import { ModuleErrorBoundary } from '@/components/ui/ModuleErrorBoundary'
import { DashboardShell } from '@/components/shell'
import { ProtectedRoute } from '@/components/auth'
import { RESIZE_HANDLES_ALL } from '@/components/dashboard'
import { useTabStore } from '@/lib/stores'
import { useWebSocket } from '@/lib/hooks'
import { getHostname } from '@/lib/utils/get-hostname'

import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

// =============================================================================
// Constants
// =============================================================================

// Grid configuration constants
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480 }
const COLS = { lg: 12, md: 10, sm: 6, xs: 4 }
const ROW_HEIGHT = 60
const MARGIN: [number, number] = [8, 8]

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate unique widget ID with timestamp
 */
const generateWidgetId = (): string =>
  `widget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

// =============================================================================
// Page Component
// =============================================================================

export default function DashboardPage() {
  // Container width for responsive grid
  const { width, mounted, containerRef } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 1280,
  })

  // WebSocket connection - URL is managed by websocket-store
  // Avoid `localhost` defaults (remote users would connect to themselves).
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || `http://${getHostname()}:8081`
  useWebSocket(wsUrl)

  // Tab Store selectors (state isolation per tab)
  const activeTabId = useTabStore((state) => state.activeTabId)
  // Use direct selector instead of getActiveTab() method to avoid creating new object reference on each render
  const activeTab = useTabStore((state) => state.tabs.find((t) => t.id === state.activeTabId))
  const tabs = useTabStore((state) => state.tabs)
  const hasHydrated = useTabStore((state) => state.hasHydrated)
  const addWidget = useTabStore((state) => state.addWidget)
  const removeWidget = useTabStore((state) => state.removeWidget)
  const updateWidgetModule = useTabStore((state) => state.updateWidgetModule)
  const updateTabLayout = useTabStore((state) => state.updateTabLayout)

  // Get widgets and layout from active tab (isolated state)
  const widgets = useMemo(() => activeTab?.widgets ?? [], [activeTab?.widgets])
  const tabLayout = useMemo(() => activeTab?.layout ?? [], [activeTab?.layout])

  // Create initial tab if none exists AFTER hydration completes
  // This prevents race condition: effect running before localStorage data is loaded
  useEffect(() => {
    // Wait for Zustand persist hydration to complete
    if (!hasHydrated) return

    // After hydration, check if tabs exist (use getState for current value)
    const currentTabs = useTabStore.getState().tabs
    if (currentTabs.length === 0) {
      useTabStore.getState().addTab('Główny Widok')
    }
  }, [hasHydrated])

  // Handle layout changes - persist to active tab
  const handleLayoutChange = useCallback(
    (currentLayout: Layout, _allLayouts: Partial<Record<string, Layout>>) => {
      if (activeTabId && currentLayout.length > 0) {
        // Convert Layout to TabLayoutItem[] format
        const layoutItems: LayoutItem[] = currentLayout.map((item) => ({
          i: item.i,
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          minW: item.minW,
          minH: item.minH,
          maxW: item.maxW,
          maxH: item.maxH,
        }))
        updateTabLayout(activeTabId, layoutItems)
      }
    },
    [activeTabId, updateTabLayout]
  )

  // Handle window close - remove widget from active tab
  const handleWindowClose = useCallback(
    (windowId: string) => {
      if (activeTabId) {
        removeWidget(activeTabId, windowId)
      }
    },
    [activeTabId, removeWidget]
  )

  // Handle module change - update widget in active tab
  const handleModuleChange = useCallback(
    (windowId: string, moduleType: ModuleType) => {
      if (activeTabId) {
        updateWidgetModule(activeTabId, windowId, moduleType)
      }
    },
    [activeTabId, updateWidgetModule]
  )

  // Handle adding new panel from drag & drop - add widget to active tab
  const handleAddPanel = useCallback(
    (moduleType: string) => {
      // Validate module type before adding
      if (!isValidModuleType(moduleType)) {
        return
      }

      if (!activeTabId) {
        return
      }

      const newWidgetId = generateWidgetId()

      // Add widget to active tab's isolated state
      addWidget(activeTabId, {
        id: newWidgetId,
        moduleType,
      })
    },
    [activeTabId, addWidget]
  )

  // Handle drag over - allow drop
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  // Handle drop - create widget from dragged module
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const moduleType = e.dataTransfer.getData('moduleType')
      if (moduleType) {
        handleAddPanel(moduleType)
      }
    },
    [handleAddPanel]
  )

  // Handle tab change - just trigger re-render (state is already in store)
  const handleTabChange = useCallback((_tabId: string) => {
    // Tab state is managed by useTabStore
    // The component will re-render with new activeTab data
  }, [])

  // Generate layouts for all breakpoints from active tab's layout
  const responsiveLayouts = useMemo((): ResponsiveLayouts => {
    if (tabLayout.length === 0) {
      return { lg: [], md: [], sm: [], xs: [] }
    }

    const lgItems: LayoutItem[] = tabLayout.map((item) => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: item.minW || 2,
      minH: item.minH || 2,
      maxW: item.maxW,
      maxH: item.maxH,
    }))

    // Medium: 2 columns, clamp width
    const mdItems: LayoutItem[] = lgItems.map((item, idx) => ({
      ...item,
      x: (idx % 2) * 5,
      w: Math.min(item.w, 5),
    }))

    // Small: 2 columns
    const smItems: LayoutItem[] = lgItems.map((item, idx) => ({
      ...item,
      x: (idx % 2) * 3,
      w: 3,
    }))

    // Mobile: single column, full width
    const xsItems: LayoutItem[] = lgItems.map((item) => ({
      ...item,
      x: 0,
      w: 4,
      minW: 1,
    }))

    return {
      lg: lgItems,
      md: mdItems,
      sm: smItems,
      xs: xsItems,
    }
  }, [tabLayout])

  // Grid children (memoized) - render widgets from active tab
  const gridChildren = useMemo(
    () =>
      widgets.map((widget) => (
        <div key={widget.id} className="h-full">
          <ModuleErrorBoundary moduleId={widget.id} moduleName={widget.moduleType}>
            <GenericWindow
              windowId={widget.id}
              initialModule={widget.moduleType as ModuleType}
              onClose={() => handleWindowClose(widget.id)}
              onModuleChange={handleModuleChange}
            />
          </ModuleErrorBoundary>
        </div>
      )),
    [widgets, handleWindowClose, handleModuleChange]
  )

  // Empty state message when no widgets in active tab
  const hasWidgets = widgets.length > 0

  // Workaround: useContainerWidth's `mounted` flag requires a successful
  // measureWidth() call but the ResizeObserver fires asynchronously.
  // In some environments (headless, SSR hydration race) `mounted` stays
  // false even though the container has non-zero dimensions.
  // Use a simple client-side mount flag as fallback so the grid renders.
  const [clientMounted, setClientMounted] = React.useState(false)
  React.useEffect(() => {
    setClientMounted(true)
  }, [])
  const effectiveMounted = mounted || clientMounted

  return (
    <ProtectedRoute>
      <DashboardShell onTabChange={handleTabChange} onAddModule={handleAddPanel}>
        {/* Main Content - Responsive Grid with Drop Zone */}
        <div
          ref={containerRef as React.RefObject<HTMLDivElement>}
          className="h-full w-full p-3 overflow-auto"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {effectiveMounted && hasWidgets && (
            <Responsive
              key={`grid-${widgets.length}`}
              className="layout"
              width={width}
              layouts={responsiveLayouts}
              breakpoints={BREAKPOINTS}
              cols={COLS}
              rowHeight={ROW_HEIGHT}
              margin={MARGIN}
              containerPadding={[0, 0]}
              dragConfig={{ enabled: true, handle: '.widget-drag-handle' }}
              resizeConfig={{ enabled: true, handles: RESIZE_HANDLES_ALL }}
              onLayoutChange={handleLayoutChange}
              compactor={verticalCompactor}
            >
              {gridChildren}
            </Responsive>
          )}

          {/* Empty State - Show when no widgets in active tab */}
          {effectiveMounted && !hasWidgets && activeTab && (
            <div className="flex flex-col items-center justify-center h-full text-white/60">
              <div className="glass-dark p-8 rounded-lg text-center max-w-md">
                <svg
                  className="w-16 h-16 mx-auto mb-4 text-orange-500/60"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18M9 21V9" />
                </svg>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Brak paneli w widoku &quot;{activeTab.name}&quot;
                </h3>
                <p className="text-sm text-white/50 mb-4">
                  Kliknij + w prawym dolnym rogu i przeciągnij widget tutaj.
                </p>
                <p className="text-xs text-white/30">
                  Każda zakładka ma własną, niezależną konfigurację paneli.
                </p>
              </div>
            </div>
          )}

          {/* Loading State - No active tab */}
          {effectiveMounted && !activeTab && tabs.length === 0 && (
            <div className="flex items-center justify-center h-full text-white/60">
              <div className="glass-dark p-8 rounded-lg text-center">
                <p>Tworzenie pierwszej zakładki...</p>
              </div>
            </div>
          )}
        </div>
      </DashboardShell>
    </ProtectedRoute>
  )
}
