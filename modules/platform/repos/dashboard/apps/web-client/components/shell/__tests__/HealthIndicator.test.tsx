/**
 * HealthIndicator Component Tests
 *
 * @see T0.2 — Video/WS Health panel
 */

import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { HealthIndicator } from '../HealthIndicator'
import { useWebSocketStore } from '@/lib/stores/websocket-store'

// Reset store between tests
beforeEach(() => {
  const { setState } = useWebSocketStore
  setState({
    status: 'disconnected',
    clientId: null,
    error: null,
    socket: null,
    shouldReconnect: false,
    rosbridgeConnected: false,
    reconnectCount: 0,
    lastErrorAt: null,
  })
})

describe('HealthIndicator', () => {
  it('renders with disconnected state', () => {
    render(<HealthIndicator />)
    expect(screen.getByTestId('health-indicator')).toBeInTheDocument()
    expect(screen.getByTestId('health-toggle')).toHaveTextContent('Disconnected')
  })

  it('shows healthy when both WS and ROSBridge connected', () => {
    useWebSocketStore.setState({
      status: 'connected',
      clientId: 'test-id',
      rosbridgeConnected: true,
      reconnectCount: 0,
    })

    render(<HealthIndicator />)
    expect(screen.getByTestId('health-toggle')).toHaveTextContent('All Systems OK')
  })

  it('shows degraded when WS connected but ROSBridge not', () => {
    useWebSocketStore.setState({
      status: 'connected',
      clientId: 'test-id',
      rosbridgeConnected: false,
    })

    render(<HealthIndicator />)
    expect(screen.getByTestId('health-toggle')).toHaveTextContent('Degraded')
  })

  it('shows reconnect badge when reconnectCount > 0', () => {
    useWebSocketStore.setState({
      status: 'connected',
      clientId: 'test-id',
      reconnectCount: 3,
    })

    render(<HealthIndicator />)
    expect(screen.getByTestId('reconnect-badge')).toHaveTextContent('↻3')
  })

  it('does not show reconnect badge when count is 0', () => {
    useWebSocketStore.setState({
      status: 'connected',
      clientId: 'test-id',
      reconnectCount: 0,
    })

    render(<HealthIndicator />)
    expect(screen.queryByTestId('reconnect-badge')).not.toBeInTheDocument()
  })

  it('expands panel on click', () => {
    render(<HealthIndicator />)
    expect(screen.queryByTestId('health-panel')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('health-toggle'))
    expect(screen.getByTestId('health-panel')).toBeInTheDocument()
  })

  it('shows detailed status in expanded panel', () => {
    useWebSocketStore.setState({
      status: 'connected',
      clientId: 'test-id',
      rosbridgeConnected: true,
      reconnectCount: 2,
      error: 'timeout',
      lastErrorAt: Date.now() - 30_000,
    })

    render(<HealthIndicator />)
    fireEvent.click(screen.getByTestId('health-toggle'))

    expect(screen.getByTestId('ws-status')).toHaveTextContent('Connected')
    expect(screen.getByTestId('rosbridge-status')).toHaveTextContent('Reachable')
    expect(screen.getByTestId('reconnect-count')).toHaveTextContent('2')
    expect(screen.getByTestId('last-error')).toHaveTextContent(/timeout/)
  })

  it('shows reconnecting status in panel', () => {
    useWebSocketStore.setState({
      status: 'reconnecting',
      clientId: null,
      reconnectCount: 1,
    })

    render(<HealthIndicator />)
    fireEvent.click(screen.getByTestId('health-toggle'))

    expect(screen.getByTestId('ws-status')).toHaveTextContent('Reconnecting…')
  })

  it('collapses panel on second click', () => {
    render(<HealthIndicator />)
    const toggle = screen.getByTestId('health-toggle')

    fireEvent.click(toggle)
    expect(screen.getByTestId('health-panel')).toBeInTheDocument()

    fireEvent.click(toggle)
    expect(screen.queryByTestId('health-panel')).not.toBeInTheDocument()
  })

  it('shows dash when no error', () => {
    render(<HealthIndicator />)
    fireEvent.click(screen.getByTestId('health-toggle'))
    expect(screen.getByTestId('last-error')).toHaveTextContent('—')
  })
})
