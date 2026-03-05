/**
 * HealthIndicator Component
 *
 * Minimal observability panel showing WebSocket, video gateway,
 * camera streams, and WebRTC connection health.
 * Displays connection status, reconnect count, and last error.
 * Auto-refreshes every 5 seconds.
 *
 * @see T0.2 — Video/WS Health panel
 * @see Issue #12
 */

'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import { useCameraSourceStore } from '@/lib/stores/camera-source-store'
import {
  useWebRTCConnectionStore,
  MAX_WEBRTC_CONNECTIONS,
} from '@/lib/stores/webrtc-connection-store'

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

function getHealthStatus(
  wsConnected: boolean,
  rosbridgeConnected: boolean,
  go2rtcOnline: boolean
): HealthStatus {
  if (wsConnected && rosbridgeConnected && go2rtcOnline) return 'healthy'
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
  const [go2rtcOnline, setGo2rtcOnline] = useState(false)

  useEffect(() => setMounted(true), [])

  const wsStatus = useWebSocketStore((s) => s.status)
  const wsConnected = useWebSocketStore((s) => s.isConnected())
  const rosbridgeConnected = useWebSocketStore((s) => s.rosbridgeConnected)
  const reconnectCount = useWebSocketStore((s) => s.reconnectCount)
  const lastError = useWebSocketStore((s) => s.error)
  const lastErrorAt = useWebSocketStore((s) => s.lastErrorAt)

  // Camera source metrics
  const sourcesMap = useCameraSourceStore((s) => s.sources)
  const totalCameras = sourcesMap.size
  let onlineCameras = 0
  let offlineCameras = 0
  for (const src of sourcesMap.values()) {
    if (src.status === 'online') onlineCameras++
    else if (src.status === 'offline') offlineCameras++
  }

  // WebRTC connection metrics
  const webrtcConnections = useWebRTCConnectionStore((s) => s.connections)
  const activeWebRTC = webrtcConnections.size

  // go2rtc health check — poll every 5s
  const checkGo2rtcHealth = useCallback(async () => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_GO2RTC_URL ?? ''
      const url = baseUrl ? `${baseUrl}/api` : '/api'
      const res = await fetch(url, { method: 'GET' })
      setGo2rtcOnline(res.ok)
    } catch {
      setGo2rtcOnline(false)
    }
  }, [])

  // Auto-refresh every 5s
  const [, setTick] = useState(0)
  useEffect(() => {
    void checkGo2rtcHealth()
    const id = setInterval(() => {
      setTick((t) => t + 1)
      void checkGo2rtcHealth()
    }, 5_000)
    return () => clearInterval(id)
  }, [checkGo2rtcHealth])

  if (!mounted) return null

  const health = getHealthStatus(wsConnected, rosbridgeConnected, go2rtcOnline)
  const hasOffline = offlineCameras > 0 || !go2rtcOnline || !wsConnected
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
        <span className="relative">
          <span
            className={`w-2 h-2 rounded-full block ${cfg.bg} ${health !== 'healthy' ? 'animate-pulse' : ''}`}
            data-testid="health-dot"
          />
          {hasOffline && (
            <span
              className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-red-500"
              data-testid="health-alert-dot"
            />
          )}
        </span>
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

          {/* go2rtc */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">go2rtc</span>
            <span
              className={`text-xs font-medium ${go2rtcOnline ? 'text-green-400' : 'text-red-400'}`}
              data-testid="go2rtc-status"
            >
              {go2rtcOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {/* Divider */}
          <div className="border-t border-white/10" />

          {/* Camera Streams */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Cameras</span>
            <span className="text-xs font-mono text-white/80" data-testid="camera-health">
              <span className="text-green-400">{onlineCameras}</span>
              <span className="text-white/40">/{totalCameras}</span>
              {offlineCameras > 0 && (
                <span className="text-red-400 ml-1">({offlineCameras} offline)</span>
              )}
            </span>
          </div>

          {/* WebRTC Connections */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">WebRTC</span>
            <span
              className={`text-xs font-mono ${
                activeWebRTC >= MAX_WEBRTC_CONNECTIONS
                  ? 'text-red-400'
                  : activeWebRTC >= MAX_WEBRTC_CONNECTIONS - 1
                    ? 'text-yellow-400'
                    : 'text-white/80'
              }`}
              data-testid="webrtc-health"
            >
              {activeWebRTC}/{MAX_WEBRTC_CONNECTIONS}
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
