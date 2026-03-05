/**
 * Dashboard Layout Store
 *
 * Zustand store for managing dashboard layout state.
 * Uses persist middleware for localStorage persistence.
 * Based on design from Pencil (MAPA Dashboard layout).
 *
 * @see packages/shared-types/src/dashboard.ts
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { WidgetConfig, WidgetPosition, DashboardLayout } from '@workspace/shared-types'

// =============================================================================
// Default Widgets Configuration
// =============================================================================

/**
 * Default widgets based on MAPA Dashboard design from Pencil
 *
 * Layout (12-column grid, rowHeight: 60px):
 * - 3D MAP: 6 cols × 8 rows at (0,0)
 * - 2D MAP: 6 cols × 4 rows at (6,0)
 * - LIDAR SCAN: 6 cols × 4 rows at (6,4)
 * - AI CHAT: 4 cols × 4 rows at (0,8)
 * - PRECISION CONTROLS: 8 cols × 4 rows at (4,8)
 */
export const DEFAULT_WIDGETS: WidgetConfig[] = [
  {
    id: 'map-3d',
    type: 'robot_map',
    title: '3D MAP',
    position: { x: 0, y: 0, w: 6, h: 8 },
    visible: true,
    locked: false,
  },
  {
    id: 'map-2d',
    type: 'patrol_routes',
    title: '2D MAP',
    position: { x: 6, y: 0, w: 6, h: 4 },
    visible: true,
    locked: false,
  },
  {
    id: 'lidar-scan',
    type: 'telemetry_chart',
    title: 'LIDAR SCAN',
    position: { x: 6, y: 4, w: 6, h: 4 },
    visible: true,
    locked: false,
  },
  {
    id: 'ai-chat',
    type: 'command_panel',
    title: 'AI CHAT',
    position: { x: 0, y: 8, w: 4, h: 4 },
    visible: true,
    locked: false,
  },
  {
    id: 'precision-controls',
    type: 'robot_detail',
    title: 'PRECISION CONTROLS',
    position: { x: 4, y: 8, w: 8, h: 4 },
    visible: true,
    locked: false,
  },
]

/**
 * Default layout configuration
 */
export const DEFAULT_LAYOUT: DashboardLayout = {
  id: 'default',
  name: 'MAPA Dashboard',
  widgets: DEFAULT_WIDGETS,
  columns: 12,
  rowHeight: 60,
  isDefault: true,
}

// =============================================================================
// Store State Interface
// =============================================================================

/**
 * Dashboard Layout Store State Interface
 *
 * Represents the current state of the dashboard layout.
 */
export interface DashboardLayoutState {
  /** Current widgets configuration */
  widgets: WidgetConfig[]
  /** Active layout ID */
  activeLayoutId: string
  /** Currently selected robot ID */
  selectedRobotId: string | null
  /** Whether sidebar is open */
  sidebarOpen: boolean
  /** Whether command panel is open */
  commandPanelOpen: boolean
  /** Available layouts */
  layouts: DashboardLayout[]
}

/**
 * Dashboard Layout Store Actions Interface
 *
 * Actions for managing dashboard layout state.
 */
export interface DashboardLayoutActions {
  /** Update widget position */
  updateWidgetPosition: (id: string, position: WidgetPosition) => void
  /** Toggle widget visibility */
  toggleWidgetVisibility: (id: string) => void
  /** Set widget visibility explicitly */
  setWidgetVisibility: (id: string, visible: boolean) => void
  /** Set selected robot ID */
  setSelectedRobot: (robotId: string | null) => void
  /** Clear selected robot */
  clearSelectedRobot: () => void
  /** Toggle sidebar open/closed */
  toggleSidebar: () => void
  /** Set sidebar open state */
  setSidebarOpen: (open: boolean) => void
  /** Toggle command panel open/closed */
  toggleCommandPanel: () => void
  /** Set command panel open state */
  setCommandPanelOpen: (open: boolean) => void
  /** Reset layout to default */
  resetLayout: () => void
  /** Set active layout ID */
  setActiveLayout: (layoutId: string) => void
  /** Get widget by ID */
  getWidgetById: (id: string) => WidgetConfig | undefined
  /** Get all visible widgets */
  getVisibleWidgets: () => WidgetConfig[]
  /** Add a new widget */
  addWidget: (widget: WidgetConfig) => void
  /** Remove a widget by ID */
  removeWidget: (id: string) => void
  /** Save current layout to localStorage */
  saveLayout: () => void
  /** Set layout name for active layout */
  setLayoutName: (name: string) => void
  /** Get active layout */
  getActiveLayout: () => DashboardLayout | undefined
}

// =============================================================================
// Initial State
// =============================================================================

