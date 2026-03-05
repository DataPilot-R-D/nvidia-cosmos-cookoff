/**
 * ProtectedAction Component Tests
 *
 * @see Issue #26 — T2.2 RBAC gating FE
 */

import { render, screen } from '@testing-library/react'
import { ProtectedAction } from '../ProtectedAction'
import { useAuthStore } from '@/lib/stores/auth-store'

// Mock next-auth
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signIn: jest.fn(),
  signOut: jest.fn(),
}))

describe('ProtectedAction', () => {
  afterEach(() => {
    useAuthStore.setState({})
  })

  it('renders children when user has permission', () => {
    useAuthStore.setState({
      user: { id: '1', email: 'op@test.com', name: 'Op', role: 'operator' },
      isAuthenticated: true,
    })

    render(
      <ProtectedAction permission="teleop">
        <button>Teleop</button>
      </ProtectedAction>
    )

    const btn = screen.getByRole('button', { name: 'Teleop' })
    expect(btn).not.toBeDisabled()
  })

  it('disables children when user lacks permission', () => {
    useAuthStore.setState({
      user: { id: '2', email: 'v@test.com', name: 'Viewer', role: 'viewer' },
      isAuthenticated: true,
    })

    render(
      <ProtectedAction permission="teleop">
        <button>Teleop</button>
      </ProtectedAction>
    )

    const btn = screen.getByRole('button', { name: 'Teleop' })
    expect(btn).toBeDisabled()
  })

  it('hides children entirely when hide=true and unauthorized', () => {
    useAuthStore.setState({
      user: { id: '2', email: 'v@test.com', name: 'Viewer', role: 'viewer' },
      isAuthenticated: true,
    })

    render(
      <ProtectedAction permission="teleop" hide>
        <button>Teleop</button>
      </ProtectedAction>
    )

    expect(screen.queryByRole('button', { name: 'Teleop' })).not.toBeInTheDocument()
  })

  it('shows tooltip with fallback message when unauthorized', () => {
    useAuthStore.setState({
      user: { id: '2', email: 'v@test.com', name: 'Viewer', role: 'viewer' },
      isAuthenticated: true,
    })

    render(
      <ProtectedAction permission="teleop" fallbackMessage="No teleop access">
        <button>Teleop</button>
      </ProtectedAction>
    )

    const wrapper = screen.getByTitle('No teleop access')
    expect(wrapper).toBeInTheDocument()
  })

  it('allows E-STOP for operator (safety override)', () => {
    useAuthStore.setState({
      user: { id: '1', email: 'op@test.com', name: 'Op', role: 'operator' },
      isAuthenticated: true,
    })

    render(
      <ProtectedAction permission="estop">
        <button>E-STOP</button>
      </ProtectedAction>
    )

    const btn = screen.getByRole('button', { name: 'E-STOP' })
    expect(btn).not.toBeDisabled()
  })

  it('blocks E-STOP for viewer', () => {
    useAuthStore.setState({
      user: { id: '2', email: 'v@test.com', name: 'Viewer', role: 'viewer' },
      isAuthenticated: true,
    })

    render(
      <ProtectedAction permission="estop">
        <button>E-STOP</button>
      </ProtectedAction>
    )

    const btn = screen.getByRole('button', { name: 'E-STOP' })
    expect(btn).toBeDisabled()
  })
})
