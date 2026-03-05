'use client'

import { type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { LoginPage } from './LoginPage'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { status } = useSession()

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-tactical-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <LoginPage />
  }

  return <>{children}</>
}
