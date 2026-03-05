/**
 * Integration test: Drag & Drop widget addition
 * Tests that new modules appear after being dragged onto the layout
 */
import React from 'react'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock next/dynamic to return the actual component
jest.mock('next/dynamic', () => {
  return (loader: () => Promise<{ default: React.ComponentType }>) => {
    const Component = React.lazy(loader as () => Promise<{ default: React.ComponentType }>)
    return Component
  }
})

// Mock react-grid-layout
const mockResponsive = jest.fn()
jest.mock('react-grid-layout', () => {
  return {
    Responsive: (props: {
      children: React.ReactNode
      layouts: Record<string, Array<{ i: string }>>
      onLayoutChange?: (
        layout: Array<{ i: string; x: number; y: number; w: number; h: number }>
      ) => void
    }) => {
      mockResponsive(props)
      // Simulate calling onLayoutChange on mount
      React.useEffect(() => {
        if (props.onLayoutChange && props.layouts?.lg) {
          props.onLayoutChange(
            props.layouts.lg.map((item: { i: string }) => ({
              i: item.i,
              x: 0,
              y: 0,
              w: 4,
              h: 4,
            }))
          )
        }
      }, []) // eslint-disable-line react-hooks/exhaustive-deps
      return <div data-testid="mock-grid">{props.children}</div>
    },
    useContainerWidth: () => ({
      width: 1280,
      mounted: true,
      containerRef: { current: document.createElement('div') },
    }),
    verticalCompactor: {},
  }
})

