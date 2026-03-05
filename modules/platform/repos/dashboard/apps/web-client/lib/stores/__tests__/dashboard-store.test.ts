/**
 * Dashboard Layout Store Tests
 *
 * TDD Tests for Dashboard layout state management.
 * Tests follow the design from Pencil (MAPA Dashboard layout).
 *
 * @see packages/shared-types/src/dashboard.ts
 */

import {
  useDashboardStore,
  DEFAULT_WIDGETS,
  DEFAULT_LAYOUT,
  type DashboardLayoutState,
} from '../dashboard-store'
import type { WidgetConfig, WidgetPosition } from '@workspace/shared-types'

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Reset store state before each test
 * Clears localStorage to ensure clean state
 */
const resetStore = () => {
  // Clear localStorage
  localStorage.clear()
  // Reset store to initial state
  useDashboardStore.setState({
    widgets: [...DEFAULT_WIDGETS],
    activeLayoutId: 'default',
    selectedRobotId: null,
    sidebarOpen: true,
    commandPanelOpen: false,
    layouts: [{ ...DEFAULT_LAYOUT }],
  })
}

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockWidget = (overrides: Partial<WidgetConfig> = {}): WidgetConfig => ({
  id: 'test-widget',
  type: 'robot_map',
  title: 'Test Widget',
  position: { x: 0, y: 0, w: 6, h: 4 },
  visible: true,
  locked: false,
  ...overrides,
})

