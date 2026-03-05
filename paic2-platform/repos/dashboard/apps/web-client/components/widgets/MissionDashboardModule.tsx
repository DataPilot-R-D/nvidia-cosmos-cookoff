/**
 * MissionDashboardModule — real-time widget showing active missions,
 * progress bars, robot assignments, and completion stats.
 */
'use client'

import React, { useEffect, useMemo } from 'react'
import { useMissionStore, type Mission, type MissionStatus } from '@/lib/stores/mission-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'

// =============================================================================
// Helpers
// =============================================================================

const STATUS_CONFIG: Record<
  MissionStatus,
  { label: string; color: string; bg: string; icon: string }
> = {
  pending: { label: 'Pending', color: 'text-yellow-400', bg: 'bg-yellow-400/20', icon: '⏳' },
  dispatched: {
    label: 'Dispatched',
    color: 'text-blue-400',
    bg: 'bg-blue-400/20',
    icon: '📡',
  },
  in_progress: {
    label: 'In Progress',
    color: 'text-cyan-400',
    bg: 'bg-cyan-400/20',
    icon: '🔄',
  },
  completed: {
    label: 'Completed',
    color: 'text-green-400',
    bg: 'bg-green-400/20',
    icon: '✅',
  },
  failed: { label: 'Failed', color: 'text-red-400', bg: 'bg-red-400/20', icon: '❌' },
  cancelled: {
    label: 'Cancelled',
    color: 'text-gray-400',
    bg: 'bg-gray-400/20',
    icon: '🚫',
  },
}

function getProgress(mission: Mission): number {
  if (mission.status === 'completed') return 100
  if (mission.status === 'failed' || mission.status === 'cancelled') return 0
  if (mission.waypoints.length === 0) return 0
  // Simulated progress based on status
  if (mission.status === 'in_progress') return 50
  if (mission.status === 'dispatched') return 10
  return 0
}

// =============================================================================
// Sub-components
// =============================================================================

interface StatsBarProps {
  missions: Mission[]
}

function StatsBar({ missions }: StatsBarProps) {
  const stats = useMemo(() => {
    const counts: Record<string, number> = {
      total: missions.length,
      active: 0,
      completed: 0,
      failed: 0,
    }
    for (const m of missions) {
      if (m.status === 'in_progress' || m.status === 'dispatched') counts.active++
      else if (m.status === 'completed') counts.completed++
      else if (m.status === 'failed') counts.failed++
    }
    return counts
  }, [missions])

  return (
    <div className="grid grid-cols-4 gap-2 mb-3">
      <StatCard label="Total" value={stats.total} color="text-white" />
      <StatCard label="Active" value={stats.active} color="text-cyan-400" />
      <StatCard label="Done" value={stats.completed} color="text-green-400" />
      <StatCard label="Failed" value={stats.failed} color="text-red-400" />
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number
  color: string
}

function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div className="rounded bg-white/5 px-2 py-1 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-white/50 uppercase tracking-wide">{label}</div>
    </div>
  )
}

interface MissionRowProps {
  mission: Mission
}

function MissionRow({ mission }: MissionRowProps) {
  const cfg = STATUS_CONFIG[mission.status]
  const progress = getProgress(mission)

  return (
    <div className="rounded border border-white/10 bg-white/5 p-2 mb-2">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{cfg.icon}</span>
          <span className="text-xs font-medium text-white truncate max-w-[140px]">
            {mission.name}
          </span>
        </div>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-1">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            mission.status === 'completed'
              ? 'bg-green-400'
              : mission.status === 'failed'
                ? 'bg-red-400'
                : 'bg-cyan-400'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] text-white/40">
        <span>
          {mission.waypoints.length > 0
            ? `${mission.waypoints.length} waypoint${mission.waypoints.length !== 1 ? 's' : ''}`
            : 'No waypoints'}
        </span>
        <span>{mission.robotId ? `🤖 ${mission.robotId.slice(0, 8)}` : 'Unassigned'}</span>
      </div>
    </div>
  )
}

// =============================================================================
// Filter tabs
// =============================================================================

const FILTER_OPTIONS: Array<{ key: MissionStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'Active' },
  { key: 'completed', label: 'Done' },
  { key: 'failed', label: 'Failed' },
]

// =============================================================================
// Main component
// =============================================================================

export function MissionDashboardModule() {
  const missionsMap = useMissionStore((s) => s.missions)
  const statusFilter = useMissionStore((s) => s.filters.status)
  const setFilter = useMissionStore((s) => s.setFilter)
  const setMissions = useMissionStore((s) => s.setMissions)
  const upsertMission = useMissionStore((s) => s.upsertMission)
  const socket = useWebSocketStore((s) => s.socket)

  const allMissions = useMemo(() => Array.from(missionsMap.values()), [missionsMap])

  const missions = useMemo(() => {
    let list = allMissions
    if (statusFilter) {
      list = list.filter((m) => m.status === statusFilter)
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [allMissions, statusFilter])

  // Fetch missions on mount
  useEffect(() => {
    const ws = socket
    if (!ws) return

    ws.emit('missions:list', {}, (res: { missions?: Mission[] }) => {
      if (res?.missions) {
        setMissions(res.missions)
      }
    })

    // Listen for real-time updates
    const handleUpdate = (mission: Mission) => {
      upsertMission(mission)
    }

    ws.on('mission:updated', handleUpdate)
    ws.on('mission:created', handleUpdate)

    return () => {
      ws.off('mission:updated', handleUpdate)
      ws.off('mission:created', handleUpdate)
    }
  }, [socket, setMissions, upsertMission])

  const activeFilter = statusFilter ?? 'all'

  return (
    <div className="flex h-full flex-col p-3 text-white">
      {/* Stats */}
      <StatsBar missions={allMissions} />

      {/* Filter tabs */}
      <div className="flex gap-1 mb-3">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter({ status: opt.key === 'all' ? undefined : opt.key })}
            className={`text-[10px] px-2 py-1 rounded transition-colors ${
              activeFilter === opt.key
                ? 'bg-cyan-500/30 text-cyan-300'
                : 'bg-white/5 text-white/40 hover:bg-white/10'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Mission list */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {missions.length === 0 ? (
          <div className="flex items-center justify-center h-full text-white/30 text-xs">
            No missions found
          </div>
        ) : (
          missions.map((m) => <MissionRow key={m.id} mission={m} />)
        )}
      </div>
    </div>
  )
}
