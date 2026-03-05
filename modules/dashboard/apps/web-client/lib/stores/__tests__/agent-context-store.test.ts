/**
 * Agent Context Store Tests
 */
import { useAgentContextStore } from '../agent-context-store'

beforeEach(() => {
  useAgentContextStore.setState({
    sessions: [],
    loading: false,
    error: null,
    lastFetched: null,
  })
})

describe('agent-context-store', () => {
  it('has correct initial state', () => {
    const state = useAgentContextStore.getState()
    expect(state.sessions).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.lastFetched).toBeNull()
  })

  it('setSessions updates state', () => {
    const sessions = [
      {
        agent: 'Dev',
        displayName: 'test1',
        model: 'm',
        totalTokens: 50000,
        contextTokens: 200000,
        usagePercent: 25,
        compactions: 0,
        updatedAt: Date.now(),
      },
    ]

    useAgentContextStore.getState().setSessions(sessions)
    const state = useAgentContextStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.lastFetched).not.toBeNull()
    expect(state.loading).toBe(false)
  })

  it('setError clears loading', () => {
    useAgentContextStore.setState({ loading: true })
    useAgentContextStore.getState().setError('fail')
    const state = useAgentContextStore.getState()
    expect(state.error).toBe('fail')
    expect(state.loading).toBe(false)
  })

  it('fetchAll sets error on network failure', async () => {
    const originalFetch = global.fetch
    global.fetch = jest.fn().mockRejectedValue(new Error('network'))

    await useAgentContextStore.getState().fetchAll()
    const state = useAgentContextStore.getState()
    expect(state.error).toBe('Failed to fetch agent context')
    expect(state.loading).toBe(false)

    global.fetch = originalFetch
  })

  it('fetchAll sets allUnreachable error', async () => {
    const originalFetch = global.fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sessions: [],
          allUnreachable: true,
          fetchedAt: Date.now(),
        }),
    })

    await useAgentContextStore.getState().fetchAll()
    const state = useAgentContextStore.getState()
    expect(state.error).toBe('All agents unreachable')
    expect(state.sessions).toEqual([])

    global.fetch = originalFetch
  })

  it('fetchAll parses API response correctly', async () => {
    const originalFetch = global.fetch
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          sessions: [
            {
              agent: 'Pipeline',
              displayName: 'discord:#general',
              model: 'claude-opus-4-6',
              totalTokens: 150000,
              contextTokens: 200000,
              usagePercent: 75,
              compactions: 2,
              updatedAt: Date.now(),
            },
          ],
          allUnreachable: false,
          fetchedAt: Date.now(),
        }),
    })

    await useAgentContextStore.getState().fetchAll()
    const state = useAgentContextStore.getState()
    expect(state.sessions).toHaveLength(1)
    expect(state.sessions[0].agent).toBe('Pipeline')
    expect(state.sessions[0].usagePercent).toBe(75)
    expect(state.error).toBeNull()

    global.fetch = originalFetch
  })
})
