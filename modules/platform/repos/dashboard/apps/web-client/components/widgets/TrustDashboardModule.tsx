/**
 * TrustDashboardModule — "Why intervene" widget with confidence gauge,
 * risk factors sorted by severity, and handover confirmation dialog.
 */
'use client'

import React, { useEffect, useMemo, useCallback, useState } from 'react'
import {
  useTrustStore,
  type TrustScore,
  type RiskLevel,
  type HandoverStatus,
} from '@/lib/stores/trust-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'

// =============================================================================
// Helpers
// =============================================================================

const RISK_CONFIG: Record<
  RiskLevel,
  { label: string; color: string; bg: string; icon: string; severity: number }
> = {
  low: { label: 'Low', color: 'text-green-400', bg: 'bg-green-400/20', icon: 'ℹ️', severity: 0 },
  medium: {
    label: 'Medium',
    color: 'text-yellow-400',
    bg: 'bg-yellow-400/20',
    icon: '⚠️',
    severity: 1,
  },
  high: {
    label: 'High',
    color: 'text-orange-400',
    bg: 'bg-orange-400/20',
    icon: '⚠️',
    severity: 2,
  },
  critical: {
    label: 'Critical',
    color: 'text-red-400',
    bg: 'bg-red-400/20',
    icon: '🚨',
    severity: 3,
  },
}

const HANDOVER_CONFIG: Record<HandoverStatus, { label: string; color: string }> = {
  autonomous: { label: 'Autonomous', color: 'text-green-400' },
  supervised: { label: 'Supervised', color: 'text-yellow-400' },
  manual: { label: 'Manual', color: 'text-orange-400' },
  emergency_stop: { label: 'E-STOP', color: 'text-red-400' },
}

// =============================================================================
// Confidence Gauge — SVG arc
// =============================================================================

interface ConfidenceGaugeProps {
  score: number // 0-100
  size?: number
}

function ConfidenceGauge({ score, size = 100 }: ConfidenceGaugeProps) {
  const radius = (size - 12) / 2
  const circumference = Math.PI * radius // half circle
  const progress = (Math.max(0, Math.min(100, score)) / 100) * circumference
  const cx = size / 2
  const cy = size / 2 + 4

  // Color stops: green → yellow → red
  const getColor = (s: number) => {
    if (s >= 70) return '#4ade80' // green
    if (s >= 40) return '#facc15' // yellow
    return '#f87171' // red
  }

  return (
    <div className="relative" style={{ width: size, height: size * 0.65 }}>
      <svg width={size} height={size * 0.65} viewBox={`0 0 ${size} ${size * 0.65}`}>
        {/* Background arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={8}
          strokeLinecap="round"
        />
        {/* Progress arc */}
        <path
          d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
          fill="none"
          stroke={getColor(score)}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ transition: 'stroke-dasharray 0.8s ease, stroke 0.5s ease' }}
        />
        {/* Score text */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          className="fill-white text-lg font-bold"
          style={{ fontSize: size * 0.22 }}
        >
          {score}%
        </text>
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          className="fill-white/40"
          style={{ fontSize: size * 0.09 }}
        >
          confidence
        </text>
      </svg>
    </div>
  )
}

// =============================================================================
// Risk Factor Item
// =============================================================================

interface RiskFactorProps {
  text: string
  level: RiskLevel
}

function RiskFactor({ text, level }: RiskFactorProps) {
  const cfg = RISK_CONFIG[level]
  return (
    <div className={`flex items-start gap-1.5 text-xs px-2 py-1 rounded ${cfg.bg}`}>
      <span className="flex-shrink-0">{cfg.icon}</span>
      <span className={cfg.color}>{text}</span>
    </div>
  )
}

// =============================================================================
// Handover Confirmation Dialog
// =============================================================================

