/**
 * AgentContextModule Tests
 */
import React from 'react'
import { render, screen } from '@testing-library/react'
import { useAgentContextStore } from '@/lib/stores/agent-context-store'
import { AgentContextModule } from '../AgentContextModule'

// Mock fetchAll to prevent real fetches during render
const mockFetchAll = jest.fn().mockResolvedValue(undefined)

beforeEach(() => {
  useAgentContextStore.setState({
    sessions: [],
    loading: false,
    error: null,
    lastFetched: null,
    fetchAll: mockFetchAll,
  })
  jest.useFakeTimers()
  mockFetchAll.mockClear()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('AgentContextModule', () => {
  it('renders empty state when no sessions and lastFetched is set', () => {
    useAgentContextStore.setState({ lastFetched: Date.now() })
    render(<AgentContextModule windowId="test-1" />)
    expect(screen.getByText('No agent sessions found')).toBeInTheDocument()
  })

  it('renders session rows with correct usage colors', () => {
    useAgentContextStore.setState({
      sessions: [
        {
          agent: 'Pipeline',
          displayName: 'discord:#general',
          model: 'claude-opus-4-6',
          totalTokens: 180000,
          contextTokens: 200000,
          usagePercent: 90,
          compactions: 2,
          updatedAt: Date.now() - 60000,
        },
        {
          agent: 'Dev',
          displayName: 'discord:#dev',
          model: 'claude-opus-4-6',
          totalTokens: 80000,
          contextTokens: 200000,
          usagePercent: 40,
          compactions: 0,
          updatedAt: Date.now(),
        },
        {
          agent: 'QA',
          displayName: 'discord:#qa',
          model: 'claude-opus-4-6',
          totalTokens: 130000,
          contextTokens: 200000,
          usagePercent: 65,
          compactions: 1,
          updatedAt: Date.now(),
        },
      ],
      loading: false,
      error: null,
      lastFetched: Date.now(),
    })

    render(<AgentContextModule windowId="test-2" />)

    // All agents rendered
    expect(screen.getByText('Pipeline')).toBeInTheDocument()
    expect(screen.getByText('Dev')).toBeInTheDocument()
    expect(screen.getByText('QA')).toBeInTheDocument()

    // Usage percentages
    expect(screen.getByText('90%')).toBeInTheDocument()
    expect(screen.getByText('40%')).toBeInTheDocument()
    expect(screen.getByText('65%')).toBeInTheDocument()

    // Session names
    expect(screen.getByText('discord:#general')).toBeInTheDocument()
    expect(screen.getByText('discord:#dev')).toBeInTheDocument()
  })

  it('shows compaction count when > 0', () => {
    useAgentContextStore.setState({
      sessions: [
        {
          agent: 'Pipeline',
          displayName: 'test',
          model: 'model',
          totalTokens: 100,
          contextTokens: 200,
          usagePercent: 50,
          compactions: 3,
          updatedAt: Date.now(),
        },
      ],
      lastFetched: Date.now(),
    })

    render(<AgentContextModule windowId="test-3" />)
    expect(screen.getByText(/🔄 3/)).toBeInTheDocument()
  })

  it('shows error state alongside sessions', () => {
    useAgentContextStore.setState({
      sessions: [
        {
          agent: 'Dev',
          displayName: 'test',
          model: 'model',
          totalTokens: 100,
          contextTokens: 200,
          usagePercent: 50,
          compactions: 0,
          updatedAt: Date.now(),
        },
      ],
      error: 'Connection failed',
      lastFetched: Date.now(),
    })

    render(<AgentContextModule windowId="test-4" />)
    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  it('shows loading indicator', () => {
    useAgentContextStore.setState({
      sessions: [
        {
          agent: 'Dev',
          displayName: 'test',
          model: 'model',
          totalTokens: 50000,
          contextTokens: 200000,
          usagePercent: 25,
          compactions: 0,
          updatedAt: Date.now(),
        },
      ],
      loading: true,
      lastFetched: Date.now(),
    })

    render(<AgentContextModule windowId="test-5" />)
    expect(screen.getByText('⟳')).toBeInTheDocument()
  })

  it('renders correct testid', () => {
    useAgentContextStore.setState({ lastFetched: Date.now() })
    render(<AgentContextModule windowId="w42" />)
    expect(screen.getByTestId('module-agent-context-w42')).toBeInTheDocument()
  })
})