// Mock auth
jest.mock('@/components/auth', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock websocket hook
jest.mock('@/lib/hooks', () => ({
  useWebSocket: jest.fn(),
}))

// Mock dashboard components
jest.mock('@/components/dashboard', () => ({
  RESIZE_HANDLES_ALL: ['se'],
}))

import { useTabStore } from '@/lib/stores/tab-store'

describe('Drag & Drop Widget Addition', () => {
  beforeEach(() => {
    // Reset store
    const store = useTabStore.getState()
    // Clear all tabs
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
      nextId: 1,
      nextWidgetId: 1,
      hasHydrated: true,
    })
    // Create initial tab
    store.addTab('Test Tab')
    mockResponsive.mockClear()
  })

  it('addWidget adds both widget and layout entry to tab store', () => {
    const tabId = useTabStore.getState().activeTabId!
    const store = useTabStore.getState()

    store.addWidget(tabId, { id: 'w1', moduleType: 'camera' })

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId)!
    expect(tab.widgets).toHaveLength(1)
    expect(tab.widgets[0]).toEqual({ id: 'w1', moduleType: 'camera' })
    expect(tab.layout).toHaveLength(1)
    expect(tab.layout[0].i).toBe('w1')
    expect(tab.layout[0].w).toBe(4)
    expect(tab.layout[0].h).toBe(4)
  })

  it('addWidget works for multiple sequential adds', () => {
    const tabId = useTabStore.getState().activeTabId!
    const store = useTabStore.getState()

    store.addWidget(tabId, { id: 'w1', moduleType: 'camera' })
    store.addWidget(tabId, { id: 'w2', moduleType: 'lidar' })
    store.addWidget(tabId, { id: 'w3', moduleType: 'controls' })

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId)!
    expect(tab.widgets).toHaveLength(3)
    expect(tab.layout).toHaveLength(3)
    expect(tab.layout.map((l) => l.i)).toEqual(['w1', 'w2', 'w3'])
  })

  it('updateTabLayout preserves layout entries for widgets not in incoming layout', () => {
    const tabId = useTabStore.getState().activeTabId!
    const store = useTabStore.getState()

    // Add 3 widgets
    store.addWidget(tabId, { id: 'w1', moduleType: 'camera' })
    store.addWidget(tabId, { id: 'w2', moduleType: 'lidar' })
    store.addWidget(tabId, { id: 'w3', moduleType: 'controls' })

    // Simulate onLayoutChange with only 2 items (missing w3)
    // This happens when RGL fires onLayoutChange before processing the new widget
    store.updateTabLayout(tabId, [
      { i: 'w1', x: 0, y: 0, w: 4, h: 4 },
      { i: 'w2', x: 4, y: 0, w: 4, h: 4 },
    ])

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId)!
    // All 3 widgets should still be present
    expect(tab.widgets).toHaveLength(3)
    // Layout should also have all 3 — w3 preserved from original
    expect(tab.layout).toHaveLength(3)
    expect(tab.layout.map((l) => l.i).sort()).toEqual(['w1', 'w2', 'w3'])
  })

  it('updateTabLayout updates positions for existing items', () => {
    const tabId = useTabStore.getState().activeTabId!
    const store = useTabStore.getState()

    store.addWidget(tabId, { id: 'w1', moduleType: 'camera' })
    store.addWidget(tabId, { id: 'w2', moduleType: 'lidar' })

    // Simulate layout change with updated positions
    store.updateTabLayout(tabId, [
      { i: 'w1', x: 2, y: 1, w: 6, h: 5 },
      { i: 'w2', x: 0, y: 6, w: 4, h: 3 },
    ])

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId)!
    expect(tab.layout).toHaveLength(2)
    const w1Layout = tab.layout.find((l) => l.i === 'w1')!
    expect(w1Layout.x).toBe(2)
    expect(w1Layout.y).toBe(1)
    expect(w1Layout.w).toBe(6)
  })

  it('auto-places widgets in grid pattern (not single column)', () => {
    const tabId = useTabStore.getState().activeTabId!
    const store = useTabStore.getState()

    // Add 4 widgets — should fill a 2x2-ish grid (12 cols, w=4 each → 3 per row)
    store.addWidget(tabId, { id: 'w1', moduleType: 'camera' })
    store.addWidget(tabId, { id: 'w2', moduleType: 'lidar' })
    store.addWidget(tabId, { id: 'w3', moduleType: 'controls' })
    store.addWidget(tabId, { id: 'w4', moduleType: 'ai-chat' })

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId)!
    const positions = tab.layout.map((l) => ({ i: l.i, x: l.x, y: l.y }))

    // First 3 should be on the same row (y=0) at different x positions
    expect(positions[0]).toEqual({ i: 'w1', x: 0, y: 0 })
    expect(positions[1]).toEqual({ i: 'w2', x: 4, y: 0 })
    expect(positions[2]).toEqual({ i: 'w3', x: 8, y: 0 })
    // 4th wraps to next row
    expect(positions[3]).toEqual({ i: 'w4', x: 0, y: 4 })
  })

  it('full drag-drop flow: add widget then layout update preserves new widget', () => {
    const tabId = useTabStore.getState().activeTabId!
    const store = useTabStore.getState()

    // Pre-existing widgets
    store.addWidget(tabId, { id: 'w1', moduleType: 'camera' })
    store.addWidget(tabId, { id: 'w2', moduleType: 'lidar' })

    // Simulate layout settled
    store.updateTabLayout(tabId, [
      { i: 'w1', x: 0, y: 0, w: 4, h: 4 },
      { i: 'w2', x: 4, y: 0, w: 4, h: 4 },
    ])

    // User drags new widget
    store.addWidget(tabId, { id: 'w3', moduleType: 'controls' })

    // RGL fires onLayoutChange for OLD items before processing new one
    store.updateTabLayout(tabId, [
      { i: 'w1', x: 0, y: 0, w: 4, h: 4 },
      { i: 'w2', x: 4, y: 0, w: 4, h: 4 },
    ])

    const tab = useTabStore.getState().tabs.find((t) => t.id === tabId)!
    // w3 must still have a layout entry
    expect(tab.layout).toHaveLength(3)
    expect(tab.layout.find((l) => l.i === 'w3')).toBeTruthy()
    expect(tab.widgets).toHaveLength(3)
  })
})
