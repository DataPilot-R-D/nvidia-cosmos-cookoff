require('@testing-library/jest-dom')

const sessionState = { data: null, status: 'unauthenticated' }
const signInMock = jest.fn(async () => ({ ok: true, url: '/' }))
const signOutMock = jest.fn(async () => undefined)

jest.mock('next-auth/react', () => ({
  __esModule: true,
  SessionProvider: ({ children }) => children,
  useSession: jest.fn(() => sessionState),
  signIn: signInMock,
  signOut: signOutMock,
  __mockSessionState: sessionState,
  __mockSignIn: signInMock,
  __mockSignOut: signOutMock,
}))

// Polyfills for jsdom environment
global.URL.createObjectURL = jest.fn(() => 'blob:mock-url')
global.URL.revokeObjectURL = jest.fn()

// ResizeObserver polyfill for jsdom
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
