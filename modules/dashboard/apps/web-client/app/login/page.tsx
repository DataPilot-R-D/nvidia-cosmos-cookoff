import { Suspense } from 'react'
import { LoginPage } from '@/components/auth/LoginPage'

export const dynamic = 'force-dynamic'

export default function Login() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  )
}
