/**
 * HealthIndicator Component
 *
 * Minimal observability panel showing WebSocket and video gateway health.
 * Displays connection status, reconnect count, and last error.
 *
 * @see T0.2 — Video/WS Health panel
 */

'use client'

import { useState, useEffect, type ReactNode } from 'react'
import { useWebSocketStore } from '@/lib/stores/websocket-store'

// =============================================================================
// Helpers
// =============================================================================

function formatTimeAgo(timestamp: number | null): string {
  if (!timestamp) return '—'
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

type HealthStatus = 'healthy' | 'degraded' | 'error'

function getHealthStatus(wsConnected: boolean, rosbridgeConnected: boolean): HealthStatus {
  if (wsConnected && rosbridgeConnected) return 'healthy'
  if (wsConnected) return 'degraded'
  return 'error'
}

const STATUS_CONFIG: Record<HealthStatus, { color: string; bg: string; label: string }> = {
  healthy: { color: 'text-green-400', bg: 'bg-green-500', label: 'All Systems OK' },
  degraded: { color: 'text-yellow-400', bg: 'bg-yellow-500', label: 'Degraded' },
  error: { color: 'text-red-400', bg: 'bg-red-500', label: 'Disconnected' },
}

// =============================================================================
// Component
// =============================================================================

export function HealthIndicator(): ReactNode {
  const [mounted, setMounted] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => setMounted(true), [])

  const wsStatus = useWebSocketStore((s) => s.status)
  const wsConnected = useWebSocketStore((s) => s.isConnected())
  const rosbridgeConnected = useWebSocketStore((s) => s.rosbridgeConnected)
  const reconnectCount = useWebSocketStore((s) => s.reconnectCount)
  const lastError = useWebSocketStore((s) => s.error)
  const lastErrorAt = useWebSocketStore((s) => s.lastErrorAt)

  // Update "time ago" every 10s
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!lastErrorAt) return
    const id = setInterval(() => setTick((t) => t + 1), 10_000)
    return () => clearInterval(id)
  }, [lastErrorAt])

  if (!mounted) return null

  const health = getHealthStatus(wsConnected, rosbridgeConnected)
  const cfg = STATUS_CONFIG[health]

  return (
    <div className="fixed bottom-4 right-4 z-50" data-testid="health-indicator">
      {/* Collapsed: small pill */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full glass-dark border border-white/10 hover:border-white/20 transition-all cursor-pointer select-none ${cfg.color}`}
        data-testid="health-toggle"
        aria-label="Toggle health panel"
        aria-expanded={expanded}
      >
        <span
          className={`w-2 h-2 rounded-full ${cfg.bg} ${health === 'degraded' ? 'animate-pulse' : ''}`}
          data-testid="health-dot"
        />
        <span className="text-xs font-medium">{cfg.label}</span>
        {reconnectCount > 0 && (
          <span className="text-[10px] text-white/40 font-mono" data-testid="reconnect-badge">
            ↻{reconnectCount}
          </span>
        )}
      </button>

      {/* Expanded: detail panel */}
      {expanded && (
        <div
          className="absolute bottom-10 right-0 w-72 glass-dark border border-white/10 rounded-lg p-3 space-y-2"
          data-testid="health-panel"
        >
          <h3 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-2">
            Connection Health
          </h3>

          {/* WS Server */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">WS Server</span>
            <span
              className={`text-xs font-medium ${wsConnected ? 'text-green-400' : 'text-red-400'}`}
              data-testid="ws-status"
            >
              {wsConnected
                ? 'Connected'
                : wsStatus === 'reconnecting'
                  ? 'Reconnecting…'
                  : 'Disconnected'}
            </span>
          </div>

          {/* ROSBridge */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">ROSBridge</span>
            <span
              className={`text-xs font-medium ${rosbridgeConnected ? 'text-green-400' : 'text-red-400'}`}
              data-testid="rosbridge-status"
            >
              {rosbridgeConnected ? 'Reachable' : 'Unreachable'}
            </span>
          </div>

          {/* Divider */}
          <div className="border-t border-white/10" />

          {/* Reconnect Count */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Reconnects</span>
            <span className="text-xs font-mono text-white/80" data-testid="reconnect-count">
              {reconnectCount}
            </span>
          </div>

          {/* Last Error */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Last Error</span>
            <span
              className="text-xs text-white/50 truncate max-w-[160px]"
              title={lastError ?? undefined}
              data-testid="last-error"
            >
              {lastError ? `${lastError} (${formatTimeAgo(lastErrorAt)})` : '—'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default HealthIndicator