interface ConfirmDialogProps {
  targetStatus: HandoverStatus
  robotId: string
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({ targetStatus, robotId, onConfirm, onCancel }: ConfirmDialogProps) {
  const cfg = HANDOVER_CONFIG[targetStatus]
  const isEmergency = targetStatus === 'emergency_stop'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className={`rounded-lg border p-4 max-w-xs w-full mx-4 ${
          isEmergency ? 'border-red-500/50 bg-[#1a0a0a]' : 'border-white/20 bg-[#111]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-3">
          <div className="text-lg mb-1">{isEmergency ? '🛑' : '⚠️'}</div>
          <div className="text-sm font-medium text-white">
            {isEmergency ? 'Emergency Stop' : `Switch to ${cfg.label}?`}
          </div>
          <div className="text-xs text-white/50 mt-1">
            {isEmergency
              ? 'Robot will stop immediately. Are you sure?'
              : `Robot ${robotId.slice(0, 12)} will switch to ${cfg.label.toLowerCase()} mode.`}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 text-xs px-3 py-1.5 rounded bg-white/10 text-white/60 hover:bg-white/20 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 text-xs px-3 py-1.5 rounded font-medium transition-colors ${
              isEmergency
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
            }`}
          >
            {isEmergency ? 'STOP NOW' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Handover History Mini-Timeline
// =============================================================================

interface HandoverEvent {
  id: string
  status: HandoverStatus
  reason: string
  timestamp: string
}

function HandoverHistory({
  robotId,
  currentStatus,
}: {
  robotId: string
  currentStatus: HandoverStatus
}) {
  const socket = useWebSocketStore((s) => s.socket)
  const [events, setEvents] = useState<HandoverEvent[]>([])

  useEffect(() => {
    const ws = socket
    if (!ws) return

    // Fetch history
    ws.emit(
      'trust:handover_history',
      { robotId, limit: 5 },
      (res: { events?: HandoverEvent[] }) => {
        if (res?.events) setEvents(res.events)
      }
    )

    // Listen for new handover events
    const handleEvent = (evt: HandoverEvent & { robotId?: string }) => {
      if (evt.robotId && evt.robotId !== robotId) return
      setEvents((prev) => [evt, ...prev].slice(0, 5))
    }
    ws.on('trust:handover_event', handleEvent)

    return () => {
      ws.off('trust:handover_event', handleEvent)
    }
  }, [socket, robotId])

  const formatTimeAgo = (iso: string): string => {
    try {
      const diff = Date.now() - new Date(iso).getTime()
      const mins = Math.floor(diff / 60000)
      if (mins < 1) return 'just now'
      if (mins < 60) return `${mins}m ago`
      const hrs = Math.floor(mins / 60)
      if (hrs < 24) return `${hrs}h ago`
      return `${Math.floor(hrs / 24)}d ago`
    } catch {
      return iso
    }
  }

  // If no history from server, show current status as only event
  const displayEvents =
    events.length > 0
      ? events
      : [
          {
            id: 'current',
            status: currentStatus,
            reason: 'Current state',
            timestamp: new Date().toISOString(),
          },
        ]

  return (
    <div>
      <div className="text-[10px] font-medium text-white/60 uppercase tracking-wide mb-1">
        Handover History
      </div>
      <div className="relative pl-3">
        {/* Vertical line */}
        <div className="absolute left-[5px] top-1 bottom-1 w-px bg-white/10" />

        {displayEvents.map((evt) => {
          const cfg = HANDOVER_CONFIG[evt.status]
          return (
            <div key={evt.id} className="relative flex items-start gap-2 mb-1.5 last:mb-0">
              {/* Dot */}
              <div
                className="absolute left-[-8px] top-[3px] w-2 h-2 rounded-full border border-white/20"
                style={{
                  backgroundColor:
                    evt.status === 'emergency_stop'
                      ? '#f87171'
                      : evt.status === 'manual'
                        ? '#fb923c'
                        : evt.status === 'supervised'
                          ? '#facc15'
                          : '#4ade80',
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-[9px] text-white/30">{formatTimeAgo(evt.timestamp)}</span>
                </div>
                {evt.reason && evt.reason !== 'Current state' && (
                  <div className="text-[9px] text-white/30 truncate">{evt.reason}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// =============================================================================
// Robot Trust Card
// =============================================================================

interface RobotTrustCardProps {
  score: TrustScore
  isSelected: boolean
  onSelect: (robotId: string) => void
}

function RobotTrustCard({ score, isSelected, onSelect }: RobotTrustCardProps) {
  const risk = RISK_CONFIG[score.riskLevel]
  const handover = HANDOVER_CONFIG[score.handoverStatus]

  return (
    <button
      onClick={() => onSelect(score.robotId)}
      className={`w-full text-left rounded border p-2 mb-1.5 transition-colors ${
        isSelected
          ? 'border-cyan-400/50 bg-cyan-400/10'
          : 'border-white/10 bg-white/5 hover:bg-white/10'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs">{risk.icon}</span>
          <span className="text-xs font-medium text-white">🤖 {score.robotId.slice(0, 12)}</span>
        </div>
        <span className={`text-[10px] ${handover.color}`}>{handover.label}</span>
      </div>

      {/* Mini gauge inline */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${score.confidenceScore}%`,
              backgroundColor:
                score.confidenceScore >= 70
                  ? '#4ade80'
                  : score.confidenceScore >= 40
                    ? '#facc15'
                    : '#f87171',
            }}
          />
        </div>
        <span className="text-[10px] text-white/50 w-8 text-right">{score.confidenceScore}%</span>
      </div>
    </button>
  )
}

// =============================================================================
// Detail Panel
// =============================================================================

interface DetailPanelProps {
  score: TrustScore
  onHandover: (robotId: string, status: HandoverStatus) => void
}

function DetailPanel({ score, onHandover }: DetailPanelProps) {
  const risk = RISK_CONFIG[score.riskLevel]
  const handover = HANDOVER_CONFIG[score.handoverStatus]
  const recommendations: string[] = JSON.parse(score.recommendations || '[]')
  const reasons: string[] = JSON.parse(score.reasons || '[]')
  const sensorHealth: Record<string, number> | null = score.sensorHealth
    ? JSON.parse(score.sensorHealth)
    : null

  // Parse risk factors from reasons with severity estimation
  const riskFactors = useMemo(() => {
    return reasons
      .map((r) => {
        // Simple severity heuristic based on keywords
        let level: RiskLevel = 'low'
        const lower = r.toLowerCase()
        if (lower.includes('critical') || lower.includes('emergency') || lower.includes('fail'))
          level = 'critical'
        else if (lower.includes('high') || lower.includes('warning') || lower.includes('exceed'))
          level = 'high'
        else if (lower.includes('medium') || lower.includes('degrad') || lower.includes('slow'))
          level = 'medium'
        return { text: r, level }
      })
      .sort((a, b) => RISK_CONFIG[b.level].severity - RISK_CONFIG[a.level].severity)
  }, [reasons])

  // Confirmation dialog state
  const [confirmHandover, setConfirmHandover] = useState<HandoverStatus | null>(null)

  const handleHandoverClick = useCallback((status: HandoverStatus) => {
    setConfirmHandover(status)
  }, [])

  const handleConfirm = useCallback(() => {
    if (confirmHandover) {
      onHandover(score.robotId, confirmHandover)
      setConfirmHandover(null)
    }
  }, [confirmHandover, onHandover, score.robotId])

  return (
    <div className="rounded border border-white/10 bg-white/5 p-3 space-y-3">
      {/* Header with gauge */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-medium text-white">🤖 {score.robotId}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${risk.bg} ${risk.color}`}>
              {risk.icon} {risk.label} Risk
            </span>
            <span className={`text-[10px] ${handover.color}`}>{handover.label}</span>
          </div>
        </div>
        <ConfidenceGauge score={score.confidenceScore} size={80} />
      </div>

      {/* Why Intervene — risk factors + recommendations */}
      {(riskFactors.length > 0 || recommendations.length > 0) && (
        <div>
          <div className="text-[10px] font-medium text-white/60 uppercase tracking-wide mb-1">
            Why Intervene
          </div>
          {riskFactors.length > 0 && (
            <div className="space-y-1 mb-2">
              {riskFactors.map((rf, i) => (
                <RiskFactor key={i} text={rf.text} level={rf.level} />
              ))}
            </div>
          )}
          <div className="space-y-1">
            {recommendations.map((rec, i) => (
              <div
                key={i}
                className="text-xs text-white/80 bg-white/5 rounded px-2 py-1 border-l-2 border-cyan-400/50"
              >
                {rec}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sensor Health */}
      {sensorHealth && (
        <div>
          <div className="text-[10px] font-medium text-white/60 uppercase tracking-wide mb-1">
            Sensor Health
          </div>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(sensorHealth).map(([name, health]) => (
              <div key={name} className="flex items-center gap-1.5">
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${health}%`,
                      backgroundColor:
                        health >= 70 ? '#4ade80' : health >= 40 ? '#facc15' : '#f87171',
                    }}
                  />
                </div>
                <span className="text-[10px] text-white/40 w-16 truncate">{name}</span>
                <span className="text-[10px] text-white/50 w-6 text-right">{health}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Handover History — last 5 events */}
      <HandoverHistory robotId={score.robotId} currentStatus={score.handoverStatus} />

      {/* Handover Controls with confirmation */}
      <div>
        <div className="text-[10px] font-medium text-white/60 uppercase tracking-wide mb-1">
          Handover Controls
        </div>
        <div className="flex gap-1">
          {(['autonomous', 'supervised', 'manual', 'emergency_stop'] as HandoverStatus[]).map(
            (status) => {
              const cfg = HANDOVER_CONFIG[status]
              const isActive = score.handoverStatus === status
              return (
                <button
                  key={status}
                  onClick={() => handleHandoverClick(status)}
                  disabled={isActive}
                  className={`text-[10px] px-2 py-1 rounded transition-colors ${
                    isActive
                      ? `bg-white/20 ${cfg.color} font-medium`
                      : 'bg-white/5 text-white/40 hover:bg-white/10'
                  } ${status === 'emergency_stop' ? 'border border-red-400/30' : ''}`}
                >
                  {cfg.label}
                </button>
              )
            }
          )}
        </div>
      </div>

      {/* Confirmation dialog */}
      {confirmHandover && (
        <ConfirmDialog
          targetStatus={confirmHandover}
          robotId={score.robotId}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmHandover(null)}
        />
      )}
    </div>
  )
}

// =============================================================================
// Main component
// =============================================================================

export function TrustDashboardModule() {
  const scoresMap = useTrustStore((s) => s.scores)
  const selectedRobotId = useTrustStore((s) => s.selectedRobotId)
  const setSelectedRobot = useTrustStore((s) => s.setSelectedRobot)
  const setScores = useTrustStore((s) => s.setScores)
  const upsertScore = useTrustStore((s) => s.upsertScore)
  const socket = useWebSocketStore((s) => s.socket)

  const sortedScores = useMemo(() => {
    return Array.from(scoresMap.values()).sort(
      (a, b) => RISK_CONFIG[b.riskLevel].severity - RISK_CONFIG[a.riskLevel].severity
    )
  }, [scoresMap])

  const selectedScore = useMemo(
    () => (selectedRobotId ? (scoresMap.get(selectedRobotId) ?? null) : null),
    [selectedRobotId, scoresMap]
  )

  useEffect(() => {
    const ws = socket
    if (!ws) return

    ws.emit('trust:list', {}, (res: { entries?: TrustScore[] }) => {
      if (res?.entries) setScores(res.entries)
    })

    const handleUpdate = (score: TrustScore) => upsertScore(score)
    ws.on('trust:updated', handleUpdate)

    return () => {
      ws.off('trust:updated', handleUpdate)
    }
  }, [socket, setScores, upsertScore])

  const handleSelect = useCallback(
    (robotId: string) => {
      setSelectedRobot(selectedRobotId === robotId ? null : robotId)
    },
    [selectedRobotId, setSelectedRobot]
  )

  const handleHandover = useCallback(
    (robotId: string, status: HandoverStatus) => {
      const ws = socket
      if (!ws) return
      ws.emit('trust:handover', { robotId, status, reason: 'Operator requested via dashboard' })
    },
    [socket]
  )

  return (
    <div className="flex h-full flex-col p-3 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-white/70">
          {sortedScores.length} robot{sortedScores.length !== 1 ? 's' : ''}
        </span>
        {sortedScores.some((s) => s.riskLevel === 'critical' || s.riskLevel === 'high') && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-400/20 text-red-400 animate-pulse">
            ⚠️ Attention needed
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 gap-2 min-h-0">
        {/* Robot list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {sortedScores.length === 0 ? (
            <div className="flex items-center justify-center h-full text-white/30 text-xs">
              No robot trust data
            </div>
          ) : (
            sortedScores.map((s) => (
              <RobotTrustCard
                key={s.robotId}
                score={s}
                isSelected={s.robotId === selectedRobotId}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>

        {/* Detail */}
        {selectedScore && (
          <div className="w-[55%] overflow-y-auto min-h-0">
            <DetailPanel score={selectedScore} onHandover={handleHandover} />
          </div>
        )}
      </div>
    </div>
  )
}
