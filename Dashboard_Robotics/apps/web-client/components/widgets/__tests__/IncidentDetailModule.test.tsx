/**
 * IncidentDetailModule Tests
 *
 * Tests placeholder, rendering selected incident, and action buttons.
 */

import { render, screen, fireEvent, act } from '@testing-library/react'
import { IncidentDetailModule } from '../IncidentDetailModule'
import { useIncidentStore, type Incident } from '@/lib/stores/incident-store'

function createIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'inc-001',
    title: 'Door Forced Open',
    severity: 'critical',
    status: 'new',
    timestamp: '2026-02-11T00:00:00.000Z',
    location: 'Loading Bay',
    cameraId: 'cam-01',
    description: 'Door sensor trip at loading bay.',
    ...overrides,
  }
}

beforeEach(() => {
  act(() => {
    useIncidentStore.setState({
      incidents: new Map([
        ['inc-001', createIncident({ id: 'inc-001', status: 'new' })],
        [
          'inc-002',
          createIncident({
            id: 'inc-002',
            title: 'Motion Detected',
            severity: 'warning',
            status: 'acknowledged',
            cameraId: undefined,
            location: undefined,
            timestamp: '2026-02-10T12:00:00.000Z',
          }),
        ],
      ]),
      selectedIncidentId: null,
      filters: {},
    })
  })
})

describe('IncidentDetailModule', () => {
  it('shows placeholder when no incident selected', () => {
    render(<IncidentDetailModule windowId="w2" />)

    expect(screen.getByTestId('module-incident-detail-w2')).toBeInTheDocument()
    expect(screen.getByText('Select an incident to view details')).toBeInTheDocument()
  })

  it('renders selected incident details', () => {
    act(() => {
      useIncidentStore.getState().setSelectedIncident('inc-001')
    })

    render(<IncidentDetailModule windowId="w2" />)

    expect(screen.getByText('Door Forced Open')).toBeInTheDocument()
    expect(screen.getByText('Loading Bay')).toBeInTheDocument()
    expect(screen.getByText('cam-01')).toBeInTheDocument()
    expect(screen.getByText('Door sensor trip at loading bay.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View Camera' })).toBeInTheDocument()
  })

  it('Acknowledge sets status to acknowledged', () => {
    act(() => {
      useIncidentStore.getState().setSelectedIncident('inc-001')
    })
    render(<IncidentDetailModule windowId="w2" />)

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }))

    expect(useIncidentStore.getState().incidents.get('inc-001')?.status).toBe('acknowledged')
  })

  it('Resolve sets status to resolved', () => {
    act(() => {
      useIncidentStore.getState().setSelectedIncident('inc-001')
    })
    render(<IncidentDetailModule windowId="w2" />)

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }))

    expect(useIncidentStore.getState().incidents.get('inc-001')?.status).toBe('resolved')
  })

  it('Escalate is present and does not crash when clicked', () => {
    act(() => {
      useIncidentStore.getState().setSelectedIncident('inc-001')
    })
    render(<IncidentDetailModule windowId="w2" />)

    fireEvent.click(screen.getByRole('button', { name: 'Escalate' }))
    expect(screen.getByRole('button', { name: 'Escalate' })).toBeInTheDocument()
  })
})
