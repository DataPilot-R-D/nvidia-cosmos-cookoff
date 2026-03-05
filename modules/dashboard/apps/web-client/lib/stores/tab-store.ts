/**
 * Tab Store
 *
 * Zustand store for managing dynamic sidebar tabs.
 * Uses persist middleware for localStorage persistence.
 *
 * Features:
 * - CRUD operations for tabs
 * - Layout persistence per tab
 * - Auto-activation of first tab
 * - Tab reordering support
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { z } from 'zod'

// =============================================================================
// Constants
// =============================================================================

const MAX_TAB_NAME_LENGTH = 50

// =============================================================================
// Zod Schemas for Validation
// =============================================================================

const TabLayoutItemSchema = z.object({
  i: z.string(),
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  minW: z.number().optional(),
  minH: z.number().optional(),
  maxW: z.number().optional(),
  maxH: z.number().optional(),
})

const WidgetConfigSchema = z.object({
  id: z.string(),
  moduleType: z.string(),
})

const TabSchema = z.object({
  id: z.string(),
  name: z.string().max(MAX_TAB_NAME_LENGTH),
  layout: z.array(TabLayoutItemSchema),
  widgets: z.array(WidgetConfigSchema),
  createdAt: z.number(),
})

const StoredStateSchema = z.object({
  tabs: z.array(TabSchema),
  activeTabId: z.string().nullable(),
  nextId: z.number(),
  nextWidgetId: z.number(),
})

// =============================================================================
// Types
// =============================================================================

/**
 * Layout item stored in each tab
 * Simplified version of react-grid-layout's LayoutItem
 */
export interface TabLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
}

/**
 * Widget configuration for each window
 */
export interface WidgetConfig {
  /** Unique identifier for the widget */
  id: string
  /** Module type displayed in this widget */
  moduleType: string
}

/**
 * Tab configuration
 */
export interface Tab {
  /** Unique identifier for the tab */
  id: string
  /** Display name of the tab */
  name: string
  /** Layout configuration for windows in this tab */
  layout: TabLayoutItem[]
  /** Widgets (windows) in this tab - each tab has isolated widget list */
  widgets: WidgetConfig[]
  /** Timestamp when tab was created */
  createdAt: number
}

/**
 * Tab Store State Interface
 */
export interface TabStoreState {
  /** List of all tabs */
  tabs: Tab[]
  /** Currently active tab ID */
  activeTabId: string | null
  /** Counter for generating unique tab IDs */
  nextId: number
  /** Counter for generating unique widget IDs */
  nextWidgetId: number
  /** Flag indicating hydration from localStorage is complete */
  hasHydrated: boolean
}

/**
 * Tab Store Actions Interface
 */
export interface TabStoreActions {
  /** Add a new tab with optional custom name */
  addTab: (name?: string) => void
  /** Rename an existing tab */
  renameTab: (id: string, name: string) => void
  /** Switch to a different tab */
  switchTab: (id: string) => void
  /** Delete a tab by ID */
  deleteTab: (id: string) => void
  /** Update layout for a specific tab */
  updateTabLayout: (id: string, layout: TabLayoutItem[]) => void
  /** Get the currently active tab */
  getActiveTab: () => Tab | undefined
  /** Duplicate an existing tab */
  duplicateTab: (id: string) => void
  /** Reorder tabs by moving from one index to another */
  reorderTabs: (fromIndex: number, toIndex: number) => void
  /** Add a widget to a specific tab (state isolation) */
  addWidget: (tabId: string, widget: WidgetConfig) => void
  /** Remove a widget from a specific tab */
  removeWidget: (tabId: string, widgetId: string) => void
  /** Get widgets for the currently active tab */
  getActiveTabWidgets: () => WidgetConfig[]
  /** Update the module type of a widget */
  updateWidgetModule: (tabId: string, widgetId: string, moduleType: string) => void
}

// =============================================================================
// Initial State
// =============================================================================