/**
 * Initial state for the Dashboard store
 */
const initialState: DashboardLayoutState = {
  widgets: [...DEFAULT_WIDGETS],
  activeLayoutId: 'default',
  selectedRobotId: null,
  sidebarOpen: true,
  commandPanelOpen: false,
  layouts: [{ ...DEFAULT_LAYOUT }],
}

// =============================================================================
// Store Implementation
// =============================================================================

/**
 * Dashboard Layout Store
 *
 * Manages the dashboard layout state with persistence to localStorage.
 * Based on MAPA Dashboard design from Pencil.
 *
 * @example
 * ```tsx
 * // In a component
 * const widgets = useDashboardStore((state) => state.widgets)
 * const { updateWidgetPosition, toggleSidebar } = useDashboardStore.getState()
 *
 * // Get visible widgets only
 * const visible = useDashboardStore((state) => state.getVisibleWidgets())
 *
 * // Check sidebar state
 * const isOpen = useDashboardStore((state) => state.sidebarOpen)
 * ```
 */
export const useDashboardStore = create<DashboardLayoutState & DashboardLayoutActions>()(
  persist(
    (set, get) => ({
      // State
      ...initialState,

      // Actions
      updateWidgetPosition: (id: string, position: WidgetPosition) =>
        set((state) => {
          const widgetIndex = state.widgets.findIndex((w) => w.id === id)
          if (widgetIndex === -1) {
            return state
          }
          const newWidgets = state.widgets.map((widget, index) =>
            index === widgetIndex ? { ...widget, position: { ...position } } : widget
          )
          return { widgets: newWidgets }
        }),

      toggleWidgetVisibility: (id: string) =>
        set((state) => {
          const widgetIndex = state.widgets.findIndex((w) => w.id === id)
          if (widgetIndex === -1) {
            return state
          }
          const newWidgets = state.widgets.map((widget, index) =>
            index === widgetIndex ? { ...widget, visible: !widget.visible } : widget
          )
          return { widgets: newWidgets }
        }),

      setWidgetVisibility: (id: string, visible: boolean) =>
        set((state) => {
          const widgetIndex = state.widgets.findIndex((w) => w.id === id)
          if (widgetIndex === -1) {
            return state
          }
          const newWidgets = state.widgets.map((widget, index) =>
            index === widgetIndex ? { ...widget, visible } : widget
          )
          return { widgets: newWidgets }
        }),

      setSelectedRobot: (robotId: string | null) => set({ selectedRobotId: robotId }),

      clearSelectedRobot: () => set({ selectedRobotId: null }),

      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),

      toggleCommandPanel: () => set((state) => ({ commandPanelOpen: !state.commandPanelOpen })),

      setCommandPanelOpen: (open: boolean) => set({ commandPanelOpen: open }),

      resetLayout: () =>
        set({
          widgets: [...DEFAULT_WIDGETS],
          activeLayoutId: 'default',
        }),

      setActiveLayout: (layoutId: string) => set({ activeLayoutId: layoutId }),

      // Selectors
      getWidgetById: (id: string) => get().widgets.find((widget) => widget.id === id),

      getVisibleWidgets: () => get().widgets.filter((widget) => widget.visible),

      addWidget: (widget: WidgetConfig) =>
        set((state) => {
          // Don't add if widget with same ID already exists
          if (state.widgets.some((w) => w.id === widget.id)) {
            return state
          }
          return { widgets: [...state.widgets, widget] }
        }),

      removeWidget: (id: string) =>
        set((state) => ({
          widgets: state.widgets.filter((widget) => widget.id !== id),
        })),

      saveLayout: () => {
        const state = get()
        const activeLayout = state.layouts.find((l) => l.id === state.activeLayoutId)
        if (activeLayout) {
          const updatedLayout: DashboardLayout = {
            ...activeLayout,
            widgets: [...state.widgets],
          }
          set((s) => ({
            layouts: s.layouts.map((l) => (l.id === s.activeLayoutId ? updatedLayout : l)),
          }))
        }
      },

      setLayoutName: (name: string) =>
        set((state) => ({
          layouts: state.layouts.map((l) => (l.id === state.activeLayoutId ? { ...l, name } : l)),
        })),

      getActiveLayout: () => {
        const state = get()
        return state.layouts.find((l) => l.id === state.activeLayoutId)
      },
    }),
    {
      name: 'dashboard-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        widgets: state.widgets,
        activeLayoutId: state.activeLayoutId,
        sidebarOpen: state.sidebarOpen,
        layouts: state.layouts,
      }),
    }
  )
)

/**
 * Export store type for testing and typing purposes
 */
export type DashboardStore = typeof useDashboardStore
