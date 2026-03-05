import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { TrustDashboardModule } from '../TrustDashboardModule'
import { useTrustStore, type TrustScore } from '@/lib/stores/trust-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'

jest.mock('@/lib/stores/websocket-store', () => ({
  useWebSocketStore: jest.fn(),
}))

const mockScore = (overrides: Partial<TrustScore> = {}): TrustScore => ({
  id: 'ts-1',
  robotId: 'robot-alpha',
  confidenceScore: 85,
  riskLevel: 'low',
  handoverStatus: 'autonomous',
  reasons: '[]',
  recommendations: '["All systems nominal — autonomous operation safe"]',
  sensorHealth: null,
  metadata: null,
  createdAt: '2026-02-11T08:00:00Z',
  updatedAt: '2026-02-11T08:00:00Z',
  ...overrides,
})

describe('TrustDashboardModule', () => {
  beforeEach(() => {
    useTrustStore.getState().setScores([])
    useTrustStore.getState().setSelectedRobot(null)
    ;(useWebSocketStore as unknown as jest.Mock).mockImplementation((selector: unknown) => {
      if (typeof selector === 'function') {
        return (selector as (s: { socket: null }) => unknown)({ socket: null })
      }
      return null
    })
  })

  it('renders empty state', () => {
    render(<TrustDashboardModule />)
    expect(screen.getByText('No robot trust data')).toBeInTheDocument()
  })

  it('renders robot trust cards', () => {
    useTrustStore
      .getState()
      .setScores([
        mockScore({ robotId: 'robot-alpha', confidenceScore: 90, riskLevel: 'low' }),
        mockScore({ robotId: 'robot-beta', confidenceScore: 30, riskLevel: 'high' }),
      ])

    render(<TrustDashboardModule />)
    expect(screen.getByText('2 robots')).toBeInTheDocument()
    expect(screen.getByText(/robot-alpha/)).toBeInTheDocument()
    expect(screen.getByText(/robot-beta/)).toBeInTheDocument()
  })

  it('shows attention warning for high/critical risk', () => {
    useTrustStore.getState().setScores([mockScore({ robotId: 'r1', riskLevel: 'critical' })])

    render(<TrustDashboardModule />)
    expect(screen.getByText(/Attention needed/)).toBeInTheDocument()
  })

  it('shows detail panel with recommendations on select', () => {
    useTrustStore.getState().setScores([
      mockScore({
        robotId: 'robot-alpha',
        recommendations: '["Check lidar sensor","Increase monitoring"]',
      }),
    ])

    render(<TrustDashboardModule />)
    fireEvent.click(screen.getByText(/robot-alpha/))

    expect(screen.getByText('Why Intervene')).toBeInTheDocument()
    expect(screen.getByText('Check lidar sensor')).toBeInTheDocument()
    expect(screen.getByText('Increase monitoring')).toBeInTheDocument()
  })

  it('shows sensor health in detail panel', () => {
    useTrustStore.getState().setScores([
      mockScore({
        robotId: 'robot-alpha',
        sensorHealth: JSON.stringify({ lidar: 95, camera: 60 }),
      }),
    ])

    render(<TrustDashboardModule />)
    fireEvent.click(screen.getByText(/robot-alpha/))

    expect(screen.getByText('Sensor Health')).toBeInTheDocument()
    expect(screen.getByText('lidar')).toBeInTheDocument()
    expect(screen.getByText('camera')).toBeInTheDocument()
  })

  it('shows handover controls in detail panel', () => {
    useTrustStore.getState().setScores([mockScore({ robotId: 'robot-alpha' })])

    render(<TrustDashboardModule />)
    fireEvent.click(screen.getByText(/robot-alpha/))

    expect(screen.getByText('Handover Controls')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Autonomous' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Manual' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'E-STOP' })).toBeInTheDocument()
  })

  it('sorts robots by risk level (critical first)', () => {
    useTrustStore
      .getState()
      .setScores([
        mockScore({ robotId: 'safe-bot', riskLevel: 'low' }),
        mockScore({ robotId: 'danger-bot', riskLevel: 'critical' }),
      ])

    render(<TrustDashboardModule />)
    const buttons = screen.getAllByRole('button')
    // First robot button should be the critical one
    const robotButtons = buttons.filter(
      (b) => b.textContent?.includes('robot') || b.textContent?.includes('bot')
    )
    expect(robotButtons[0]?.textContent).toContain('danger-bot')
  })

  it('shows confidence percentage', () => {
    useTrustStore.getState().setScores([mockScore({ robotId: 'r1', confidenceScore: 42 })])

    render(<TrustDashboardModule />)
    expect(screen.getByText('42%')).toBeInTheDocument()
  })
})
