/**
 * HealthIndicator Component Tests
 *
 * @see T0.2 — Video/WS Health panel
 */

import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { HealthIndicator } from '../HealthIndicator'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import { useCameraSourceStore } from '@/lib/stores/camera-source-store'
import { useWebRTCConnectionStore } from '@/lib/stores/webrtc-connection-store'

// Mock fetch for go2rtc health check
const originalFetch = globalThis.fetch
beforeAll(() => {
  globalThis.fetch = jest.fn().mockResolvedValue({ ok: true } as Response)
})
afterAll(() => {
  globalThis.fetch = originalFetch
})

// Reset stores between tests
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
  useCameraSourceStore.getState().reset()
  useWebRTCConnectionStore.getState().reset()
})

describe('HealthIndicator', () => {
  it('renders with disconnected state', () => {
    render(<HealthIndicator />)
    expect(screen.getByTestId('health-indicator')).toBeInTheDocument()
    expect(screen.getByTestId('health-toggle')).toHaveTextContent('Disconnected')
  })

  it('shows healthy when WS, ROSBridge connected, and go2rtc online', async () => {
    useWebSocketStore.setState({
      status: 'connected',
      clientId: 'test-id',
      rosbridgeConnected: true,
      reconnectCount: 0,
    })

    // fetch mock resolves synchronously so go2rtc will be online
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({ ok: true } as Response)

    await act(async () => {
      render(<HealthIndicator />)
      // Flush the go2rtc health check promise
      await Promise.resolve()
      await Promise.resolve()
    })
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

  it('shows go2rtc status in expanded panel', () => {
    useWebSocketStore.setState({ status: 'connected', clientId: 'x' })
    render(<HealthIndicator />)
    fireEvent.click(screen.getByTestId('health-toggle'))
    expect(screen.getByTestId('go2rtc-status')).toBeInTheDocument()
  })

  it('shows camera health metrics in expanded panel', () => {
    useWebSocketStore.setState({ status: 'connected', clientId: 'x' })
    render(<HealthIndicator />)
    fireEvent.click(screen.getByTestId('health-toggle'))
    expect(screen.getByTestId('camera-health')).toBeInTheDocument()
  })

  it('shows WebRTC connection count in expanded panel', () => {
    useWebSocketStore.setState({ status: 'connected', clientId: 'x' })
    useWebRTCConnectionStore.getState().acquire('cam-1')
    useWebRTCConnectionStore.getState().acquire('cam-2')

    render(<HealthIndicator />)
    fireEvent.click(screen.getByTestId('health-toggle'))
    expect(screen.getByTestId('webrtc-health')).toHaveTextContent('2/4')
  })

  it('shows alert dot when cameras are offline', () => {
    useWebSocketStore.setState({ status: 'disconnected', clientId: null })
    render(<HealthIndicator />)
    expect(screen.getByTestId('health-alert-dot')).toBeInTheDocument()
  })
})
