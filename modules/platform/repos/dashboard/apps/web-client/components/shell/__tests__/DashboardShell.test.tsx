/**
 * DashboardShell Component Tests
 *
 * TDD tests for High-Contrast Liquid Glass Dashboard Shell
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { DashboardShell } from '../DashboardShell'

// Mock the stores
const mockSaveLayout = jest.fn()
const mockToggleSidebar = jest.fn()
const mockSetLayoutName = jest.fn()
const mockAddTab = jest.fn()
const mockRenameTab = jest.fn()
const mockSwitchTab = jest.fn()
const mockDeleteTab = jest.fn()

jest.mock('@/lib/stores', () => ({
  useDashboardStore: jest.fn((selector) => {
    const state = {
      sidebarOpen: true,
      activeLayoutId: 'default',
      layouts: [{ id: 'default', name: 'MAPA Dashboard' }],
      saveLayout: mockSaveLayout,
      toggleSidebar: mockToggleSidebar,
      setLayoutName: mockSetLayoutName,
    }
    if (typeof selector === 'function') {
      return selector(state)
    }
    return state
  }),
  useTabStore: jest.fn((selector) => {
    const state = {
      tabs: [{ id: 'tab-1', name: 'Widok 1', layout: [], widgets: [], createdAt: Date.now() }],
      activeTabId: 'tab-1',
      nextId: 1,
      nextWidgetId: 1,
      addTab: mockAddTab,
      renameTab: mockRenameTab,
      switchTab: mockSwitchTab,
      deleteTab: mockDeleteTab,
      duplicateTab: jest.fn(),
      updateTabLayout: jest.fn(),
      reorderTabs: jest.fn(),
      addWidget: jest.fn(),
      removeWidget: jest.fn(),
      getActiveTabWidgets: () => [],
      updateWidgetModule: jest.fn(),
      getActiveTab: () => ({
        id: 'tab-1',
        name: 'Widok 1',
        layout: [],
        widgets: [],
        createdAt: Date.now(),
      }),
    }
    if (typeof selector === 'function') {
      return selector(state)
    }
    return state
  }),
}))

describe('DashboardShell', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ===========================================================================
  // Rendering Tests
  // ===========================================================================

  describe('Rendering', () => {
    it('renders main container with glass styling', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      expect(screen.getByTestId('dashboard-shell')).toBeInTheDocument()
    })

    it('renders children in main content area', () => {
      render(
        <DashboardShell>
          <div data-testid="child-content">My Content</div>
        </DashboardShell>
      )

      expect(screen.getByTestId('child-content')).toBeInTheDocument()
    })

    it('has correct ARIA structure', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      expect(screen.getByRole('main')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // FAB + Widget Tray Tests (Drag & Drop)
  // ===========================================================================

  describe('FAB + Widget Tray (Drag & Drop)', () => {
    it('renders FAB in bottom-right corner', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      const fab = screen.getByTestId('fab-add-panel')
      expect(fab).toBeInTheDocument()
    })

    it('FAB has orange background (bg-orange-500)', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      const fab = screen.getByTestId('fab-add-panel')
      expect(fab).toHaveClass('bg-orange-500')
    })

    it('FAB has plus icon', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      const fab = screen.getByTestId('fab-add-panel')
      expect(fab.querySelector('svg')).toBeInTheDocument()
    })

    it('FAB opens widget tray on click', async () => {
      const user = userEvent.setup()
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      const fab = screen.getByTestId('fab-add-panel')
      await user.click(fab)

      expect(screen.getByTestId('widget-tray')).toBeInTheDocument()
    })

    it('widget tray shows available module types for drag', async () => {
      const user = userEvent.setup()
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      await user.click(screen.getByTestId('fab-add-panel'))

      const widgetTray = screen.getByTestId('widget-tray')
      expect(widgetTray).toHaveTextContent('Robot Status')
      expect(widgetTray).toHaveTextContent('AI Chat')
      expect(widgetTray).toHaveTextContent('Camera')
    })

    it('closes widget tray on Escape', async () => {
      const user = userEvent.setup()
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      await user.click(screen.getByTestId('fab-add-panel'))
      expect(screen.getByTestId('widget-tray')).toBeInTheDocument()

      await user.keyboard('{Escape}')
      await waitFor(() => {
        expect(screen.queryByTestId('widget-tray')).not.toBeInTheDocument()
      })
    })

    it('widget tray items are draggable', async () => {
      const user = userEvent.setup()
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      await user.click(screen.getByTestId('fab-add-panel'))

      const cameraItem = screen.getByTestId('tray-item-camera')
      expect(cameraItem).toHaveAttribute('draggable', 'true')
    })
  })

  // ===========================================================================
  // Side Menu Tests
  // ===========================================================================

  describe('Side Menu', () => {
    it('renders side menu with glass styling', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      expect(screen.getByTestId('side-menu')).toBeInTheDocument()
    })

    it('side menu has dark glass background', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      const sideMenu = screen.getByTestId('side-menu')
      expect(sideMenu).toHaveClass('glass-dark')
    })

    it('renders menu toggle button', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      expect(screen.getByTestId('menu-toggle')).toBeInTheDocument()
    })

    it('menu has white text labels', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      const menuLabels = screen.getAllByTestId(/^menu-label-/)
      menuLabels.forEach((label) => {
        expect(label).toHaveClass('text-white')
      })
    })
  })

  // ===========================================================================
  // Layout Management Tests
  // ===========================================================================

  describe('Layout Management', () => {
    it('renders layout name input', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      expect(screen.getByTestId('layout-name-input')).toBeInTheDocument()
    })

    it('layout name input shows current layout name', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      const input = screen.getByTestId('layout-name-input')
      expect(input).toHaveValue('MAPA Dashboard')
    })

    it('renders SAVE LAYOUT button', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      expect(screen.getByTestId('save-layout-btn')).toBeInTheDocument()
      expect(screen.getByText('SAVE LAYOUT')).toBeInTheDocument()
    })

    it('SAVE LAYOUT button calls saveLayout on click', async () => {
      const user = userEvent.setup()
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      await user.click(screen.getByTestId('save-layout-btn'))

      expect(mockSaveLayout).toHaveBeenCalledTimes(1)
    })

    it('layout name input updates on change', async () => {
      const user = userEvent.setup()
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      const input = screen.getByTestId('layout-name-input')
      await user.clear(input)
      await user.type(input, 'New Layout')

      expect(mockSetLayoutName).toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // Glass Styling Tests
  // ===========================================================================

  describe('Glass Styling', () => {
    it('shell has glass-dark class on header areas', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      const header = screen.getByTestId('shell-header')
      expect(header).toHaveClass('glass-dark')
    })

    it('main content area has glass-light class', () => {
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      const content = screen.getByTestId('shell-content')
      expect(content).toHaveClass('glass-light')
    })
  })

  // ===========================================================================
  // Responsive Tests
  // ===========================================================================

  describe('Responsive Behavior', () => {
    it('side menu can be toggled', async () => {
      const user = userEvent.setup()
      render(
        <DashboardShell>
          <div>Content</div>
        </DashboardShell>
      )

      await user.click(screen.getByTestId('menu-toggle'))

      expect(mockToggleSidebar).toHaveBeenCalledTimes(1)
    })
  })
})
