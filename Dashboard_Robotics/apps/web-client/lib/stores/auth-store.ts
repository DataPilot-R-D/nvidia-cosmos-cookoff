'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { signIn, signOut, useSession } from 'next-auth/react'

export type UserRole = 'admin' | 'operator' | 'viewer'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
}

export interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  hasHydrated: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  setHasHydrated: (v: boolean) => void
}

type Selector<T> = (state: AuthState) => T

type TestState = Partial<Pick<AuthState, 'user' | 'token' | 'isAuthenticated' | 'hasHydrated'>>

let testState: TestState = {}
const listeners = new Set<() => void>()

function emitTestStateChange() {
  listeners.forEach((listener) => listener())
}

function toRole(role: string | undefined): UserRole {
  const normalized = role?.toLowerCase()

  if (normalized === 'admin') return 'admin'
  if (normalized === 'operator') return 'operator'
  return 'viewer'
}

async function login(email: string, password: string): Promise<boolean> {
  const result = await signIn('credentials', {
    email,
    password,
    redirect: false,
  })

  if (result?.ok) {
    testState = { ...testState, isAuthenticated: true, hasHydrated: true }
    emitTestStateChange()
  }

  return !!result?.ok
}

function logout() {
  void signOut({ redirect: false })
  testState = { ...testState, user: null, token: null, isAuthenticated: false, hasHydrated: true }
  emitTestStateChange()
}

function setHasHydrated(value: boolean) {
  testState = { ...testState, hasHydrated: value }
  emitTestStateChange()
}

function buildState(
  session: ReturnType<typeof useSession>['data'],
  status: ReturnType<typeof useSession>['status']
): AuthState {
  const sessionUser = session?.user
  const userFromSession: AuthUser | null = sessionUser?.email
    ? {
        id: sessionUser.id ?? '',
        email: sessionUser.email,
        name: sessionUser.name ?? sessionUser.email,
        role: toRole(sessionUser.role),
      }
    : null

  const derivedState: AuthState = {
    user: userFromSession,
    token: null,
    isAuthenticated: status === 'authenticated',
    hasHydrated: status !== 'loading',
    login,
    logout,
    setHasHydrated,
  }

  return {
    ...derivedState,
    ...testState,
    login,
    logout,
    setHasHydrated,
  }
}

interface AuthStoreHook {
  <T>(selector: Selector<T>): T
  getState: () => AuthState
  setState: (partial: TestState) => void
}

export const useAuthStore = ((selector: Selector<any>) => {
  const { data: session, status } = useSession()
  const localTestState = useSyncExternalStore(
    (callback) => {
      listeners.add(callback)
      return () => listeners.delete(callback)
    },
    () => testState
  )

  const authState = useMemo(() => {
    const state = buildState(session, status)
    return {
      ...state,
      ...localTestState,
      login,
      logout,
      setHasHydrated,
    }
  }, [session, status, localTestState])

  return selector(authState)
}) as AuthStoreHook

useAuthStore.getState = () => ({
  user: testState.user ?? null,
  token: testState.token ?? null,
  isAuthenticated: testState.isAuthenticated ?? false,
  hasHydrated: testState.hasHydrated ?? true,
  login,
  logout,
  setHasHydrated,
})

useAuthStore.setState = (partial: TestState) => {
  testState = { ...testState, ...partial }
  emitTestStateChange()
}