const initialState: TabStoreState = {
  tabs: [],
  activeTabId: null,
  nextId: 1,
  nextWidgetId: 1,
  hasHydrated: false,
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique tab ID
 */
const generateTabId = (nextId: number): string => `tab-${nextId}-${Date.now()}`

/**
 * Generate a unique widget ID
 */
const generateWidgetId = (nextId: number): string => `widget-${nextId}-${Date.now()}`

/**
 * Validate and sanitize tab name
 * - Trims whitespace
 * - Escapes HTML entities (defense-in-depth for third-party library usage)
 * - Limits to MAX_TAB_NAME_LENGTH characters
 * - Returns default if empty
 */
const sanitizeTabName = (name: string, defaultName = 'Nowy Widok'): string => {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    return defaultName
  }
  // Escape HTML entities for defense-in-depth
  const escaped = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
  return escaped.slice(0, MAX_TAB_NAME_LENGTH)
}

// =============================================================================
// Store Implementation
// =============================================================================

/**
 * Tab Store
 *
 * Manages dynamic sidebar tabs with CRUD operations and persistence.
 *
 * @example
 * ```tsx
 * // In a component
 * const tabs = useTabStore((state) => state.tabs)
 * const activeTab = useTabStore((state) => state.getActiveTab())
 * const { addTab, switchTab, deleteTab } = useTabStore.getState()
 *
 * // Add a new tab
 * addTab('Mój Widok')
 *
 * // Switch to a tab
 * switchTab(tabId)
 *
 * // Delete a tab
 * deleteTab(tabId)
 * ```
 */
