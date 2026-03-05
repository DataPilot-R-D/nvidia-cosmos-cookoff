/**
 * Agent Context API Route (server-side proxy)
 *
 * Fetches session data from local OpenClaw Gateway APIs
 * and returns aggregated results to the client.
 */

import { NextResponse } from 'next/server'

const AGENT_GATEWAYS = [
  { name: 'Pipeline', port: 18789 },
  { name: 'Dev', port: 19001 },
  { name: 'QA', port: 19002 },
  { name: 'HR', port: 19003 },
  { name: 'Infra', port: 19004 },
  { name: 'Assistant', port: 19005 },
  { name: 'Strategist', port: 19006 },
]

interface GatewaySession {
  displayName?: string
  model?: string
  totalTokens?: number
  contextTokens?: number
  compactions?: number
  updatedAt?: number
}

interface AgentSession {
  agent: string
  displayName: string
  model: string
  totalTokens: number
  contextTokens: number
  usagePercent: number
  compactions: number
  updatedAt: number
}

export async function GET() {
  const results: AgentSession[] = []

  await Promise.allSettled(
    AGENT_GATEWAYS.map(async (gw) => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(`http://127.0.0.1:${gw.port}/api/sessions?limit=10`, {
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (!res.ok) return

        const data = (await res.json()) as { sessions?: GatewaySession[] }
        if (!data.sessions || !Array.isArray(data.sessions)) return

        for (const s of data.sessions) {
          const totalTokens = s.totalTokens ?? 0
          const contextTokens = s.contextTokens ?? 200000
          const usagePercent =
            contextTokens > 0 ? Math.min((totalTokens / contextTokens) * 100, 100) : 0

          results.push({
            agent: gw.name,
            displayName: s.displayName ?? 'unknown',
            model: s.model ?? 'unknown',
            totalTokens,
            contextTokens,
            usagePercent,
            compactions: s.compactions ?? 0,
            updatedAt: s.updatedAt ?? 0,
          })
        }
      } catch {
        // Agent offline — skip
      }
    })
  )

  results.sort((a, b) => b.usagePercent - a.usagePercent)

  return NextResponse.json({
    sessions: results,
    allUnreachable: results.length === 0,
    fetchedAt: Date.now(),
  })
}
