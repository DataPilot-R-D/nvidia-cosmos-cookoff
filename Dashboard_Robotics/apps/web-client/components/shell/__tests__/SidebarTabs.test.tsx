/**
 * SidebarTabs Component Tests
 *
 * TDD tests for Dynamic Tab System in the sidebar.
 * Liquid Glass styling with active tab highlighting.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Reset localStorage and modules before each test
beforeEach(() => {
  jest.resetModules()
  localStorage.clear()
})

// Mock the tab store
const mockAddTab = jest.fn()
const mockRenameTab = jest.fn()
const mockSwitchTab = jest.fn()
const mockDeleteTab = jest.fn()
const mockDuplicateTab = jest.fn()

const createMockState = (overrides: Record<string, unknown> = {}) => ({
  tabs: [],
  activeTabId: null,
  nextId: 1,
  nextWidgetId: 1,
  hasHydrated: true, // Always true in tests - hydration is complete
  addTab: mockAddTab,
  renameTab: mockRenameTab,
  switchTab: mockSwitchTab,
  deleteTab: mockDeleteTab,
  duplicateTab: mockDuplicateTab,
  updateTabLayout: jest.fn(),
  reorderTabs: jest.fn(),
  addWidget: jest.fn(),
  removeWidget: jest.fn(),
  getActiveTabWidgets: () => [],
  updateWidgetModule: jest.fn(),
  getActiveTab: () => undefined,
  ...overrides,
})

jest.mock('@/lib/stores', () => ({
  useTabStore: jest.fn((selector) => {
    const state = createMockState()
    if (typeof selector === 'function') {
      return selector(state)
    }
    return state
  }),
}))

// Import after mock setup
import { SidebarTabs } from '../SidebarTabs'
import { useTabStore } from '@/lib/stores'

const mockedUseTabStore = useTabStore as jest.MockedFunction<typeof useTabStore>

describe('SidebarTabs', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ===========================================================================
  // Rendering Tests
  // ===========================================================================

  describe('Rendering', () => {
    it('renders tab list container', () => {
      render(<SidebarTabs />)

      expect(screen.getByTestId('sidebar-tabs')).toBeInTheDocument()
    })

    it('renders empty state when no tabs exist', () => {
      render(<SidebarTabs />)

      expect(screen.getByText(/brak zakładek/i)).toBeInTheDocument()
    })

    it('renders "Add Tab" button', () => {
      render(<SidebarTabs />)

      expect(screen.getByTestId('add-tab-btn')).toBeInTheDocument()
    })

    it('renders tabs when they exist', () => {
      mockedUseTabStore.mockImplementation((selector) => {
        const state = createMockState({
          tabs: [
            { id: 'tab-1', name: 'Główny', layout: [], widgets: [], createdAt: Date.now() },
            { id: 'tab-2', name: 'Lidar', layout: [], widgets: [], createdAt: Date.now() },
          ],
          activeTabId: 'tab-1',
        })
        if (typeof selector === 'function') {
          return selector(state)
        }
        return state
      })

      render(<SidebarTabs />)

      expect(screen.getByText('Główny')).toBeInTheDocument()
      expect(screen.getByText('Lidar')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Glass Styling Tests
  // ===========================================================================

  describe('Glass Styling', () => {
    it('tab list has glass-dark styling', () => {
      render(<SidebarTabs />)

      const tabList = screen.getByTestId('sidebar-tabs')
      expect(tabList).toHaveClass('glass-dark')
    })

    it('active tab has highlighted styling', () => {
      mockedUseTabStore.mockImplementation((selector) => {
        const state = createMockState({
          tabs: [
            { id: 'tab-1', name: 'Active Tab', layout: [], widgets: [], createdAt: Date.now() },
          ],
          activeTabId: 'tab-1',
        })
        if (typeof selector === 'function') {
          return selector(state)
        }
        return state
      })

      render(<SidebarTabs />)

      const activeTab = screen.getByTestId('tab-item-tab-1')
      expect(activeTab).toHaveClass('tab-active')
    })

    it('inactive tab does not have highlighted styling', () => {
      mockedUseTabStore.mockImplementation((selector) => {
        const state = createMockState({
          tabs: [
            { id: 'tab-1', name: 'Active', layout: [], widgets: [], createdAt: Date.now() },
            { id: 'tab-2', name: 'Inactive', layout: [], widgets: [], createdAt: Date.now() },
          ],
          activeTabId: 'tab-1',
        })
        if (typeof selector === 'function') {
          return selector(state)
        }
        return state
      })

      render(<SidebarTabs />)

      const inactiveTab = screen.getByTestId('tab-item-tab-2')
      expect(inactiveTab).not.toHaveClass('tab-active')
    })
  })

  // ===========================================================================
  // Add Tab Tests
  // ===========================================================================

  describe('Add Tab', () => {
    it('calls addTab when Add button is clicked', async () => {
      const user = userEvent.setup()
      render(<SidebarTabs />)

      await user.click(screen.getByTestId('add-tab-btn'))

      expect(mockAddTab).toHaveBeenCalledTimes(1)
    })

    it('Add button has plus icon', () => {
      render(<SidebarTabs />)

      const addBtn = screen.getByTestId('add-tab-btn')
      expect(addBtn.querySelector('svg')).toBeInTheDocument()
    })

    it('Add button has accessible label', () => {
      render(<SidebarTabs />)

      const addBtn = screen.getByTestId('add-tab-btn')
      expect(addBtn).toHaveAttribute('aria-label', 'Dodaj zakładkę')
    })
  })

  // ===========================================================================
  // Switch Tab Tests
  // ===========================================================================

  describe('Switch Tab', () => {
    beforeEach(() => {
      mockedUseTabStore.mockImplementation((selector) => {
        const state = createMockState({
          tabs: [
            { id: 'tab-1', name: 'Tab 1', layout: [], widgets: [], createdAt: Date.now() },
            { id: 'tab-2', name: 'Tab 2', layout: [], widgets: [], createdAt: Date.now() },
          ],
          activeTabId: 'tab-1',
        })
        if (typeof selector === 'function') {
          return selector(state)
        }
        return state
      })
    })

    it('calls switchTab when tab is clicked', async () => {
      const user = userEvent.setup()
      render(<SidebarTabs />)

      await user.click(screen.getByText('Tab 2'))

      expect(mockSwitchTab).toHaveBeenCalledWith('tab-2')
    })
  })

  // ===========================================================================
  // Rename Tab Tests
  // ===========================================================================

  describe('Rename Tab', () => {
    beforeEach(() => {
      mockedUseTabStore.mockImplementation((selector) => {
        const state = createMockState({
          tabs: [
            { id: 'tab-1', name: 'Original Name', layout: [], widgets: [], createdAt: Date.now() },
          ],
          activeTabId: 'tab-1',
        })
        if (typeof selector === 'function') {
          return selector(state)
        }
        return state
      })
    })

    it('renders edit button (pencil icon) on each tab', () => {
      render(<SidebarTabs />)

      expect(screen.getByTestId('edit-tab-btn-tab-1')).toBeInTheDocument()
    })

    it('shows input field when edit button is clicked', async () => {
      const user = userEvent.setup()
      render(<SidebarTabs />)

      await user.click(screen.getByTestId('edit-tab-btn-tab-1'))

      expect(screen.getByTestId('tab-name-input-tab-1')).toBeInTheDocument()
    })

    it('input is pre-filled with current tab name', async () => {
      const user = userEvent.setup()
      render(<SidebarTabs />)

      await user.click(screen.getByTestId('edit-tab-btn-tab-1'))

      const input = screen.getByTestId('tab-name-input-tab-1')
      expect(input).toHaveValue('Original Name')
    })

    it('calls renameTab when Enter is pressed', async () => {
      const user = userEvent.setup()
      render(<SidebarTabs />)

      await user.click(screen.getByTestId('edit-tab-btn-tab-1'))
      const input = screen.getByTestId('tab-name-input-tab-1')

      await user.clear(input)
      await user.type(input, 'Nowa Nazwa{Enter}')

      expect(mockRenameTab).toHaveBeenCalledWith('tab-1', 'Nowa Nazwa')
    })

    it('cancels editing when Escape is pressed', async () => {
      const user = userEvent.setup()
      render(<SidebarTabs />)

      await user.click(screen.getByTestId('edit-tab-btn-tab-1'))
      expect(screen.getByTestId('tab-name-input-tab-1')).toBeInTheDocument()

      await user.keyboard('{Escape}')

      await waitFor(() => {
        expect(screen.queryByTestId('tab-name-input-tab-1')).not.toBeInTheDocument()
      })
      expect(mockRenameTab).not.toHaveBeenCalled()
    })

    it('shows input on double-click', async () => {
      const user = userEvent.setup()
      render(<SidebarTabs />)

      const tabName = screen.getByText('Original Name')
      await user.dblClick(tabName)

      expect(screen.getByTestId('tab-name-input-tab-1')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Delete Tab Tests
  // ===========================================================================

  describe('Delete Tab', () => {
    beforeEach(() => {
      mockedUseTabStore.mockImplementation((selector) => {
        const state = createMockState({
          tabs: [
            { id: 'tab-1', name: 'Tab to Delete', layout: [], widgets: [], createdAt: Date.now() },
          ],
          activeTabId: 'tab-1',
        })
        if (typeof selector === 'function') {
          return selector(state)
        }
        return state
      })
    })

    it('renders delete button on each tab', () => {
      render(<SidebarTabs />)

      expect(screen.getByTestId('delete-tab-btn-tab-1')).toBeInTheDocument()
    })

    it('calls deleteTab when delete button is clicked', async () => {
      const user = userEvent.setup()
      render(<SidebarTabs />)

      await user.click(screen.getByTestId('delete-tab-btn-tab-1'))

      expect(mockDeleteTab).toHaveBeenCalledWith('tab-1')
    })

    it('delete button has accessible label', () => {
      render(<SidebarTabs />)

      const deleteBtn = screen.getByTestId('delete-tab-btn-tab-1')
      expect(deleteBtn).toHaveAttribute('aria-label', 'Usuń zakładkę')
    })
  })

  // ===========================================================================
  // Accessibility Tests
  // ===========================================================================

  describe('Accessibility', () => {
    beforeEach(() => {
      mockedUseTabStore.mockImplementation((selector) => {
        const state = createMockState({
          tabs: [
            { id: 'tab-1', name: 'Tab 1', layout: [], widgets: [], createdAt: Date.now() },
            { id: 'tab-2', name: 'Tab 2', layout: [], widgets: [], createdAt: Date.now() },
          ],
          activeTabId: 'tab-1',
        })
        if (typeof selector === 'function') {
          return selector(state)
        }
        return state
      })
    })

    it('uses role="tablist" for tab container', () => {
      render(<SidebarTabs />)

      expect(screen.getByRole('tablist')).toBeInTheDocument()
    })

    it('uses role="tab" for each tab', () => {
      render(<SidebarTabs />)

      const tabs = screen.getAllByRole('tab')
      expect(tabs).toHaveLength(2)
    })

    it('active tab has aria-selected="true"', () => {
      render(<SidebarTabs />)

      const activeTab = screen.getByTestId('tab-item-tab-1')
      expect(activeTab).toHaveAttribute('aria-selected', 'true')
    })

    it('inactive tab has aria-selected="false"', () => {
      render(<SidebarTabs />)

      const inactiveTab = screen.getByTestId('tab-item-tab-2')
      expect(inactiveTab).toHaveAttribute('aria-selected', 'false')
    })
  })

  // ===========================================================================
  // Keyboard Navigation Tests
  // ===========================================================================

  describe('Keyboard Navigation', () => {
    beforeEach(() => {
      mockedUseTabStore.mockImplementation((selector) => {
        const state = createMockState({
          tabs: [
            { id: 'tab-1', name: 'Tab 1', layout: [], widgets: [], createdAt: Date.now() },
            { id: 'tab-2', name: 'Tab 2', layout: [], widgets: [], createdAt: Date.now() },
            { id: 'tab-3', name: 'Tab 3', layout: [], widgets: [], createdAt: Date.now() },
          ],
          activeTabId: 'tab-1',
        })
        if (typeof selector === 'function') {
          return selector(state)
        }
        return state
      })
    })

    it('focuses first tab on initial focus', async () => {
      const user = userEvent.setup()
      render(<SidebarTabs />)

      await user.tab()

      expect(screen.getByTestId('tab-item-tab-1')).toHaveFocus()
    })

    it('ArrowDown switches to next tab', async () => {
      const user = userEvent.setup()
      render(<SidebarTabs />)

      const firstTab = screen.getByTestId('tab-item-tab-1')
      firstTab.focus()

      await user.keyboard('{ArrowDown}')

      expect(mockSwitchTab).toHaveBeenCalledWith('tab-2')
    })

    it('ArrowUp switches to previous tab', async () => {
      mockedUseTabStore.mockImplementation((selector) => {
        const state = createMockState({
          tabs: [
            { id: 'tab-1', name: 'Tab 1', layout: [], widgets: [], createdAt: Date.now() },
            { id: 'tab-2', name: 'Tab 2', layout: [], widgets: [], createdAt: Date.now() },
            { id: 'tab-3', name: 'Tab 3', layout: [], widgets: [], createdAt: Date.now() },
          ],
          activeTabId: 'tab-2',
        })
        if (typeof selector === 'function') {
          return selector(state)
        }
        return state
      })

      const user = userEvent.setup()
      render(<SidebarTabs />)

      const secondTab = screen.getByTestId('tab-item-tab-2')
      secondTab.focus()

      await user.keyboard('{ArrowUp}')

      expect(mockSwitchTab).toHaveBeenCalledWith('tab-1')
    })

    it('Home key switches to first tab', async () => {
      mockedUseTabStore.mockImplementation((selector) => {
        const state = createMockState({
          tabs: [
            { id: 'tab-1', name: 'Tab 1', layout: [], widgets: [], createdAt: Date.now() },
            { id: 'tab-2', name: 'Tab 2', layout: [], widgets: [], createdAt: Date.now() },
            { id: 'tab-3', name: 'Tab 3', layout: [], widgets: [], createdAt: Date.now() },
          ],
          activeTabId: 'tab-3',
        })
        if (typeof selector === 'function') {
          return selector(state)
        }
        return state
      })

      const user = userEvent.setup()
      render(<SidebarTabs />)

      const thirdTab = screen.getByTestId('tab-item-tab-3')
      thirdTab.focus()

      await user.keyboard('{Home}')

      expect(mockSwitchTab).toHaveBeenCalledWith('tab-1')
    })

    it('End key switches to last tab', async () => {
      const user = userEvent.setup()
      render(<SidebarTabs />)

      const firstTab = screen.getByTestId('tab-item-tab-1')
      firstTab.focus()

      await user.keyboard('{End}')

      expect(mockSwitchTab).toHaveBeenCalledWith('tab-3')
    })

    it('active tab has tabIndex=0, inactive tabs have tabIndex=-1', () => {
      render(<SidebarTabs />)

      const activeTab = screen.getByTestId('tab-item-tab-1')
      const inactiveTab = screen.getByTestId('tab-item-tab-2')

      expect(activeTab).toHaveAttribute('tabIndex', '0')
      expect(inactiveTab).toHaveAttribute('tabIndex', '-1')
    })

    it('tabs have aria-controls attribute', () => {
      render(<SidebarTabs />)

      const tab = screen.getByTestId('tab-item-tab-1')
      expect(tab).toHaveAttribute('aria-controls', 'tabpanel-tab-1')
    })
  })

  // ===========================================================================
  // White Typography Tests
  // ===========================================================================

  describe('Typography', () => {
    beforeEach(() => {
      mockedUseTabStore.mockImplementation((selector) => {
        const state = createMockState({
          tabs: [
            { id: 'tab-1', name: 'White Text', layout: [], widgets: [], createdAt: Date.now() },
          ],
          activeTabId: 'tab-1',
        })
        if (typeof selector === 'function') {
          return selector(state)
        }
        return state
      })
    })

    it('tab name has white text color', () => {
      render(<SidebarTabs />)

      const tabName = screen.getByText('White Text')
      expect(tabName).toHaveClass('text-white')
    })
  })
})
