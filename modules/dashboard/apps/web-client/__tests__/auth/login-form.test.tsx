import { render, screen } from '@testing-library/react'
import { LoginPage } from '@/components/auth/LoginPage'

jest.mock('next-auth/react', () => ({
  signIn: jest.fn(),
}))

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(() => null),
  }),
}))

describe('LoginPage', () => {
  it('renders email, password and submit button', () => {
    render(<LoginPage />)

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })
})
