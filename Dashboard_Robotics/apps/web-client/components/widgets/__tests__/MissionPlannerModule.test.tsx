import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MissionPlannerModule } from '../MissionPlannerModule'
import { useMissionStore, type Mission } from '../../../lib/stores/mission-store'

// ── Mocks ────────────────────────────────────────────────

class MockWebSocket {
  onmessage: ((evt: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  close = jest.fn()
}

;(global as unknown as Record<string, unknown>).WebSocket = jest.fn(() => new MockWebSocket())

const mockFetch = jest.fn()
;(global as unknown as Record<string, unknown>).fetch = mockFetch

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'mission-1',
  name: 'Patrol Alpha',
  type: 'patrol',
  waypoints: [{ x: 1, y: 2, z: 0 }],
  robotId: null,
  status: 'pending',
  createdAt: '2026-02-11T00:00:00.000Z',
  updatedAt: '2026-02-11T00:00:00.000Z',
  ...overrides,
})

describe('MissionPlannerModule', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useMissionStore.setState({
      missions: new Map(),
      selectedMissionId: null,
      filters: {},
      loading: false,
      error: null,
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
  })

  it('renders header and empty state', async () => {
    render(<MissionPlannerModule windowId="w1" />)
    expect(screen.getByText('Mission Planner')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('No missions')).toBeInTheDocument()
    })
  })

  it('renders mission list from API', async () => {
    const missions = [
      makeMission(),
      makeMission({ id: 'mission-2', name: 'Inspect Beta', type: 'inspect' }),
    ]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(missions),
    })

    render(<MissionPlannerModule windowId="w1" />)

    await waitFor(() => {
      expect(screen.getByText('Patrol Alpha')).toBeInTheDocument()
      expect(screen.getByText('Inspect Beta')).toBeInTheDocument()
    })
  })

  it('shows create form on "+ New" click', async () => {
    render(<MissionPlannerModule windowId="w1" />)
    fireEvent.click(screen.getByText('+ New'))
    expect(screen.getByTestId('mission-name-input')).toBeInTheDocument()
    expect(screen.getByTestId('mission-type-select')).toBeInTheDocument()
    expect(screen.getByTestId('mission-create-btn')).toBeInTheDocument()
  })

  it('creates a mission via form', async () => {
    const created = makeMission({ id: 'new-1', name: 'New Mission' })
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(created) })

    render(<MissionPlannerModule windowId="w1" />)
    fireEvent.click(screen.getByText('+ New'))

    fireEvent.change(screen.getByTestId('mission-name-input'), {
      target: { value: 'New Mission' },
    })
    fireEvent.click(screen.getByTestId('mission-create-btn'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/missions'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('dispatches a pending mission', async () => {
    const mission = makeMission({ status: 'pending' })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([mission]),
    })

    render(<MissionPlannerModule windowId="w1" />)

    await waitFor(() => {
      expect(screen.getByText('Patrol Alpha')).toBeInTheDocument()
    })

    const dispatched = { ...mission, status: 'dispatched' as const }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(dispatched),
    })

    fireEvent.click(screen.getByTitle('Dispatch'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/missions/mission-1/dispatch'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('has correct data-testid', () => {
    render(<MissionPlannerModule windowId="test-42" />)
    expect(screen.getByTestId('module-mission-planner-test-42')).toBeInTheDocument()
  })
})