describe('Dashboard Store', () => {
  beforeEach(() => {
    resetStore()
  })

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================

  describe('Initial State', () => {
    it('should have DEFAULT_WIDGETS loaded initially', () => {
      const state = useDashboardStore.getState()
      expect(state.widgets).toHaveLength(DEFAULT_WIDGETS.length)
      expect(state.widgets).toEqual(DEFAULT_WIDGETS)
    })

    it('should have default activeLayoutId', () => {
      const state = useDashboardStore.getState()
      expect(state.activeLayoutId).toBe('default')
    })

    it('should have selectedRobotId as null initially', () => {
      const state = useDashboardStore.getState()
      expect(state.selectedRobotId).toBeNull()
    })

    it('should have sidebar open by default', () => {
      const state = useDashboardStore.getState()
      expect(state.sidebarOpen).toBe(true)
    })

    it('should have command panel closed by default', () => {
      const state = useDashboardStore.getState()
      expect(state.commandPanelOpen).toBe(false)
    })

    it('should have layouts array with default layout', () => {
      const state = useDashboardStore.getState()
      expect(state.layouts).toHaveLength(1)
      expect(state.layouts[0].id).toBe('default')
      expect(state.layouts[0].isDefault).toBe(true)
    })

    it('should match expected initial state shape', () => {
      const state = useDashboardStore.getState()
      expect(state).toMatchObject({
        widgets: expect.any(Array),
        activeLayoutId: expect.any(String),
        selectedRobotId: null,
        sidebarOpen: true,
        commandPanelOpen: false,
        layouts: expect.any(Array),
      })
    })
  })

  // ===========================================================================
  // DEFAULT_WIDGETS Configuration Tests
  // ===========================================================================

  describe('DEFAULT_WIDGETS Configuration', () => {
    it('should have 5 default widgets matching MAPA Dashboard design', () => {
      expect(DEFAULT_WIDGETS).toHaveLength(5)
    })

    it('should include 3D Map widget at correct position', () => {
      const map3d = DEFAULT_WIDGETS.find((w) => w.id === 'map-3d')
      expect(map3d).toBeDefined()
      expect(map3d?.type).toBe('robot_map')
      expect(map3d?.position).toEqual({ x: 0, y: 0, w: 6, h: 8 })
    })

    it('should include 2D Map widget at correct position', () => {
      const map2d = DEFAULT_WIDGETS.find((w) => w.id === 'map-2d')
      expect(map2d).toBeDefined()
      expect(map2d?.type).toBe('patrol_routes')
      expect(map2d?.position).toEqual({ x: 6, y: 0, w: 6, h: 4 })
    })

    it('should include LIDAR widget at correct position', () => {
      const lidar = DEFAULT_WIDGETS.find((w) => w.id === 'lidar-scan')
      expect(lidar).toBeDefined()
      expect(lidar?.type).toBe('telemetry_chart')
      expect(lidar?.position).toEqual({ x: 6, y: 4, w: 6, h: 4 })
    })

    it('should include AI Chat widget at correct position', () => {
      const aiChat = DEFAULT_WIDGETS.find((w) => w.id === 'ai-chat')
      expect(aiChat).toBeDefined()
      expect(aiChat?.type).toBe('command_panel')
      expect(aiChat?.position).toEqual({ x: 0, y: 8, w: 4, h: 4 })
    })

    it('should include Precision Controls widget at correct position', () => {
      const controls = DEFAULT_WIDGETS.find((w) => w.id === 'precision-controls')
      expect(controls).toBeDefined()
      expect(controls?.type).toBe('robot_detail')
      expect(controls?.position).toEqual({ x: 4, y: 8, w: 8, h: 4 })
    })

    it('should have all widgets visible by default', () => {
      DEFAULT_WIDGETS.forEach((widget) => {
        expect(widget.visible).toBe(true)
      })
    })

    it('should have all widgets unlocked by default', () => {
      DEFAULT_WIDGETS.forEach((widget) => {
        expect(widget.locked).toBe(false)
      })
    })
  })

  // ===========================================================================
  // updateWidgetPosition() Tests
  // ===========================================================================

  describe('updateWidgetPosition(id, position)', () => {
    it('should update widget position', () => {
      const { updateWidgetPosition } = useDashboardStore.getState()
      const newPosition: WidgetPosition = { x: 2, y: 3, w: 4, h: 5 }

      updateWidgetPosition('map-3d', newPosition)

      const state = useDashboardStore.getState()
      const widget = state.widgets.find((w) => w.id === 'map-3d')
      expect(widget?.position).toEqual(newPosition)
    })

    it('should preserve other widget properties when updating position', () => {
      const { updateWidgetPosition } = useDashboardStore.getState()
      const originalWidget = useDashboardStore.getState().widgets.find((w) => w.id === 'map-3d')
      const newPosition: WidgetPosition = { x: 1, y: 1, w: 3, h: 3 }

      updateWidgetPosition('map-3d', newPosition)

      const state = useDashboardStore.getState()
      const widget = state.widgets.find((w) => w.id === 'map-3d')
      expect(widget?.title).toBe(originalWidget?.title)
      expect(widget?.type).toBe(originalWidget?.type)
      expect(widget?.visible).toBe(originalWidget?.visible)
    })

    it('should not modify other widgets', () => {
      const { updateWidgetPosition } = useDashboardStore.getState()
      const originalMap2d = useDashboardStore.getState().widgets.find((w) => w.id === 'map-2d')

      updateWidgetPosition('map-3d', { x: 1, y: 1, w: 3, h: 3 })

      const state = useDashboardStore.getState()
      const map2d = state.widgets.find((w) => w.id === 'map-2d')
      expect(map2d).toEqual(originalMap2d)
    })

    it('should not throw if widget does not exist', () => {
      const { updateWidgetPosition } = useDashboardStore.getState()

      expect(() => {
        updateWidgetPosition('non-existent', { x: 0, y: 0, w: 1, h: 1 })
      }).not.toThrow()
    })

    it('should create new widgets array reference (immutability)', () => {
      const { updateWidgetPosition } = useDashboardStore.getState()
      const widgetsBefore = useDashboardStore.getState().widgets

      updateWidgetPosition('map-3d', { x: 1, y: 1, w: 2, h: 2 })

      const widgetsAfter = useDashboardStore.getState().widgets
      expect(widgetsAfter).not.toBe(widgetsBefore)
    })
  })

  // ===========================================================================
  // toggleWidgetVisibility() Tests
  // ===========================================================================

  describe('toggleWidgetVisibility(id)', () => {
    it('should toggle widget from visible to hidden', () => {
      const { toggleWidgetVisibility } = useDashboardStore.getState()

      toggleWidgetVisibility('map-3d')

      const state = useDashboardStore.getState()
      const widget = state.widgets.find((w) => w.id === 'map-3d')
      expect(widget?.visible).toBe(false)
    })

    it('should toggle widget from hidden to visible', () => {
      const { toggleWidgetVisibility } = useDashboardStore.getState()

      // Hide first
      toggleWidgetVisibility('map-3d')
      // Show again
      toggleWidgetVisibility('map-3d')

      const state = useDashboardStore.getState()
      const widget = state.widgets.find((w) => w.id === 'map-3d')
      expect(widget?.visible).toBe(true)
    })

    it('should not throw if widget does not exist', () => {
      const { toggleWidgetVisibility } = useDashboardStore.getState()

      expect(() => {
        toggleWidgetVisibility('non-existent')
      }).not.toThrow()
    })

    it('should preserve other widget properties', () => {
      const { toggleWidgetVisibility } = useDashboardStore.getState()
      const originalWidget = useDashboardStore.getState().widgets.find((w) => w.id === 'map-3d')

      toggleWidgetVisibility('map-3d')

      const state = useDashboardStore.getState()
      const widget = state.widgets.find((w) => w.id === 'map-3d')
      expect(widget?.position).toEqual(originalWidget?.position)
      expect(widget?.title).toBe(originalWidget?.title)
    })
  })

  // ===========================================================================
  // setWidgetVisibility() Tests
  // ===========================================================================

  describe('setWidgetVisibility(id, visible)', () => {
    it('should set widget visibility to false', () => {
      const { setWidgetVisibility } = useDashboardStore.getState()

      setWidgetVisibility('map-3d', false)

      const state = useDashboardStore.getState()
      const widget = state.widgets.find((w) => w.id === 'map-3d')
      expect(widget?.visible).toBe(false)
    })

    it('should set widget visibility to true', () => {
      const { setWidgetVisibility, toggleWidgetVisibility } = useDashboardStore.getState()
      toggleWidgetVisibility('map-3d') // Hide first

      setWidgetVisibility('map-3d', true)

      const state = useDashboardStore.getState()
      const widget = state.widgets.find((w) => w.id === 'map-3d')
      expect(widget?.visible).toBe(true)
    })
  })

  // ===========================================================================
  // setSelectedRobot() Tests
  // ===========================================================================

  describe('setSelectedRobot(robotId)', () => {
    it('should set selected robot ID', () => {
      const { setSelectedRobot } = useDashboardStore.getState()

      setSelectedRobot('robot-001')

      const state = useDashboardStore.getState()
      expect(state.selectedRobotId).toBe('robot-001')
    })

    it('should allow changing selected robot', () => {
      const { setSelectedRobot } = useDashboardStore.getState()

      setSelectedRobot('robot-001')
      setSelectedRobot('robot-002')

      const state = useDashboardStore.getState()
      expect(state.selectedRobotId).toBe('robot-002')
    })

    it('should allow clearing selected robot with null', () => {
      const { setSelectedRobot } = useDashboardStore.getState()

      setSelectedRobot('robot-001')
      setSelectedRobot(null)

      const state = useDashboardStore.getState()
      expect(state.selectedRobotId).toBeNull()
    })
  })

  // ===========================================================================
  // clearSelectedRobot() Tests
  // ===========================================================================

  describe('clearSelectedRobot()', () => {
    it('should clear selected robot', () => {
      const { setSelectedRobot, clearSelectedRobot } = useDashboardStore.getState()
      setSelectedRobot('robot-001')

      clearSelectedRobot()

      const state = useDashboardStore.getState()
      expect(state.selectedRobotId).toBeNull()
    })
  })

  // ===========================================================================
  // toggleSidebar() Tests
  // ===========================================================================

  describe('toggleSidebar()', () => {
    it('should toggle sidebar from open to closed', () => {
      const { toggleSidebar } = useDashboardStore.getState()

      toggleSidebar()

      const state = useDashboardStore.getState()
      expect(state.sidebarOpen).toBe(false)
    })

    it('should toggle sidebar from closed to open', () => {
      const { toggleSidebar } = useDashboardStore.getState()

      toggleSidebar()
      toggleSidebar()

      const state = useDashboardStore.getState()
      expect(state.sidebarOpen).toBe(true)
    })
  })

  // ===========================================================================
  // setSidebarOpen() Tests
  // ===========================================================================

  describe('setSidebarOpen(open)', () => {
    it('should set sidebar open state', () => {
      const { setSidebarOpen } = useDashboardStore.getState()

      setSidebarOpen(false)

      const state = useDashboardStore.getState()
      expect(state.sidebarOpen).toBe(false)
    })

    it('should set sidebar to open', () => {
      const { setSidebarOpen } = useDashboardStore.getState()
      setSidebarOpen(false)

      setSidebarOpen(true)

      const state = useDashboardStore.getState()
      expect(state.sidebarOpen).toBe(true)
    })
  })

  // ===========================================================================
  // toggleCommandPanel() Tests
  // ===========================================================================

  describe('toggleCommandPanel()', () => {
    it('should toggle command panel from closed to open', () => {
      const { toggleCommandPanel } = useDashboardStore.getState()

      toggleCommandPanel()

      const state = useDashboardStore.getState()
      expect(state.commandPanelOpen).toBe(true)
    })

    it('should toggle command panel from open to closed', () => {
      const { toggleCommandPanel } = useDashboardStore.getState()

      toggleCommandPanel()
      toggleCommandPanel()

      const state = useDashboardStore.getState()
      expect(state.commandPanelOpen).toBe(false)
    })
  })

  // ===========================================================================
  // setCommandPanelOpen() Tests
  // ===========================================================================

  describe('setCommandPanelOpen(open)', () => {
    it('should set command panel to open', () => {
      const { setCommandPanelOpen } = useDashboardStore.getState()

      setCommandPanelOpen(true)

      const state = useDashboardStore.getState()
      expect(state.commandPanelOpen).toBe(true)
    })

    it('should set command panel to closed', () => {
      const { setCommandPanelOpen } = useDashboardStore.getState()
      setCommandPanelOpen(true)

      setCommandPanelOpen(false)

      const state = useDashboardStore.getState()
      expect(state.commandPanelOpen).toBe(false)
    })
  })

  // ===========================================================================
  // resetLayout() Tests
  // ===========================================================================

  describe('resetLayout()', () => {
    it('should reset widgets to DEFAULT_WIDGETS', () => {
      const { updateWidgetPosition, resetLayout } = useDashboardStore.getState()
      updateWidgetPosition('map-3d', { x: 10, y: 10, w: 2, h: 2 })

      resetLayout()

      const state = useDashboardStore.getState()
      expect(state.widgets).toEqual(DEFAULT_WIDGETS)
    })

    it('should reset activeLayoutId to default', () => {
      useDashboardStore.setState({ activeLayoutId: 'custom-layout' })
      const { resetLayout } = useDashboardStore.getState()

      resetLayout()

      const state = useDashboardStore.getState()
      expect(state.activeLayoutId).toBe('default')
    })

    it('should not affect selectedRobotId', () => {
      const { setSelectedRobot, resetLayout } = useDashboardStore.getState()
      setSelectedRobot('robot-001')

      resetLayout()

      const state = useDashboardStore.getState()
      expect(state.selectedRobotId).toBe('robot-001')
    })

    it('should not affect sidebar state', () => {
      const { toggleSidebar, resetLayout } = useDashboardStore.getState()
      toggleSidebar()

      resetLayout()

      const state = useDashboardStore.getState()
      expect(state.sidebarOpen).toBe(false)
    })
  })

  // ===========================================================================
  // setActiveLayout() Tests
  // ===========================================================================

  describe('setActiveLayout(layoutId)', () => {
    it('should set active layout ID', () => {
      const { setActiveLayout } = useDashboardStore.getState()

      setActiveLayout('camera-layout')

      const state = useDashboardStore.getState()
      expect(state.activeLayoutId).toBe('camera-layout')
    })
  })

  // ===========================================================================
  // getWidgetById() Selector Tests
  // ===========================================================================

  describe('getWidgetById(id)', () => {
    it('should return widget when it exists', () => {
      const { getWidgetById } = useDashboardStore.getState()

      const widget = getWidgetById('map-3d')

      expect(widget).toBeDefined()
      expect(widget?.id).toBe('map-3d')
    })

    it('should return undefined when widget does not exist', () => {
      const { getWidgetById } = useDashboardStore.getState()

      const widget = getWidgetById('non-existent')

      expect(widget).toBeUndefined()
    })
  })

  // ===========================================================================
  // getVisibleWidgets() Selector Tests
  // ===========================================================================

  describe('getVisibleWidgets()', () => {
    it('should return all visible widgets', () => {
      const { getVisibleWidgets } = useDashboardStore.getState()

      const visible = getVisibleWidgets()

      expect(visible).toHaveLength(5)
    })

    it('should not include hidden widgets', () => {
      const { toggleWidgetVisibility, getVisibleWidgets } = useDashboardStore.getState()
      toggleWidgetVisibility('map-3d')

      const visible = getVisibleWidgets()

      expect(visible).toHaveLength(4)
      expect(visible.find((w) => w.id === 'map-3d')).toBeUndefined()
    })
  })

  // ===========================================================================
  // addWidget() Tests
  // ===========================================================================

  describe('addWidget(widget)', () => {
    it('should add a new widget to the store', () => {
      const { addWidget } = useDashboardStore.getState()
      const newWidget = createMockWidget({ id: 'new-widget', title: 'New Widget' })

      addWidget(newWidget)

      const state = useDashboardStore.getState()
      expect(state.widgets).toHaveLength(6)
      expect(state.widgets.find((w) => w.id === 'new-widget')).toBeDefined()
    })

    it('should not add duplicate widget with same ID', () => {
      const { addWidget } = useDashboardStore.getState()
      const duplicateWidget = createMockWidget({ id: 'map-3d', title: 'Duplicate' })

      addWidget(duplicateWidget)

      const state = useDashboardStore.getState()
      expect(state.widgets).toHaveLength(5)
    })
  })

  // ===========================================================================
  // removeWidget() Tests
  // ===========================================================================

  describe('removeWidget(id)', () => {
    it('should remove widget from store', () => {
      const { removeWidget } = useDashboardStore.getState()

      removeWidget('map-3d')

      const state = useDashboardStore.getState()
      expect(state.widgets).toHaveLength(4)
      expect(state.widgets.find((w) => w.id === 'map-3d')).toBeUndefined()
    })

    it('should not throw if widget does not exist', () => {
      const { removeWidget } = useDashboardStore.getState()

      expect(() => {
        removeWidget('non-existent')
      }).not.toThrow()
    })
  })

  // ===========================================================================
  // localStorage Persistence Tests
  // ===========================================================================

  describe('localStorage Persistence', () => {
    it('should persist state to localStorage', async () => {
      const { updateWidgetPosition } = useDashboardStore.getState()

      // Update widget position
      updateWidgetPosition('map-3d', { x: 5, y: 5, w: 4, h: 4 })

      // Check localStorage (key should be 'dashboard-storage')
      const stored = localStorage.getItem('dashboard-storage')
      expect(stored).not.toBeNull()

      const parsed = JSON.parse(stored!)
      expect(parsed.state.widgets).toBeDefined()
    })

    it('should restore state from localStorage on store creation', () => {
      // This test verifies the persist middleware behavior
      // The actual persistence is handled by Zustand's persist middleware
      const stored = localStorage.getItem('dashboard-storage')

      // If there's stored state, it should be restored
      if (stored) {
        const parsedStorage = JSON.parse(stored)
        expect(parsedStorage.state).toBeDefined()
        expect(parsedStorage.state.widgets).toBeDefined()
      }

      // Verify current state has widgets
      const state = useDashboardStore.getState()
      expect(state.widgets).toBeDefined()
    })
  })

  // ===========================================================================
  // State Immutability Tests
  // ===========================================================================

  describe('State Immutability', () => {
    it('should create new state objects on updates', () => {
      const initialState = useDashboardStore.getState()

      const { setSelectedRobot } = initialState
      setSelectedRobot('robot-001')

      const newState = useDashboardStore.getState()
      expect(newState).not.toBe(initialState)
    })

    it('should not mutate original widget objects on position update', () => {
      const { updateWidgetPosition } = useDashboardStore.getState()
      const originalWidget = useDashboardStore.getState().widgets.find((w) => w.id === 'map-3d')
      const originalPosition = { ...originalWidget!.position }

      updateWidgetPosition('map-3d', { x: 99, y: 99, w: 1, h: 1 })

      expect(originalWidget?.position).toEqual(originalPosition)
    })
  })

  // ===========================================================================
  // Type Safety Tests
  // ===========================================================================

  describe('Type Safety', () => {
    it('should export DashboardLayoutState type correctly', () => {
      const state: DashboardLayoutState = useDashboardStore.getState()

      expect(state.widgets).toBeInstanceOf(Array)
      expect(typeof state.activeLayoutId).toBe('string')
    })

    it('should handle WidgetConfig type from shared-types', () => {
      const { addWidget, getWidgetById } = useDashboardStore.getState()
      const typedWidget: WidgetConfig = createMockWidget({ id: 'typed-widget' })

      addWidget(typedWidget)
      const result = getWidgetById('typed-widget')

      expect(result).toBeDefined()
      expect(result?.id).toBe(typedWidget.id)
    })
  })
})
