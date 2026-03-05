/**
 * Agent Context Store
 *
 * Zustand store for tracking OpenClaw agent context/token usage.
 * Fetches from /api/agent-context (server-side proxy to Gateway APIs).
 */

import { create } from 'zustand'

// =============================================================================
// Types
// =============================================================================

export interface AgentSession {
  /** Agent name */
  agent: string
  /** Session display name (channel/cron label) */
  displayName: string
  /** Model used */
  model: string
  /** Total tokens used in session */
  totalTokens: number
  /** Context window size */
  contextTokens: number
  /** Usage percentage (0-100) */
  usagePercent: number
  /** Compaction count */
  compactions: number
  /** Last updated timestamp */
  updatedAt: number
}

export interface AgentContextState {
  /** All tracked sessions */
  sessions: AgentSession[]
  /** Loading state */
  loading: boolean
  /** Error message */
  error: string | null
  /** Last fetch timestamp */
  lastFetched: number | null
}

export interface AgentContextActions {
  /** Set sessions data */
  setSessions: (sessions: AgentSession[]) => void
  /** Set loading state */
  setLoading: (loading: boolean) => void
  /** Set error */
  setError: (error: string | null) => void
  /** Fetch from API route */
  fetchAll: () => Promise<void>
}

// =============================================================================
// Store
// =============================================================================

export const useAgentContextStore = create<AgentContextState & AgentContextActions>((set) => ({
  sessions: [],
  loading: false,
  error: null,
  lastFetched: null,

  setSessions: (sessions) =>
    set({ sessions, lastFetched: Date.now(), loading: false, error: null }),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error, loading: false }),

  fetchAll: async () => {
    set({ loading: true, error: null })

    try {
      const res = await fetch('/api/agent-context')
      if (!res.ok) {
        set({ error: `API error: ${res.status}`, loading: false })
        return
      }

      const data = (await res.json()) as {
        sessions: AgentSession[]
        allUnreachable: boolean
        fetchedAt: number
      }

      set({
        sessions: data.sessions,
        loading: false,
        lastFetched: data.fetchedAt,
        error: data.allUnreachable ? 'All agents unreachable' : null,
      })
    } catch {
      set({ error: 'Failed to fetch agent context', loading: false })
    }
  },
}))