export const useTabStore = create<TabStoreState & TabStoreActions>()(
  persist(
    (set, get) => ({
      // State
      ...initialState,

      // Actions
      addTab: (name?: string) => {
        const state = get()
        const newId = generateTabId(state.nextId)
        const sanitizedName = sanitizeTabName(name || 'Nowy Widok')

        const newTab: Tab = {
          id: newId,
          name: sanitizedName,
          layout: [],
          widgets: [], // Each tab starts with empty widgets (state isolation)
          createdAt: Date.now(),
        }

        // Auto-activate first tab
        const shouldActivate = state.tabs.length === 0

        set({
          tabs: [...state.tabs, newTab],
          activeTabId: shouldActivate ? newId : state.activeTabId,
          nextId: state.nextId + 1,
        })
      },

      renameTab: (id: string, name: string) => {
        const state = get()
        const tabIndex = state.tabs.findIndex((t) => t.id === id)

        if (tabIndex === -1) {
          return
        }

        const sanitizedName = sanitizeTabName(name)

        set({
          tabs: state.tabs.map((tab, index) =>
            index === tabIndex ? { ...tab, name: sanitizedName } : tab
          ),
        })
      },

      switchTab: (id: string) => {
        const state = get()
        const tabExists = state.tabs.some((t) => t.id === id)

        if (!tabExists) {
          return
        }

        set({ activeTabId: id })
      },

      deleteTab: (id: string) => {
        const state = get()
        const tabIndex = state.tabs.findIndex((t) => t.id === id)

        if (tabIndex === -1) {
          return
        }

        const newTabs = state.tabs.filter((t) => t.id !== id)
        let newActiveId = state.activeTabId

        // Handle active tab deletion
        if (state.activeTabId === id) {
          if (newTabs.length === 0) {
            // No tabs left
            newActiveId = null
          } else if (tabIndex < newTabs.length) {
            // Switch to next tab (same index in new array)
            newActiveId = newTabs[tabIndex].id
          } else {
            // Switch to previous tab (last in new array)
            newActiveId = newTabs[newTabs.length - 1].id
          }
        }

        set({
          tabs: newTabs,
          activeTabId: newActiveId,
        })
      },

      updateTabLayout: (id: string, layout: TabLayoutItem[]) => {
        const state = get()
        const tabIndex = state.tabs.findIndex((t) => t.id === id)

        if (tabIndex === -1) {
          return
        }

        set({
          tabs: state.tabs.map((tab, index) => {
            if (index !== tabIndex) return tab

            // Merge: update positions from incoming layout, but preserve
            // layout entries for widgets that aren't in the incoming array
            // (e.g. newly added widgets whose layout hasn't been processed
            // by react-grid-layout yet).
            const incomingIds = new Set(layout.map((l) => l.i))
            const preserved = tab.layout.filter((l) => !incomingIds.has(l.i))

            return { ...tab, layout: [...layout, ...preserved] }
          }),
        })
      },

      getActiveTab: () => {
        const state = get()
        return state.tabs.find((t) => t.id === state.activeTabId)
      },

      duplicateTab: (id: string) => {
        const state = get()
        const originalTab = state.tabs.find((t) => t.id === id)

        if (!originalTab) {
          return
        }

        const newId = generateTabId(state.nextId)
        let widgetIdCounter = state.nextWidgetId

        // Create new widgets with unique IDs (state isolation)
        const duplicatedWidgets: WidgetConfig[] = originalTab.widgets.map((widget) => {
          const newWidgetId = generateWidgetId(widgetIdCounter)
          widgetIdCounter += 1
          return {
            id: newWidgetId,
            moduleType: widget.moduleType,
          }
        })

        // Update layout to use new widget IDs
        const oldToNewIdMap = new Map<string, string>()
        originalTab.widgets.forEach((oldWidget, index) => {
          oldToNewIdMap.set(oldWidget.id, duplicatedWidgets[index].id)
        })

        const duplicatedLayout: TabLayoutItem[] = originalTab.layout.map((layoutItem) => ({
          ...layoutItem,
          i: oldToNewIdMap.get(layoutItem.i) || layoutItem.i,
        }))

        const duplicatedTab: Tab = {
          id: newId,
          name: `${originalTab.name} (kopia)`,
          layout: duplicatedLayout,
          widgets: duplicatedWidgets,
          createdAt: Date.now(),
        }

        set({
          tabs: [...state.tabs, duplicatedTab],
          nextId: state.nextId + 1,
          nextWidgetId: widgetIdCounter,
        })
      },

      reorderTabs: (fromIndex: number, toIndex: number) => {
        const state = get()

        if (
          fromIndex < 0 ||
          fromIndex >= state.tabs.length ||
          toIndex < 0 ||
          toIndex >= state.tabs.length
        ) {
          return
        }

        const newTabs = [...state.tabs]
        const [movedTab] = newTabs.splice(fromIndex, 1)
        newTabs.splice(toIndex, 0, movedTab)

        set({ tabs: newTabs })
      },

      // =======================================================================
      // Widget Management Actions (State Isolation)
      // =======================================================================

      addWidget: (tabId: string, widget: WidgetConfig) => {
        const state = get()
        const tabIndex = state.tabs.findIndex((t) => t.id === tabId)

        if (tabIndex === -1) {
          return
        }

        // Smart auto-placement: find first available grid slot
        const currentTab = state.tabs[tabIndex]
        const GRID_COLS = 12
        const NEW_W = 4
        const NEW_H = 4

        // Build occupancy grid from existing layout
        const isOccupied = (testX: number, testY: number, w: number, h: number): boolean =>
          currentTab.layout.some((item) => {
            const ix = item.x ?? 0
            const iy = item.y ?? 0
            const iw = item.w ?? 4
            const ih = item.h ?? 4
            return testX < ix + iw && testX + w > ix && testY < iy + ih && testY + h > iy
          })

        // Scan row by row, column by column for first open slot
        let placeX = 0
        let placeY = 0
        const maxScanY =
          currentTab.layout.reduce((max, item) => Math.max(max, (item.y ?? 0) + (item.h ?? 4)), 0) +
          NEW_H
        let found = false
        for (let y = 0; y <= maxScanY && !found; y++) {
          for (let x = 0; x <= GRID_COLS - NEW_W; x += NEW_W) {
            if (!isOccupied(x, y, NEW_W, NEW_H)) {
              placeX = x
              placeY = y
              found = true
              break
            }
          }
        }
        if (!found) {
          placeY = maxScanY
        }

        const defaultLayout: TabLayoutItem = {
          i: widget.id,
          x: placeX,
          y: placeY,
          w: NEW_W,
          h: NEW_H,
          minW: 2,
          minH: 2,
        }

        set({
          tabs: state.tabs.map((tab, index) =>
            index === tabIndex
              ? {
                  ...tab,
                  widgets: [...tab.widgets, widget],
                  layout: [...tab.layout, defaultLayout],
                }
              : tab
          ),
        })
      },

      removeWidget: (tabId: string, widgetId: string) => {
        const state = get()
        const tabIndex = state.tabs.findIndex((t) => t.id === tabId)

        if (tabIndex === -1) {
          return
        }

        set({
          tabs: state.tabs.map((tab, index) =>
            index === tabIndex
              ? {
                  ...tab,
                  widgets: tab.widgets.filter((w) => w.id !== widgetId),
                  layout: tab.layout.filter((l) => l.i !== widgetId),
                }
              : tab
          ),
        })
      },

      getActiveTabWidgets: () => {
        const state = get()
        const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
        return activeTab?.widgets || []
      },

      updateWidgetModule: (tabId: string, widgetId: string, moduleType: string) => {
        const state = get()
        const tabIndex = state.tabs.findIndex((t) => t.id === tabId)

        if (tabIndex === -1) {
          return
        }

        set({
          tabs: state.tabs.map((tab, index) =>
            index === tabIndex
              ? {
                  ...tab,
                  widgets: tab.widgets.map((w) => (w.id === widgetId ? { ...w, moduleType } : w)),
                }
              : tab
          ),
        })
      },
    }),
    {
      name: 'tab-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        nextId: state.nextId,
        nextWidgetId: state.nextWidgetId,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Error rehydrating tab storage:', error)
          // Even on error, mark hydration as complete to unblock UI
          if (state) {
            state.hasHydrated = true
          }
          return
        }
        if (state) {
          // Validate the stored data with Zod
          const result = StoredStateSchema.safeParse({
            tabs: state.tabs,
            activeTabId: state.activeTabId,
            nextId: state.nextId,
            nextWidgetId: state.nextWidgetId,
          })
          if (!result.success) {
            console.error('Invalid stored tab state, resetting to defaults:', result.error)
            // Reset to initial state if validation fails
            state.tabs = []
            state.activeTabId = null
            state.nextId = 1
            state.nextWidgetId = 1
          }
          // Mark hydration as complete (CRITICAL: must be after validation)
          state.hasHydrated = true
        }
      },
    }
  )
)

/**
 * Export store type for testing and typing purposes
 */
export type TabStore = typeof useTabStore

// =============================================================================
// Selectors (use these instead of getActiveTab() method to avoid infinite loops)
// =============================================================================

/**
 * Select the active tab - returns stable reference from tabs array
 * Use this instead of state.getActiveTab() which creates new objects
 */
export const selectActiveTab = (state: TabStoreState & TabStoreActions) =>
  state.tabs.find((t) => t.id === state.activeTabId)

/**
 * Select widgets from the active tab
 */
export const selectActiveTabWidgets = (state: TabStoreState & TabStoreActions) =>
  selectActiveTab(state)?.widgets || []

/**
 * Select layout from the active tab
 */
export const selectActiveTabLayout = (state: TabStoreState & TabStoreActions) =>
  selectActiveTab(state)?.layout || []

/**
 * Select hydration status - true when localStorage data has been loaded
 * Use this to prevent race conditions with initial tab creation
 */
export const selectHasHydrated = (state: TabStoreState & TabStoreActions) => state.hasHydrated
