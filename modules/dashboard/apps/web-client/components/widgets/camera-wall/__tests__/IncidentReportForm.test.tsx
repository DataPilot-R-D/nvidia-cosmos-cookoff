/**
 * IncidentReportForm Tests
 *
 * @see Issue #25 — T1.14 Create incident from camera tile
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { IncidentReportForm } from '../IncidentReportForm'
import { useIncidentStore } from '@/lib/stores/incident-store'

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signIn: jest.fn(),
  signOut: jest.fn(),
}))

describe('IncidentReportForm', () => {
  const onClose = jest.fn()

  beforeEach(() => {
    onClose.mockClear()
  })

  it('renders form with type and severity selectors', () => {
    render(<IncidentReportForm cameraId="cam-1" cameraName="Entrance" onClose={onClose} />)

    expect(screen.getByTestId('incident-report-form')).toBeInTheDocument()
    expect(screen.getByTestId('incident-type-anomaly')).toBeInTheDocument()
    expect(screen.getByTestId('incident-type-security')).toBeInTheDocument()
    expect(screen.getByTestId('incident-type-maintenance')).toBeInTheDocument()
    expect(screen.getByTestId('incident-severity-critical')).toBeInTheDocument()
    expect(screen.getByTestId('incident-severity-warning')).toBeInTheDocument()
    expect(screen.getByTestId('incident-severity-info')).toBeInTheDocument()
  })

  it('disables submit when description is empty', () => {
    render(<IncidentReportForm cameraId="cam-1" cameraName="Entrance" onClose={onClose} />)

    const submit = screen.getByTestId('incident-submit')
    expect(submit).toBeDisabled()
  })

  it('enables submit when description is filled', () => {
    render(<IncidentReportForm cameraId="cam-1" cameraName="Entrance" onClose={onClose} />)

    fireEvent.change(screen.getByTestId('incident-description'), {
      target: { value: 'Suspicious activity' },
    })

    expect(screen.getByTestId('incident-submit')).not.toBeDisabled()
  })

  it('creates incident on submit and closes form', () => {
    const initialCount = useIncidentStore.getState().getFilteredIncidents().length

    render(<IncidentReportForm cameraId="cam-1" cameraName="Entrance" onClose={onClose} />)

    // Fill description
    fireEvent.change(screen.getByTestId('incident-description'), {
      target: { value: 'Person in restricted area' },
    })

    // Select security type
    fireEvent.click(screen.getByTestId('incident-type-security'))

    // Select critical severity
    fireEvent.click(screen.getByTestId('incident-severity-critical'))

    // Submit
    fireEvent.click(screen.getByTestId('incident-submit'))

    // Should close form
    expect(onClose).toHaveBeenCalledTimes(1)

    // Should add incident to store
    const incidents = useIncidentStore.getState().getFilteredIncidents()
    expect(incidents.length).toBe(initialCount + 1)

    const newIncident = incidents.find((i) => i.description === 'Person in restricted area')
    expect(newIncident).toBeDefined()
    expect(newIncident?.cameraId).toBe('cam-1')
    expect(newIncident?.severity).toBe('critical')
    expect(newIncident?.title).toContain('SECURITY')
  })

  it('closes on close button click', () => {
    render(<IncidentReportForm cameraId="cam-1" cameraName="Entrance" onClose={onClose} />)

    fireEvent.click(screen.getByTestId('incident-form-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('displays camera info', () => {
    render(<IncidentReportForm cameraId="cam-42" cameraName="Dock" onClose={onClose} />)

    expect(screen.getByText(/cam-42/)).toBeInTheDocument()
    expect(screen.getByText(/Dock/)).toBeInTheDocument()
  })
})
