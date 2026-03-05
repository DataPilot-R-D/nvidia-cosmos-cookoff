import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { MissionDashboardModule } from '../MissionDashboardModule'
import { useMissionStore, type Mission } from '@/lib/stores/mission-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'

// Mock websocket store
jest.mock('@/lib/stores/websocket-store', () => ({
  useWebSocketStore: jest.fn(),
}))

const mockMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'mission-1',
  name: 'Patrol Alpha',
  type: 'patrol',
  waypoints: [
    { x: 1, y: 2, z: 0 },
    { x: 3, y: 4, z: 0 },
  ],
  robotId: 'robot-abc-123',
  status: 'in_progress',
  createdAt: '2026-02-11T00:00:00Z',
  updatedAt: '2026-02-11T00:00:00Z',
  ...overrides,
})

describe('MissionDashboardModule', () => {
  beforeEach(() => {
    // Reset mission store
    useMissionStore.getState().setMissions([])
    ;(useWebSocketStore as unknown as jest.Mock).mockImplementation((selector: unknown) => {
      if (typeof selector === 'function') {
        return (selector as (s: { socket: null }) => unknown)({ socket: null })
      }
      return null
    })
  })

  it('renders empty state when no missions', () => {
    render(<MissionDashboardModule />)
    expect(screen.getByText('No missions found')).toBeInTheDocument()
  })

  it('renders stat cards with correct counts', () => {
    useMissionStore
      .getState()
      .setMissions([
        mockMission({ id: '1', status: 'in_progress' }),
        mockMission({ id: '2', status: 'completed' }),
        mockMission({ id: '3', status: 'failed' }),
        mockMission({ id: '4', status: 'pending' }),
      ])

    render(<MissionDashboardModule />)

    // Check stat labels exist
    expect(screen.getAllByText('Total').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Failed').length).toBeGreaterThan(0)
    // Total = 4
    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('renders mission rows with name and status', () => {
    useMissionStore
      .getState()
      .setMissions([
        mockMission({ id: '1', name: 'Patrol Alpha', status: 'in_progress' }),
        mockMission({ id: '2', name: 'Inspect Beta', status: 'completed' }),
      ])

    render(<MissionDashboardModule />)

    expect(screen.getByText('Patrol Alpha')).toBeInTheDocument()
    expect(screen.getByText('Inspect Beta')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('shows waypoint count', () => {
    useMissionStore.getState().setMissions([
      mockMission({
        id: '1',
        waypoints: [
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 1, z: 0 },
          { x: 2, y: 2, z: 0 },
        ],
      }),
    ])

    render(<MissionDashboardModule />)
    expect(screen.getByText('3 waypoints')).toBeInTheDocument()
  })

  it('shows robot assignment', () => {
    useMissionStore
      .getState()
      .setMissions([mockMission({ id: '1', robotId: 'robot-abc-12345678' })])

    render(<MissionDashboardModule />)
    expect(screen.getByText('🤖 robot-ab')).toBeInTheDocument()
  })

  it('shows Unassigned for null robotId', () => {
    useMissionStore.getState().setMissions([mockMission({ id: '1', robotId: null })])

    render(<MissionDashboardModule />)
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
  })

  it('filters missions by status', () => {
    useMissionStore
      .getState()
      .setMissions([
        mockMission({ id: '1', name: 'Active One', status: 'in_progress' }),
        mockMission({ id: '2', name: 'Done One', status: 'completed' }),
      ])

    render(<MissionDashboardModule />)

    // Click "Done" filter button
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.queryByText('Active One')).not.toBeInTheDocument()
    expect(screen.getByText('Done One')).toBeInTheDocument()
  })

  it('filter "All" shows everything', () => {
    useMissionStore
      .getState()
      .setMissions([
        mockMission({ id: '1', name: 'A', status: 'in_progress' }),
        mockMission({ id: '2', name: 'B', status: 'completed' }),
      ])

    render(<MissionDashboardModule />)

    // Click "Done" then "All"
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'All' }))

    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
  })
})
