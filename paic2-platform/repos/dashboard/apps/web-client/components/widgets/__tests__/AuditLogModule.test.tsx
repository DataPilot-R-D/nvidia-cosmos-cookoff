/**
 * AuditLogModule tests (T2.4)
 */
import { render, screen, waitFor } from '@testing-library/react'
import { AuditLogModule } from '../AuditLogModule'

const mockEntries = [
  {
    id: 1,
    timestamp: '2026-02-11T01:00:00.000Z',
    userId: 'u-admin',
    userRole: 'admin',
    action: 'teleop',
    params: '{"linear":0.5}',
    result: 'ok',
    reason: null,
  },
  {
    id: 2,
    timestamp: '2026-02-11T01:01:00.000Z',
    userId: 'u-viewer',
    userRole: 'viewer',
    action: 'estop',
    params: null,
    result: 'denied',
    reason: 'No permission',
  },
]

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ entries: mockEntries, total: 2 }),
  })
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('AuditLogModule', () => {
  it('renders with testid', () => {
    render(<AuditLogModule windowId="test-1" />)
    expect(screen.getByTestId('module-audit-log-test-1')).toBeDefined()
  })

  it('displays entries after fetch', async () => {
    render(<AuditLogModule windowId="test-1" />)
    await waitFor(() => {
      expect(screen.getByText('teleop')).toBeDefined()
      expect(screen.getByText('estop')).toBeDefined()
    })
  })

  it('shows denied badge', async () => {
    render(<AuditLogModule windowId="test-1" />)
    await waitFor(() => {
      expect(screen.getByText('denied')).toBeDefined()
    })
  })

  it('displays total count', async () => {
    render(<AuditLogModule windowId="test-1" />)
    await waitFor(() => {
      expect(screen.getByText('2 entries')).toBeDefined()
    })
  })
})
