import { signIn, signOut } from 'next-auth/react'
import { useAuthStore } from '../auth-store'

const mockedSignIn = signIn as jest.Mock
const mockedSignOut = signOut as jest.Mock

beforeEach(() => {
  mockedSignIn.mockReset()
  mockedSignOut.mockReset()
  mockedSignIn.mockResolvedValue({ ok: true, url: '/' })
  mockedSignOut.mockResolvedValue(undefined)

  useAuthStore.setState({
    user: null,
    token: null,
    isAuthenticated: false,
    hasHydrated: true,
  })
})

describe('auth-store', () => {
  it('delegates login to next-auth credentials sign in', async () => {
    const ok = await useAuthStore.getState().login('admin@datapilot.com', 'admin123')

    expect(ok).toBe(true)
    expect(mockedSignIn).toHaveBeenCalledWith('credentials', {
      email: 'admin@datapilot.com',
      password: 'admin123',
      redirect: false,
    })
  })

  it('returns false when sign in fails', async () => {
    mockedSignIn.mockResolvedValue({ ok: false })

    const ok = await useAuthStore.getState().login('admin@datapilot.com', 'wrong')

    expect(ok).toBe(false)
  })

  it('delegates logout to next-auth signOut', () => {
    useAuthStore.getState().logout()

    expect(mockedSignOut).toHaveBeenCalledWith({ redirect: false })
  })

  it('allows tests to inject auth state', () => {
    useAuthStore.setState({
      user: {
        id: 'u-admin',
        email: 'admin@datapilot.com',
        name: 'Admin',
        role: 'admin',
      },
      isAuthenticated: true,
      hasHydrated: true,
    })

    const state = useAuthStore.getState()
    expect(state.user?.role).toBe('admin')
    expect(state.isAuthenticated).toBe(true)
  })
})
