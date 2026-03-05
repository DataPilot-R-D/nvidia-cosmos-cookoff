/**
 * IncidentListModule Tests
 *
 * Tests rendering, selection, filtering.
 */

import { render, screen, act, fireEvent } from '@testing-library/react'
import { IncidentListModule } from '../IncidentListModule'
import { useIncidentStore, type Incident } from '@/lib/stores/incident-store'

function createIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'inc-001',
    title: 'Door Forced Open',
    severity: 'critical',
    status: 'new',
    timestamp: '2026-02-11T00:00:00.000Z',
    description: 'Door sensor trip',
    ...overrides,
  }
}

beforeEach(() => {
  act(() => {
    useIncidentStore.setState({
      incidents: new Map([
        [
          'inc-001',
          createIncident({
            id: 'inc-001',
            title: 'Door Forced Open',
            severity: 'critical',
            status: 'new',
            timestamp: '2026-02-11T00:00:00.000Z',
          }),
        ],
        [
          'inc-002',
          createIncident({
            id: 'inc-002',
            title: 'Motion Detected',
            severity: 'warning',
            status: 'acknowledged',
            timestamp: '2026-02-10T12:00:00.000Z',
          }),
        ],
        [
          'inc-003',
          createIncident({
            id: 'inc-003',
            title: 'Camera Offline',
            severity: 'info',
            status: 'resolved',
            timestamp: '2026-02-09T05:00:00.000Z',
          }),
        ],
      ]),
      selectedIncidentId: null,
      filters: {},
    })
  })
})

describe('IncidentListModule', () => {
  it('renders and shows incident rows', () => {
    render(<IncidentListModule windowId="w1" />)

    expect(screen.getByTestId('module-incident-list-w1')).toBeInTheDocument()
    expect(screen.getByText('Door Forced Open')).toBeInTheDocument()
    expect(screen.getByText('Motion Detected')).toBeInTheDocument()
    expect(screen.getByText('Camera Offline')).toBeInTheDocument()
  })

  it('clicking a row selects incident in store and highlights row', () => {
    render(<IncidentListModule windowId="w1" />)

    const row = screen.getByTestId('incident-row-inc-002')
    fireEvent.click(row)

    expect(useIncidentStore.getState().selectedIncidentId).toBe('inc-002')
    expect(screen.getByTestId('incident-row-inc-002')).toHaveAttribute('data-selected', 'true')
  })

  it('filters by severity', () => {
    render(<IncidentListModule windowId="w1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Critical' }))

    expect(screen.getByText('Door Forced Open')).toBeInTheDocument()
    expect(screen.queryByText('Motion Detected')).not.toBeInTheDocument()
    expect(screen.queryByText('Camera Offline')).not.toBeInTheDocument()
  })

  it('filters by status', () => {
    render(<IncidentListModule windowId="w1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }))

    expect(screen.getByText('Camera Offline')).toBeInTheDocument()
    expect(screen.queryByText('Door Forced Open')).not.toBeInTheDocument()
    expect(screen.queryByText('Motion Detected')).not.toBeInTheDocument()
  })
})
