/**
 * TopBar Component Tests
 *
 * TDD tests for Top Navigation Bar with:
 * - WebSocket status indicator
 * - Connection address input
 * - User profile section
 * - View name and Save button
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TopBar } from '../TopBar'

// Mock stores
const mockSaveLayout = jest.fn()

jest.mock('@/lib/stores', () => ({
  useDashboardStore: jest.fn((selector) => {
    const state = {
      sidebarOpen: true,
      activeLayoutId: 'default',
      layouts: [{ id: 'default', name: 'MAPA Dashboard' }],
      saveLayout: mockSaveLayout,
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

// Mock WebSocket store with configurable state
let mockWsState: {
  status: string
  clientId: string | null
  error: string | null
  isConnected: () => boolean
  hasError: () => boolean
  wsUrl: string
  rosbridgeUrl: string
  rosbridgeConnected: boolean
  setWsUrl: () => void
  changeRosbridgeUrl: () => void
  connect: () => void
} = {
  status: 'connected',
  clientId: 'test-client',
  error: null,
  isConnected: () => true,
  hasError: () => false,
  wsUrl: 'http://localhost:8080',
  rosbridgeUrl: 'ws://localhost:9090',
  rosbridgeConnected: true,
  setWsUrl: jest.fn(),
  changeRosbridgeUrl: jest.fn(),
  connect: jest.fn(),
}

jest.mock('@/lib/stores/websocket-store', () => ({
  useWebSocketStore: jest.fn((selector) => {
    if (typeof selector === 'function') {
      return selector(mockWsState)
    }
    return mockWsState
  }),
}))

describe('TopBar', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset to default connected state
    mockWsState = {
      status: 'connected',
      clientId: 'test-client',
      error: null,
      isConnected: () => true,
      hasError: () => false,
      wsUrl: 'http://localhost:8080',
      rosbridgeUrl: 'ws://localhost:9090',
      rosbridgeConnected: true,
      setWsUrl: jest.fn(),
      changeRosbridgeUrl: jest.fn(),
      connect: jest.fn(),
    }
  })

  // ===========================================================================
  // Rendering Tests
  // ===========================================================================

  describe('Rendering', () => {
    it('renders top bar with fixed positioning', () => {
      render(<TopBar />)

      const topBar = screen.getByTestId('top-bar')
      expect(topBar).toBeInTheDocument()
      expect(topBar).toHaveClass('fixed', 'top-0')
    })

    it('has glass-dark styling', () => {
      render(<TopBar />)

      const topBar = screen.getByTestId('top-bar')
      expect(topBar).toHaveClass('glass-dark')
    })

    it('renders three sections: left, center, right', () => {
      render(<TopBar />)

      expect(screen.getByTestId('topbar-left')).toBeInTheDocument()
      expect(screen.getByTestId('topbar-center')).toBeInTheDocument()
      expect(screen.getByTestId('topbar-right')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Left Section Tests (View Name & Save)
  // ===========================================================================

  describe('Left Section', () => {
    it('renders view name from active tab', () => {
      render(<TopBar />)

      expect(screen.getByText('Widok 1')).toBeInTheDocument()
    })

    it('renders save button', () => {
      render(<TopBar />)

      const saveBtn = screen.getByTestId('topbar-save-btn')
      expect(saveBtn).toBeInTheDocument()
    })

    it('save button calls saveLayout on click', async () => {
      const user = userEvent.setup()
      render(<TopBar />)

      await user.click(screen.getByTestId('topbar-save-btn'))
      expect(mockSaveLayout).toHaveBeenCalledTimes(1)
    })
  })

  // ===========================================================================
  // Center Section Tests (WebSocket Status)
  // ===========================================================================

  describe('Center Section - WebSocket Status', () => {
    it('renders WebSocket address input', () => {
      render(<TopBar />)

      const input = screen.getByTestId('ws-server-input')
      expect(input).toBeInTheDocument()
    })

    it('WebSocket input is editable', async () => {
      const user = userEvent.setup()
      render(<TopBar />)

      const input = screen.getByTestId('ws-server-input')
      await user.clear(input)
      await user.type(input, 'ws://192.168.1.100:9090')

      expect(input).toHaveValue('ws://192.168.1.100:9090')
    })

    it('renders connection status indicator', () => {
      render(<TopBar />)

      const indicator = screen.getByTestId('ws-status-indicator')
      expect(indicator).toBeInTheDocument()
    })

    it('shows green indicator when connected', () => {
      mockWsState = {
        ...mockWsState,
        status: 'connected',
        clientId: 'test-client',
        error: null,
        isConnected: () => true,
        hasError: () => false,
        rosbridgeConnected: true,
      }

      render(<TopBar />)

      const indicator = screen.getByTestId('ws-status-indicator')
      expect(indicator).toHaveClass('bg-green-500')
    })

    it('shows red indicator when disconnected', () => {
      mockWsState = {
        ...mockWsState,
        status: 'disconnected',
        clientId: null,
        error: null,
        isConnected: () => false,
        hasError: () => false,
        rosbridgeConnected: false,
      }

      render(<TopBar />)

      const indicator = screen.getByTestId('ws-status-indicator')
      expect(indicator).toHaveClass('bg-red-500')
    })

    it('shows yellow indicator when connecting', () => {
      mockWsState = {
        ...mockWsState,
        status: 'connected',
        clientId: 'test-client',
        error: null,
        isConnected: () => true,
        hasError: () => false,
        rosbridgeConnected: false,
      }

      render(<TopBar />)

      const indicator = screen.getByTestId('ws-status-indicator')
      expect(indicator).toHaveClass('bg-yellow-500')
    })

    it('renders connect/disconnect toggle button', () => {
      render(<TopBar />)

      const toggleBtn = screen.getByTestId('ws-connect-btn')
      expect(toggleBtn).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Right Section Tests (User Profile)
  // ===========================================================================

  describe('Right Section - User Profile', () => {
    it('renders user profile section', () => {
      render(<TopBar />)

      const profile = screen.getByTestId('topbar-user-profile')
      expect(profile).toBeInTheDocument()
    })

    it('renders user avatar', () => {
      render(<TopBar />)

      const avatar = screen.getByTestId('user-avatar')
      expect(avatar).toBeInTheDocument()
    })

    it('renders settings button', () => {
      render(<TopBar />)

      const settingsBtn = screen.getByTestId('settings-btn')
      expect(settingsBtn).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Accessibility Tests
  // ===========================================================================

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      render(<TopBar />)

      expect(screen.getByLabelText(/WebSocket server address/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/connection status/i)).toBeInTheDocument()
    })

    it('input is focusable via keyboard', async () => {
      const user = userEvent.setup()
      render(<TopBar />)

      await user.tab()
      // Should eventually focus the input
      expect(document.activeElement).not.toBe(document.body)
    })
  })
})
