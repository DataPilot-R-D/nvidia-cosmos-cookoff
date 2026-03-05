/**
 * AuditLogModule Tests
 *
 * @see Issue #28 — T2.4 Audit Viewer FE + filtry
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AuditLogModule } from '../AuditLogModule'

// =============================================================================
// Mock Data
// =============================================================================

const mockEntries = [
  {
    id: 1,
    timestamp: '2026-02-19T10:00:00Z',
    userId: 'admin-01',
    userRole: 'admin',
    action: 'estop.trigger',
    params: null,
    result: 'ok',
    reason: 'Emergency stop activated',
  },
  {
    id: 2,
    timestamp: '2026-02-19T09:00:00Z',
    userId: 'viewer-02',
    userRole: 'viewer',
    action: 'camera.control',
    params: '{"cameraId":"cam-1"}',
    result: 'denied',
    reason: 'Insufficient permissions',
  },
  {
    id: 3,
    timestamp: '2026-02-19T08:00:00Z',
    userId: 'operator-03',
    userRole: 'operator',
    action: 'navigation.set-goal',
    params: '{"x":1,"y":2}',
    result: 'ok',
    reason: null,
  },
]

// =============================================================================
// Fetch Mock
// =============================================================================

const mockFetch = jest.fn()
beforeAll(() => {
  global.fetch = mockFetch
})

beforeEach(() => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ entries: mockEntries, total: mockEntries.length }),
  })
})

afterEach(() => {
  mockFetch.mockClear()
})

// =============================================================================
// Tests
// =============================================================================

describe('AuditLogModule', () => {
  it('renders audit entries after fetch', async () => {
    render(<AuditLogModule windowId="test-1" />)

    await waitFor(() => {
      expect(screen.getByText('estop.trigger')).toBeInTheDocument()
    })

    expect(screen.getByText('camera.control')).toBeInTheDocument()
    expect(screen.getByText('admin-01')).toBeInTheDocument()
    expect(screen.getByText('denied')).toBeInTheDocument()
  })

  it('shows loading state', () => {
    mockFetch.mockReturnValue(new Promise(() => {})) // never resolves
    render(<AuditLogModule windowId="test-2" />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows error on fetch failure', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })

    render(<AuditLogModule windowId="test-3" />)

    await waitFor(() => {
      expect(screen.getByText(/Error/)).toBeInTheDocument()
    })
  })

  it('filters by text search (client-side)', async () => {
    render(<AuditLogModule windowId="test-4" />)

    await waitFor(() => {
      expect(screen.getByText('estop.trigger')).toBeInTheDocument()
    })

    const search = screen.getByTestId('audit-search')
    fireEvent.change(search, { target: { value: 'estop' } })

    expect(screen.getByText('estop.trigger')).toBeInTheDocument()
    expect(screen.queryByText('camera.control')).not.toBeInTheDocument()
  })

  it('shows "No matching entries" when search has no results', async () => {
    render(<AuditLogModule windowId="test-5" />)

    await waitFor(() => {
      expect(screen.getByText('estop.trigger')).toBeInTheDocument()
    })

    const search = screen.getByTestId('audit-search')
    fireEvent.change(search, { target: { value: 'nonexistent_xyz' } })

    expect(screen.getByText('No matching entries')).toBeInTheDocument()
  })

  it('has result filter dropdown', async () => {
    render(<AuditLogModule windowId="test-6" />)

    await waitFor(() => {
      expect(screen.getByText('estop.trigger')).toBeInTheDocument()
    })

    const resultFilter = screen.getByTestId('filter-result')
    expect(resultFilter).toBeInTheDocument()

    // Change to "denied" — triggers re-fetch
    fireEvent.change(resultFilter, { target: { value: 'denied' } })
    expect(mockFetch).toHaveBeenCalledTimes(2) // initial + filter change
  })

  it('has CSV export button', async () => {
    render(<AuditLogModule windowId="test-7" />)

    await waitFor(() => {
      expect(screen.getByText('estop.trigger')).toBeInTheDocument()
    })

    const csvBtn = screen.getByTestId('audit-export-csv')
    expect(csvBtn).toBeInTheDocument()
    expect(csvBtn).not.toBeDisabled()
  })

  it('disables CSV export when no entries', () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [], total: 0 }),
    })

    render(<AuditLogModule windowId="test-8" />)

    // Before fetch resolves, export is disabled
    const csvBtn = screen.getByTestId('audit-export-csv')
    expect(csvBtn).toBeDisabled()
  })

  it('renders filter inputs', async () => {
    render(<AuditLogModule windowId="test-9" />)

    expect(screen.getByPlaceholderText('User ID')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Action')).toBeInTheDocument()
    expect(screen.getByTitle('From date')).toBeInTheDocument()
    expect(screen.getByTitle('To date')).toBeInTheDocument()
  })

  it('displays entry count', async () => {
    render(<AuditLogModule windowId="test-10" />)

    await waitFor(() => {
      expect(screen.getByText('3 entries')).toBeInTheDocument()
    })
  })
})
