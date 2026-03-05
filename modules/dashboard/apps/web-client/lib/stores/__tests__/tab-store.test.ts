/**
 * Tab Store Tests
 *
 * TDD tests for Dynamic Tab System with CRUD operations
 * and localStorage persistence.
 */

import { act } from '@testing-library/react'

// Reset modules before importing store to ensure clean state
beforeEach(() => {
  jest.resetModules()
  localStorage.clear()
})

describe('useTabStore', () => {
  // ===========================================================================
  // Initial State Tests
  // ===========================================================================

  describe('Initial State', () => {
    it('starts with an empty tabs array', async () => {
      const { useTabStore } = await import('../tab-store')
      const { tabs } = useTabStore.getState()

      expect(tabs).toEqual([])
    })

    it('starts with activeTabId as null', async () => {
      const { useTabStore } = await import('../tab-store')
      const { activeTabId } = useTabStore.getState()

      expect(activeTabId).toBeNull()
    })
  })

  // ===========================================================================
  // addTab Tests
  // ===========================================================================

  describe('addTab', () => {
    it('adds a new tab with default name "Nowy Widok"', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab()
      })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(1)
      expect(tabs[0].name).toBe('Nowy Widok')
    })

    it('increments tab count when adding multiple tabs', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab()
        useTabStore.getState().addTab()
        useTabStore.getState().addTab()
      })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(3)
    })

    it('creates unique IDs for each tab', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab()
        useTabStore.getState().addTab()
      })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].id).not.toBe(tabs[1].id)
    })

    it('initializes new tab with empty layout array', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab()
      })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].layout).toEqual([])
    })

    it('automatically activates first added tab', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab()
      })

      const { tabs, activeTabId } = useTabStore.getState()
      expect(activeTabId).toBe(tabs[0].id)
    })

    it('does not change activeTabId when adding subsequent tabs', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab()
      })

      const firstTabId = useTabStore.getState().tabs[0].id

      act(() => {
        useTabStore.getState().addTab()
      })

      expect(useTabStore.getState().activeTabId).toBe(firstTabId)
    })

    it('allows custom name when adding tab', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Mój Widok')
      })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].name).toBe('Mój Widok')
    })
  })

  // ===========================================================================
  // renameTab Tests
  // ===========================================================================

  describe('renameTab', () => {
    it('renames tab with given ID', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab()
      })

      const tabId = useTabStore.getState().tabs[0].id

      act(() => {
        useTabStore.getState().renameTab(tabId, 'Moja Zakładka')
      })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].name).toBe('Moja Zakładka')
    })

    it('does not modify other tabs when renaming', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Tab 1')
        useTabStore.getState().addTab('Tab 2')
        useTabStore.getState().addTab('Tab 3')
      })

      const tabId = useTabStore.getState().tabs[1].id

      act(() => {
        useTabStore.getState().renameTab(tabId, 'Renamed Tab')
      })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].name).toBe('Tab 1')
      expect(tabs[1].name).toBe('Renamed Tab')
      expect(tabs[2].name).toBe('Tab 3')
    })

    it('does nothing if tab ID does not exist', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Original')
      })

      act(() => {
        useTabStore.getState().renameTab('non-existent-id', 'New Name')
      })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].name).toBe('Original')
    })

    it('trims whitespace from new name', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab()
      })

      const tabId = useTabStore.getState().tabs[0].id

      act(() => {
        useTabStore.getState().renameTab(tabId, '  Trimmed Name  ')
      })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].name).toBe('Trimmed Name')
    })

    it('limits name to 50 characters', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab()
      })

      const tabId = useTabStore.getState().tabs[0].id
      const longName = 'A'.repeat(100)

      act(() => {
        useTabStore.getState().renameTab(tabId, longName)
      })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].name).toHaveLength(50)
    })
  })

  // ===========================================================================
  // switchTab Tests
  // ===========================================================================

  describe('switchTab', () => {
    it('changes activeTabId to the specified tab', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Tab 1')
        useTabStore.getState().addTab('Tab 2')
      })

      const secondTabId = useTabStore.getState().tabs[1].id

      act(() => {
        useTabStore.getState().switchTab(secondTabId)
      })

      expect(useTabStore.getState().activeTabId).toBe(secondTabId)
    })

    it('does nothing if tab ID does not exist', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab()
      })

      const originalActiveId = useTabStore.getState().activeTabId

      act(() => {
        useTabStore.getState().switchTab('non-existent-id')
      })

      expect(useTabStore.getState().activeTabId).toBe(originalActiveId)
    })
  })

  // ===========================================================================
  // deleteTab Tests
  // ===========================================================================

  describe('deleteTab', () => {
    it('removes tab from the list', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Tab 1')
        useTabStore.getState().addTab('Tab 2')
      })

      const firstTabId = useTabStore.getState().tabs[0].id

      act(() => {
        useTabStore.getState().deleteTab(firstTabId)
      })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(1)
      expect(tabs[0].name).toBe('Tab 2')
    })

    it('switches to next tab when active tab is deleted', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Tab 1')
        useTabStore.getState().addTab('Tab 2')
      })

      const firstTabId = useTabStore.getState().tabs[0].id
      const secondTabId = useTabStore.getState().tabs[1].id

      // First tab is active
      expect(useTabStore.getState().activeTabId).toBe(firstTabId)

      act(() => {
        useTabStore.getState().deleteTab(firstTabId)
      })

      expect(useTabStore.getState().activeTabId).toBe(secondTabId)
    })

    it('switches to previous tab when last tab is deleted', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Tab 1')
        useTabStore.getState().addTab('Tab 2')
      })

      const firstTabId = useTabStore.getState().tabs[0].id
      const secondTabId = useTabStore.getState().tabs[1].id

      // Switch to second tab
      act(() => {
        useTabStore.getState().switchTab(secondTabId)
      })

      act(() => {
        useTabStore.getState().deleteTab(secondTabId)
      })

      expect(useTabStore.getState().activeTabId).toBe(firstTabId)
    })

    it('sets activeTabId to null when last tab is deleted', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab()
      })

      const tabId = useTabStore.getState().tabs[0].id

      act(() => {
        useTabStore.getState().deleteTab(tabId)
      })

      expect(useTabStore.getState().activeTabId).toBeNull()
      expect(useTabStore.getState().tabs).toHaveLength(0)
    })

    it('does nothing if tab ID does not exist', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab()
      })

      act(() => {
        useTabStore.getState().deleteTab('non-existent-id')
      })

      expect(useTabStore.getState().tabs).toHaveLength(1)
    })
  })

  // ===========================================================================
  // updateTabLayout Tests
  // ===========================================================================

  describe('updateTabLayout', () => {
    it('updates layout for specified tab', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab()
      })

      const tabId = useTabStore.getState().tabs[0].id
      const newLayout = [
        { i: 'window-1', x: 0, y: 0, w: 4, h: 4 },
        { i: 'window-2', x: 4, y: 0, w: 4, h: 4 },
      ]

      act(() => {
        useTabStore.getState().updateTabLayout(tabId, newLayout)
      })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].layout).toEqual(newLayout)
    })

    it('does not modify other tabs layouts', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Tab 1')
        useTabStore.getState().addTab('Tab 2')
      })

      const firstTabId = useTabStore.getState().tabs[0].id
      const layout = [{ i: 'window-1', x: 0, y: 0, w: 4, h: 4 }]

      act(() => {
        useTabStore.getState().updateTabLayout(firstTabId, layout)
      })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].layout).toEqual(layout)
      expect(tabs[1].layout).toEqual([])
    })
  })

  // ===========================================================================
  // getActiveTab Tests
  // ===========================================================================

  describe('getActiveTab', () => {
    it('returns undefined when no tabs exist', async () => {
      const { useTabStore } = await import('../tab-store')

      const activeTab = useTabStore.getState().getActiveTab()
      expect(activeTab).toBeUndefined()
    })

    it('returns the currently active tab', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('My Tab')
      })

      const activeTab = useTabStore.getState().getActiveTab()
      expect(activeTab?.name).toBe('My Tab')
    })
  })

  // ===========================================================================
  // Persistence Tests
  // ===========================================================================

  describe('Persistence', () => {
    it('persists tabs to localStorage', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Persisted Tab')
      })

      // Check localStorage
      const stored = localStorage.getItem('tab-storage')
      expect(stored).toBeTruthy()

      const parsed = JSON.parse(stored!)
      expect(parsed.state.tabs[0].name).toBe('Persisted Tab')
    })

    it('restores tabs from localStorage on reload', async () => {
      // First session - add tabs
      const { useTabStore: store1 } = await import('../tab-store')

      act(() => {
        store1.getState().addTab('Session 1 Tab')
      })

      // Reset modules to simulate page reload
      jest.resetModules()

      // Second session - tabs should be restored
      const { useTabStore: store2 } = await import('../tab-store')

      // Wait for hydration
      await new Promise((resolve) => setTimeout(resolve, 0))

      const { tabs } = store2.getState()
      expect(tabs[0].name).toBe('Session 1 Tab')
    })
  })

  // ===========================================================================
  // duplicateTab Tests
  // ===========================================================================

  describe('duplicateTab', () => {
    it('creates a copy of the specified tab', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Original')
      })

      const originalTabId = useTabStore.getState().tabs[0].id
      const layout = [{ i: 'window-1', x: 0, y: 0, w: 4, h: 4 }]

      act(() => {
        useTabStore.getState().updateTabLayout(originalTabId, layout)
        useTabStore.getState().duplicateTab(originalTabId)
      })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(2)
      expect(tabs[1].name).toBe('Original (kopia)')
      expect(tabs[1].layout).toEqual(layout)
    })

    it('creates unique ID for duplicated tab', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Original')
      })

      const originalTabId = useTabStore.getState().tabs[0].id

      act(() => {
        useTabStore.getState().duplicateTab(originalTabId)
      })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].id).not.toBe(tabs[1].id)
    })
  })

  // ===========================================================================
  // reorderTabs Tests
  // ===========================================================================

  describe('reorderTabs', () => {
    it('moves tab from one position to another', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Tab 1')
        useTabStore.getState().addTab('Tab 2')
        useTabStore.getState().addTab('Tab 3')
      })

      act(() => {
        useTabStore.getState().reorderTabs(2, 0) // Move Tab 3 to first position
      })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].name).toBe('Tab 3')
      expect(tabs[1].name).toBe('Tab 1')
      expect(tabs[2].name).toBe('Tab 2')
    })
  })

  // ===========================================================================
  // State Isolation Tests (NEW - TDD for Dynamic Tab System)
  // ===========================================================================

  describe('State Isolation', () => {
    it('new tab starts with empty widgets array', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('New Tab')
      })

      const tab = useTabStore.getState().tabs[0]
      expect(tab.widgets).toEqual([])
      expect(tab.layout).toEqual([])
    })

    it('each tab has independent widgets list', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Tab 1')
        useTabStore.getState().addTab('Tab 2')
      })

      const tab1Id = useTabStore.getState().tabs[0].id

      // Add widget to Tab 1 only (Tab 2 should remain empty)
      act(() => {
        useTabStore.getState().addWidget(tab1Id, {
          id: 'widget-1',
          moduleType: 'robot-status',
        })
      })

      const { tabs } = useTabStore.getState()
      expect(tabs[0].widgets).toHaveLength(1)
      expect(tabs[1].widgets).toHaveLength(0) // Tab 2 should be empty (state isolation)
    })

    it('addWidget adds widget with default layout position', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('My Tab')
      })

      const tabId = useTabStore.getState().tabs[0].id

      act(() => {
        useTabStore.getState().addWidget(tabId, {
          id: 'widget-1',
          moduleType: 'ai-chat',
        })
      })

      const tab = useTabStore.getState().tabs[0]
      expect(tab.widgets[0]).toEqual({
        id: 'widget-1',
        moduleType: 'ai-chat',
      })
      // Layout should also be created for the widget
      expect(tab.layout).toHaveLength(1)
      expect(tab.layout[0].i).toBe('widget-1')
    })

    it('removeWidget removes widget and its layout', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('My Tab')
      })

      const tabId = useTabStore.getState().tabs[0].id

      act(() => {
        useTabStore.getState().addWidget(tabId, {
          id: 'widget-1',
          moduleType: 'map-3d',
        })
        useTabStore.getState().addWidget(tabId, {
          id: 'widget-2',
          moduleType: 'lidar',
        })
      })

      expect(useTabStore.getState().tabs[0].widgets).toHaveLength(2)

      act(() => {
        useTabStore.getState().removeWidget(tabId, 'widget-1')
      })

      const tab = useTabStore.getState().tabs[0]
      expect(tab.widgets).toHaveLength(1)
      expect(tab.widgets[0].id).toBe('widget-2')
      expect(tab.layout).toHaveLength(1)
      expect(tab.layout[0].i).toBe('widget-2')
    })

    it('switching tabs does not affect other tabs widgets', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Tab 1')
        useTabStore.getState().addTab('Tab 2')
      })

      const tab1Id = useTabStore.getState().tabs[0].id
      const tab2Id = useTabStore.getState().tabs[1].id

      // Add widget to Tab 1
      act(() => {
        useTabStore.getState().addWidget(tab1Id, {
          id: 'widget-1',
          moduleType: 'robot-status',
        })
      })

      // Switch to Tab 2
      act(() => {
        useTabStore.getState().switchTab(tab2Id)
      })

      // Add widget to Tab 2
      act(() => {
        useTabStore.getState().addWidget(tab2Id, {
          id: 'widget-2',
          moduleType: 'ai-chat',
        })
      })

      // Switch back to Tab 1
      act(() => {
        useTabStore.getState().switchTab(tab1Id)
      })

      // Verify Tab 1 still has only its widget
      const { tabs } = useTabStore.getState()
      expect(tabs[0].widgets).toHaveLength(1)
      expect(tabs[0].widgets[0].id).toBe('widget-1')
      expect(tabs[1].widgets).toHaveLength(1)
      expect(tabs[1].widgets[0].id).toBe('widget-2')
    })

    it('deleting tab removes all its widgets', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Tab 1')
        useTabStore.getState().addTab('Tab 2')
      })

      const tab1Id = useTabStore.getState().tabs[0].id

      act(() => {
        useTabStore.getState().addWidget(tab1Id, {
          id: 'widget-1',
          moduleType: 'map-3d',
        })
        useTabStore.getState().addWidget(tab1Id, {
          id: 'widget-2',
          moduleType: 'lidar',
        })
      })

      act(() => {
        useTabStore.getState().deleteTab(tab1Id)
      })

      // Tab 1 and all its widgets should be gone
      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(1)
      expect(tabs[0].name).toBe('Tab 2')
      expect(tabs[0].widgets).toEqual([])
    })

    it('getActiveTabWidgets returns widgets for active tab', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Active Tab')
      })

      const tabId = useTabStore.getState().tabs[0].id

      act(() => {
        useTabStore.getState().addWidget(tabId, {
          id: 'widget-1',
          moduleType: 'controls',
        })
      })

      const widgets = useTabStore.getState().getActiveTabWidgets()
      expect(widgets).toHaveLength(1)
      expect(widgets[0].moduleType).toBe('controls')
    })

    it('getActiveTabWidgets returns empty array when no active tab', async () => {
      const { useTabStore } = await import('../tab-store')

      const widgets = useTabStore.getState().getActiveTabWidgets()
      expect(widgets).toEqual([])
    })

    it('updateWidgetModule changes widget module type', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('My Tab')
      })

      const tabId = useTabStore.getState().tabs[0].id

      act(() => {
        useTabStore.getState().addWidget(tabId, {
          id: 'widget-1',
          moduleType: 'robot-status',
        })
      })

      act(() => {
        useTabStore.getState().updateWidgetModule(tabId, 'widget-1', 'ai-chat')
      })

      const tab = useTabStore.getState().tabs[0]
      expect(tab.widgets[0].moduleType).toBe('ai-chat')
    })

    it('duplicateTab copies widgets to new tab', async () => {
      const { useTabStore } = await import('../tab-store')

      act(() => {
        useTabStore.getState().addTab('Original')
      })

      const originalTabId = useTabStore.getState().tabs[0].id

      act(() => {
        useTabStore.getState().addWidget(originalTabId, {
          id: 'widget-1',
          moduleType: 'map-3d',
        })
        useTabStore
          .getState()
          .updateTabLayout(originalTabId, [{ i: 'widget-1', x: 0, y: 0, w: 4, h: 4 }])
      })

      act(() => {
        useTabStore.getState().duplicateTab(originalTabId)
      })

      const { tabs } = useTabStore.getState()
      expect(tabs).toHaveLength(2)
      expect(tabs[1].name).toBe('Original (kopia)')
      expect(tabs[1].widgets).toHaveLength(1)
      expect(tabs[1].widgets[0].moduleType).toBe('map-3d')
      // Widget ID should be different
      expect(tabs[1].widgets[0].id).not.toBe('widget-1')
    })
  })
})
