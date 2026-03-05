import bcrypt from 'bcryptjs'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { eq } from 'drizzle-orm'

export type SessionRole = 'admin' | 'operator' | 'viewer'

function toSessionRole(role: string): SessionRole {
  const normalized = role.toLowerCase()

  if (normalized === 'admin') return 'admin'
  if (normalized === 'operator') return 'operator'
  return 'viewer'
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null
        }

        const [{ db }, { users }] = await Promise.all([
          import('@/lib/db'),
          import('@/lib/db/schema'),
        ])

        const user = db
          .select()
          .from(users)
          .where(eq(users.email, credentials.email.toLowerCase().trim()))
          .limit(1)
          .all()[0]

        if (!user) {
          return null
        }

        const passwordMatches = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!passwordMatches) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          role: toSessionRole(user.role),
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? ''
        session.user.role = (token.role as SessionRole | undefined) ?? 'viewer'
      }

      return session
    },
  },
}
