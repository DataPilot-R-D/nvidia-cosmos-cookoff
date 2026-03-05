/**
 * WebSocket Connection Store Tests
 *
 * TDD Tests for WebSocket connection state management.
 * Tests follow the plan.md specification for Step 1.
 */

import { useWebSocketStore, type WebSocketState } from '../websocket-store'

describe('WebSocket Store', () => {
  // Reset store state before each test
  beforeEach(() => {
    useWebSocketStore.setState({
      status: 'disconnected',
      clientId: null,
      error: null,
      reconnectCount: 0,
      lastErrorAt: null,
    })
  })

  describe('Initial State', () => {
    it('should have status "disconnected" initially', () => {
      const state = useWebSocketStore.getState()
      expect(state.status).toBe('disconnected')
    })

    it('should have clientId null initially', () => {
      const state = useWebSocketStore.getState()
      expect(state.clientId).toBeNull()
    })

    it('should have error null initially', () => {
      const state = useWebSocketStore.getState()
      expect(state.error).toBeNull()
    })

    it('should match expected initial state shape', () => {
      const state = useWebSocketStore.getState()
      expect(state).toMatchObject({
        status: 'disconnected',
        clientId: null,
        error: null,
      })
    })
  })

  describe('connect()', () => {
    it('should set status to "connecting" when connect() is called', () => {
      const { connect } = useWebSocketStore.getState()

      connect()

      const state = useWebSocketStore.getState()
      expect(state.status).toBe('connecting')
    })

    it('should clear any previous error when connect() is called', () => {
      // First set an error state
      useWebSocketStore.setState({ error: 'Previous error' })

      const { connect } = useWebSocketStore.getState()
      connect()

      const state = useWebSocketStore.getState()
      expect(state.error).toBeNull()
    })

    it('should maintain clientId as null while connecting', () => {
      const { connect } = useWebSocketStore.getState()
      connect()

      const state = useWebSocketStore.getState()
      expect(state.clientId).toBeNull()
    })
  })

  describe('setConnected(clientId)', () => {
    it('should set status to "connected" when setConnected() is called', () => {
      const { setConnected } = useWebSocketStore.getState()

      setConnected('client-123')

      const state = useWebSocketStore.getState()
      expect(state.status).toBe('connected')
    })

    it('should set clientId to provided value', () => {
      const { setConnected } = useWebSocketStore.getState()

      setConnected('client-456')

      const state = useWebSocketStore.getState()
      expect(state.clientId).toBe('client-456')
    })

    it('should clear any previous error when connected', () => {
      useWebSocketStore.setState({ error: 'Previous error' })

      const { setConnected } = useWebSocketStore.getState()
      setConnected('client-789')

      const state = useWebSocketStore.getState()
      expect(state.error).toBeNull()
    })

    it('should handle different clientId formats', () => {
      const { setConnected } = useWebSocketStore.getState()

      setConnected('uuid-a1b2c3d4-e5f6-7890-abcd-ef1234567890')

      const state = useWebSocketStore.getState()
      expect(state.clientId).toBe('uuid-a1b2c3d4-e5f6-7890-abcd-ef1234567890')
    })
  })

  describe('disconnect()', () => {
    it('should set status to "disconnected" when disconnect() is called', () => {
      // First connect
      useWebSocketStore.setState({ status: 'connected', clientId: 'client-123' })

      const { disconnect } = useWebSocketStore.getState()
      disconnect()

      const state = useWebSocketStore.getState()
      expect(state.status).toBe('disconnected')
    })

    it('should set clientId to null when disconnect() is called', () => {
      useWebSocketStore.setState({ status: 'connected', clientId: 'client-123' })

      const { disconnect } = useWebSocketStore.getState()
      disconnect()

      const state = useWebSocketStore.getState()
      expect(state.clientId).toBeNull()
    })

    it('should clear error when disconnect() is called', () => {
      useWebSocketStore.setState({
        status: 'error',
        clientId: 'client-123',
        error: 'Connection lost',
      })

      const { disconnect } = useWebSocketStore.getState()
      disconnect()

      const state = useWebSocketStore.getState()
      expect(state.error).toBeNull()
    })

    it('should work when already disconnected', () => {
      const { disconnect } = useWebSocketStore.getState()
      disconnect()

      const state = useWebSocketStore.getState()
      expect(state.status).toBe('disconnected')
      expect(state.clientId).toBeNull()
    })
  })

  describe('setError(message)', () => {
    it('should set status to "error" when setError() is called', () => {
      const { setError } = useWebSocketStore.getState()

      setError('Connection failed')

      const state = useWebSocketStore.getState()
      expect(state.status).toBe('error')
    })

    it('should set error message when setError() is called', () => {
      const { setError } = useWebSocketStore.getState()

      setError('Server unreachable')

      const state = useWebSocketStore.getState()
      expect(state.error).toBe('Server unreachable')
    })

    it('should preserve clientId when error occurs during connected state', () => {
      useWebSocketStore.setState({ status: 'connected', clientId: 'client-123' })

      const { setError } = useWebSocketStore.getState()
      setError('Heartbeat timeout')

      const state = useWebSocketStore.getState()
      expect(state.clientId).toBe('client-123')
    })

    it('should handle empty error message', () => {
      const { setError } = useWebSocketStore.getState()

      setError('')

      const state = useWebSocketStore.getState()
      expect(state.status).toBe('error')
      expect(state.error).toBe('')
    })
  })

  describe('setReconnecting()', () => {
    it('should set status to "reconnecting" when setReconnecting() is called', () => {
      useWebSocketStore.setState({ status: 'disconnected', clientId: null })

      const { setReconnecting } = useWebSocketStore.getState()
      setReconnecting()

      const state = useWebSocketStore.getState()
      expect(state.status).toBe('reconnecting')
    })

    it('should preserve clientId during reconnection', () => {
      useWebSocketStore.setState({ status: 'error', clientId: 'client-123' })

      const { setReconnecting } = useWebSocketStore.getState()
      setReconnecting()

      const state = useWebSocketStore.getState()
      expect(state.clientId).toBe('client-123')
    })
  })

  describe('State Immutability', () => {
    it('should create new state objects on updates (immutability check)', () => {
      const initialState = useWebSocketStore.getState()

      const { connect } = initialState
      connect()

      const newState = useWebSocketStore.getState()

      // State reference should be different (immutable)
      expect(newState).not.toBe(initialState)
    })
  })

  describe('Type Safety (compile-time)', () => {
    it('should export WebSocketState type correctly', () => {
      const state: WebSocketState = useWebSocketStore.getState()

      // Type assertions - these should compile without errors
      expect(typeof state.status).toBe('string')
      expect(state.clientId === null || typeof state.clientId === 'string').toBe(true)
      expect(state.error === null || typeof state.error === 'string').toBe(true)
    })
  })

  describe('Selectors', () => {
    it('should provide isConnected selector', () => {
      const { isConnected } = useWebSocketStore.getState()

      useWebSocketStore.setState({ status: 'disconnected' })
      expect(isConnected()).toBe(false)

      useWebSocketStore.setState({ status: 'connected' })
      expect(isConnected()).toBe(true)
    })

    it('should provide hasError selector', () => {
      const { hasError } = useWebSocketStore.getState()

      useWebSocketStore.setState({ error: null })
      expect(hasError()).toBe(false)

      useWebSocketStore.setState({ error: 'Some error' })
      expect(hasError()).toBe(true)
    })
  })

  describe('Health Metrics', () => {
    it('should have reconnectCount 0 initially', () => {
      const state = useWebSocketStore.getState()
      expect(state.reconnectCount).toBe(0)
    })

    it('should have lastErrorAt null initially', () => {
      const state = useWebSocketStore.getState()
      expect(state.lastErrorAt).toBeNull()
    })

    it('should increment reconnectCount on setReconnecting()', () => {
      const { setReconnecting } = useWebSocketStore.getState()
      setReconnecting()
      expect(useWebSocketStore.getState().reconnectCount).toBe(1)
      setReconnecting()
      expect(useWebSocketStore.getState().reconnectCount).toBe(2)
    })

    it('should reset reconnectCount on setConnected()', () => {
      useWebSocketStore.setState({ reconnectCount: 5 })
      const { setConnected } = useWebSocketStore.getState()
      setConnected('client-123')
      expect(useWebSocketStore.getState().reconnectCount).toBe(0)
    })

    it('should set lastErrorAt on setError()', () => {
      const before = Date.now()
      const { setError } = useWebSocketStore.getState()
      setError('timeout')
      const state = useWebSocketStore.getState()
      expect(state.lastErrorAt).toBeGreaterThanOrEqual(before)
      expect(state.lastErrorAt).toBeLessThanOrEqual(Date.now())
    })
  })
})
