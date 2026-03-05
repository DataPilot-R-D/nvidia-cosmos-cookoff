'use client'

import { useState, useCallback, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'

export function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      setError('')
      setLoading(true)

      try {
        const callbackUrl = searchParams.get('callbackUrl') ?? '/'
        const result = await signIn('credentials', {
          email,
          password,
          redirect: false,
          callbackUrl,
        })

        if (!result?.ok) {
          setError('Invalid email or password')
          return
        }

        router.push(result.url ?? callbackUrl)
        router.refresh()
      } finally {
        setLoading(false)
      }
    },
    [email, password, router, searchParams]
  )

  return (
    <div className="flex min-h-screen items-center justify-center bg-tactical-950">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-white/5 p-8 backdrop-blur-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-3 text-4xl">🤖</div>
          <h1 className="text-xl font-semibold text-white">Robot Command Center</h1>
          <p className="mt-1 text-sm text-white/50">Sign in to continue</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-xs font-medium text-white/70">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@robot.cc"
              required
              autoComplete="email"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-xs font-medium text-white/70">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-orange-500 disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 rounded-md border border-white/5 bg-white/[0.02] p-3">
          <p className="mb-2 text-xs font-medium text-white/40">MVP credentials</p>
          <div className="space-y-1 text-xs text-white/30">
            <p>
              <span className="text-orange-400/60">admin</span> — admin@datapilot.com / admin123
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
