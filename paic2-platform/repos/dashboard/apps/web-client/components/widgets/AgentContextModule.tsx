/**
 * AgentContextModule Component
 *
 * Displays OpenClaw agent context/token usage with progress bars.
 * Auto-refreshes every 30s. Color-coded: green <50%, yellow 50-80%, red >80%.
 */

'use client'

import { useEffect, useCallback } from 'react'
import { useAgentContextStore, type AgentSession } from '@/lib/stores/agent-context-store'
import type { ModuleProps } from './ModuleRegistry'

// =============================================================================
// Constants
// =============================================================================

const REFRESH_INTERVAL_MS = 30_000

function getUsageColor(percent: number): string {
  if (percent >= 80) return '#ff4444'
  if (percent >= 50) return '#ffaa00'
  return '#00ffff'
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

function timeAgo(ts: number): string {
  if (!ts) return '--'
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

// =============================================================================
// Sub-Components
// =============================================================================

function SessionRow({ session }: { session: AgentSession }) {
  const color = getUsageColor(session.usagePercent)

  return (
    <div className="flex flex-col gap-1 px-2 py-2 rounded bg-[#1a1a1a]/50 hover:bg-[#1a1a1a] border border-transparent hover:border-[#333333] transition-all duration-100">
      {/* Header: agent + session name */}
      <div className="flex items-center justify-between min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide"
            style={{
              color,
              backgroundColor: `${color}15`,
              border: `1px solid ${color}40`,
            }}
          >
            {session.agent}
          </span>
          <span
            className="text-[10px] text-[#cccccc] font-mono truncate"
            title={session.displayName}
          >
            {session.displayName}
          </span>
        </div>
        <span className="text-[10px] font-mono font-bold flex-shrink-0" style={{ color }}>
          {session.usagePercent.toFixed(0)}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-[#111111] rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-300 rounded-full"
          data-testid={`context-bar-${session.agent}-${session.displayName}`}
          style={{
            width: `${Math.min(session.usagePercent, 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>

      {/* Detail row */}
      <div className="flex items-center justify-between text-[9px] text-[#555555] font-mono">
        <span>
          {formatTokens(session.totalTokens)} / {formatTokens(session.contextTokens)}
        </span>
        <div className="flex items-center gap-3">
          {session.compactions > 0 && (
            <span title="Context compactions">🔄 {session.compactions}</span>
          )}
          <span className="text-[#444444]" title={session.model}>
            {session.model.split('/').pop()?.slice(0, 16) ?? session.model}
          </span>
          <span>{timeAgo(session.updatedAt)}</span>
        </div>
      </div>
    </div>
  )
}

function StatsHeader({
  total,
  online,
  loading,
}: {
  total: number
  online: number
  loading: boolean
}) {
  return (
    <div className="flex items-center justify-between text-[10px] font-mono">
      <div className="flex items-center gap-3">
        <span className="text-[#666666] uppercase tracking-wider">Agent Context</span>
        <span className="text-[#00ffff]">{total}</span>
        <span className="text-[#555555]">sessions</span>
      </div>
      <div className="flex items-center gap-3">
        {online > 0 && (
          <span className="text-[#00ff00]">
            {online} <span className="text-[#555555]">agents</span>
          </span>
        )}
        {loading && <span className="text-[#ffff00] animate-pulse">⟳</span>}
      </div>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function AgentContextModule({ windowId }: ModuleProps) {
  const sessions = useAgentContextStore((s) => s.sessions)
  const loading = useAgentContextStore((s) => s.loading)
  const error = useAgentContextStore((s) => s.error)
  const lastFetched = useAgentContextStore((s) => s.lastFetched)
  const fetchAll = useAgentContextStore((s) => s.fetchAll)

  // Initial fetch + auto-refresh
  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchAll])

  // Manual refresh
  const handleRefresh = useCallback(() => {
    fetchAll()
  }, [fetchAll])

  // Count unique online agents
  const onlineAgents = new Set(sessions.map((s) => s.agent)).size

  // Empty state
  if (!loading && sessions.length === 0 && lastFetched) {
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center bg-[#0a0a0a] p-3"
        data-testid={`module-agent-context-${windowId}`}
      >
        <div className="w-8 h-8 rounded-full border border-[#333333] flex items-center justify-center mb-2">
          <span className="text-[#444444] text-xs">🤖</span>
        </div>
        <span className="text-[10px] text-[#555555] uppercase tracking-wider block">
          No agent sessions found
        </span>
        <button
          onClick={handleRefresh}
          className="mt-2 px-3 py-1 rounded text-[9px] font-mono uppercase bg-[#1a1a1a] text-[#888888] hover:text-[#cccccc] border border-[#333333] hover:border-[#555555] transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div
      className="h-full w-full flex flex-col bg-[#0a0a0a] p-3 gap-3"
      data-testid={`module-agent-context-${windowId}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#222222]">
        <StatsHeader total={sessions.length} online={onlineAgents} loading={loading} />
        <button
          onClick={handleRefresh}
          disabled={loading}
          className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider transition-colors duration-100 ${
            loading
              ? 'bg-[#333333] text-[#555555] cursor-not-allowed'
              : 'bg-[#00ffff]/20 text-[#00ffff] hover:bg-[#00ffff]/30'
          }`}
        >
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-2 py-1 rounded bg-[#ff0000]/10 border border-[#ff0000]/30 text-[10px] text-[#ff0000]">
          {error}
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
        {sessions.map((session, idx) => (
          <SessionRow key={`${session.agent}-${session.displayName}-${idx}`} session={session} />
        ))}
      </div>

      {/* Footer */}
      {lastFetched && (
        <div className="text-[8px] text-[#444444] font-mono text-right">
          Updated: {new Date(lastFetched).toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}

export default AgentContextModule
