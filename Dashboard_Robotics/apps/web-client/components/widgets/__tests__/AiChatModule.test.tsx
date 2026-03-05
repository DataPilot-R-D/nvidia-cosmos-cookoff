/**
 * AiChatModule Tests
 *
 * Tests for the Vision AI Chat interface component.
 */

import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AiChatModule } from '../AiChatModule'
import { useRobotStore } from '@/lib/stores/robot-store'
import { useCommandStore } from '@/lib/stores/command-store'

// Mock useWebSocket hook
const mockSendVisionLlmRequest = jest.fn()
jest.mock('@/lib/hooks/use-websocket', () => ({
  useWebSocket: jest.fn(() => ({
    sendVisionLlmRequest: mockSendVisionLlmRequest,
    isConnected: true,
  })),
}))

// Mock WebSocket store
jest.mock('@/lib/stores/websocket-store', () => ({
  useWebSocketStore: jest.fn((selector) => {
    const state = {
      rosbridgeConnected: true,
      isConnected: () => true,
    }
    if (typeof selector === 'function') return selector(state)
    return state
  }),
}))

// Mock Vision LLM store
const mockClearHistory = jest.fn()
const mockSetExpandedImage = jest.fn()
jest.mock('@/lib/stores/vision-llm-store', () => ({
  useVisionLlmStore: jest.fn((selector) => {
    const state = {
      messages: [] as Array<{ id: string; role: string; text: string }>,
      status: 'idle',
      expandedImageId: null,
      setExpandedImage: mockSetExpandedImage,
      clearHistory: mockClearHistory,
    }
    if (typeof selector === 'function') return selector(state)
    return state
  }),
}))

// Reset stores before each test
beforeEach(() => {
  jest.clearAllMocks()
  act(() => {
    useRobotStore.getState().clearRobots()
    useCommandStore.getState().clearQueue()
    useCommandStore.getState().selectRobot(null)
    useCommandStore.getState().setEmergencyStop(false)
  })
})

describe('AiChatModule', () => {
  describe('rendering', () => {
    it('should render with correct testid', () => {
      render(<AiChatModule windowId="test-window" />)

      expect(screen.getByTestId('module-ai-chat-test-window')).toBeInTheDocument()
    })

    it('should render input field', () => {
      render(<AiChatModule windowId="test-window" />)

      expect(screen.getByPlaceholderText(/ask about the scene/i)).toBeInTheDocument()
    })

    it('should render send button', () => {
      render(<AiChatModule windowId="test-window" />)

      expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument()
    })

    it('should show header with VISION AI label', () => {
      render(<AiChatModule windowId="test-window" />)

      expect(screen.getByText('VISION AI')).toBeInTheDocument()
    })
  })

  describe('message sending', () => {
    it('should allow typing in input', async () => {
      const user = userEvent.setup()
      render(<AiChatModule windowId="test-window" />)

      const input = screen.getByPlaceholderText(/ask about the scene/i)
      await user.type(input, 'describe what you see')

      expect(input).toHaveValue('describe what you see')
    })

    it('should clear input after sending', async () => {
      const user = userEvent.setup()
      render(<AiChatModule windowId="test-window" />)

      const input = screen.getByPlaceholderText(/ask about the scene/i)
      await user.type(input, 'describe the scene')

      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)

      expect(input).toHaveValue('')
    })

    it('should call sendVisionLlmRequest on send', async () => {
      const user = userEvent.setup()
      render(<AiChatModule windowId="test-window" />)

      const input = screen.getByPlaceholderText(/ask about the scene/i)
      await user.type(input, 'what objects are visible')

      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)

      expect(mockSendVisionLlmRequest).toHaveBeenCalledWith(
        'what objects are visible',
        expect.any(Object)
      )
    })

    it('should send message on Enter key', async () => {
      const user = userEvent.setup()
      render(<AiChatModule windowId="test-window" />)

      const input = screen.getByPlaceholderText(/ask about the scene/i)
      await user.type(input, 'check threats{enter}')

      expect(mockSendVisionLlmRequest).toHaveBeenCalled()
      expect(input).toHaveValue('')
    })

    it('should not send empty message', async () => {
      const user = userEvent.setup()
      render(<AiChatModule windowId="test-window" />)

      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)

      expect(mockSendVisionLlmRequest).not.toHaveBeenCalled()
    })
  })

  describe('command suggestions', () => {
    it('should show quick command buttons', () => {
      render(<AiChatModule windowId="test-window" />)

      expect(screen.getByRole('button', { name: /describe/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /objects/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /threats/i })).toBeInTheDocument()
    })

    it('should trigger vision request on quick command click', async () => {
      const user = userEvent.setup()
      render(<AiChatModule windowId="test-window" />)

      const describeButton = screen.getByRole('button', { name: /describe/i })
      await user.click(describeButton)

      expect(mockSendVisionLlmRequest).toHaveBeenCalled()
    })
  })

  describe('robot context', () => {
    const mockRobot = {
      id: 'robot-1',
      name: 'Alpha',
      status: 'online' as const,
      battery: 75,
      position: { x: 0, y: 0, z: 0 },
      velocity: 0,
      lastSeen: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    it('should show selected robot indicator when robot selected', () => {
      act(() => {
        useRobotStore.getState().setRobot(mockRobot)
        useCommandStore.getState().selectRobot('robot-1')
      })

      render(<AiChatModule windowId="test-window" />)

      expect(screen.getByText('Alpha')).toBeInTheDocument()
    })
  })
})
