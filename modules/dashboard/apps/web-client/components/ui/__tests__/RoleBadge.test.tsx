/**
 * RoleBadge Component Tests
 *
 * @see Issue #26 — T2.2 RBAC gating FE
 */

import { render, screen } from '@testing-library/react'
import { RoleBadge } from '../RoleBadge'
import { useAuthStore } from '@/lib/stores/auth-store'

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signIn: jest.fn(),
  signOut: jest.fn(),
}))

describe('RoleBadge', () => {
  afterEach(() => {
    useAuthStore.setState({})
  })

  it('renders nothing when no user', () => {
    useAuthStore.setState({ user: null })
    const { container } = render(<RoleBadge />)
    expect(container.firstChild).toBeNull()
  })

  it('renders ADMIN badge for admin role', () => {
    useAuthStore.setState({
      user: { id: '1', email: 'a@test.com', name: 'Admin', role: 'admin' },
    })
    render(<RoleBadge />)
    expect(screen.getByTestId('role-badge')).toHaveTextContent('ADMIN')
  })

  it('renders OPERATOR badge for operator role', () => {
    useAuthStore.setState({
      user: { id: '2', email: 'op@test.com', name: 'Op', role: 'operator' },
    })
    render(<RoleBadge />)
    expect(screen.getByTestId('role-badge')).toHaveTextContent('OPERATOR')
  })

  it('renders VIEWER badge for viewer role', () => {
    useAuthStore.setState({
      user: { id: '3', email: 'v@test.com', name: 'Viewer', role: 'viewer' },
    })
    render(<RoleBadge />)
    expect(screen.getByTestId('role-badge')).toHaveTextContent('VIEWER')
  })
})
