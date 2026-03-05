/**
 * MissionPlannerModule — Mission CRUD + dispatch + real-time status.
 *
 * Features:
 * - List missions with status/type filters
 * - Create mission form (name, type, waypoints, robotId)
 * - Dispatch pending missions
 * - Real-time status updates via WS `mission:status` event
 */
'use client'

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import type { ModuleProps } from './ModuleRegistry'
import {
  useMissionStore,
  type Mission,
  type MissionType,
  type MissionStatus,
  type CreateMissionInput,
  type Waypoint,
} from '../../lib/stores/mission-store'
import { MiniMap, type MapPoint } from './shared/MiniMap'

// ── Constants ────────────────────────────────────────────

const MISSION_TYPES: MissionType[] = ['patrol', 'inspect', 'goto']
const MISSION_STATUSES: MissionStatus[] = [
  'pending',
  'dispatched',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
]

const STATUS_COLORS: Record<MissionStatus, string> = {
  pending: '#a3a3a3',
  dispatched: '#3b82f6',
  in_progress: '#f59e0b',
  completed: '#22c55e',
  failed: '#ef4444',
  cancelled: '#6b7280',
}

const TYPE_ICONS: Record<MissionType, string> = {
  patrol: '🔄',
  inspect: '🔍',
  goto: '📍',
}

/**
 * Derive HTTP base URL from the WS server URL.
 * NEXT_PUBLIC_WS_URL is typically ws:// or http:// — normalise to http(s).
 */
const API_BASE = (process.env.NEXT_PUBLIC_WS_URL ?? '')
  .replace(/^ws:\/\//, 'http://')
  .replace(/^wss:\/\//, 'https://')

// ── API helpers ──────────────────────────────────────────

async function fetchMissions(params?: { status?: string; robotId?: string }): Promise<Mission[]> {
  const url = new URL(`${API_BASE}/api/missions`, window.location.origin)
  if (params?.status) url.searchParams.set('status', params.status)
  if (params?.robotId) url.searchParams.set('robotId', params.robotId)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

async function createMissionApi(input: CreateMissionInput): Promise<Mission> {
  const res = await fetch(`${API_BASE}/api/missions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

async function dispatchMissionApi(id: string): Promise<Mission> {
  const res = await fetch(`${API_BASE}/api/missions/${id}/dispatch`, {
    method: 'POST',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json()
}

async function deleteMissionApi(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/missions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

// ── Form state ───────────────────────────────────────────

interface FormState {
  name: string
  type: MissionType
  waypoints: Waypoint[]
  robotId: string
}

const EMPTY_FORM: FormState = {
  name: '',
  type: 'patrol',
  waypoints: [],
  robotId: '',
}

// ── Component ────────────────────────────────────────────

export function MissionPlannerModule({ windowId }: ModuleProps): ReactNode {
  const store = useMissionStore()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  // ── Fetch missions ──
  const loadMissions = useCallback(async () => {
    try {
      store.setLoading(true)
      store.setError(null)
      const data = await fetchMissions()
      store.setMissions(data)
    } catch (e) {
      store.setError(e instanceof Error ? e.message : 'Failed to load missions')
    } finally {
      store.setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── WS subscription for real-time updates ──
  useEffect(() => {
    loadMissions()

    if (!API_BASE) return undefined

    // Connect WS for mission:status events
    const wsUrl = API_BASE.replace(/^http/, 'ws')
    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string)
          if (msg.type === 'mission:status' && msg.payload) {
            store.upsertMission(msg.payload as Mission)
          }
        } catch {
          // ignore non-JSON messages
        }
      }

      ws.onerror = () => {
        // silent — missions still work via REST polling
      }

      return () => {
        ws.close()
        wsRef.current = null
      }
    } catch {
      return undefined
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──
  const handleCreate = async () => {
    if (!form.name.trim()) return
    setSubmitting(true)
    try {
      const input: CreateMissionInput = {
        name: form.name.trim(),
        type: form.type,
        waypoints: form.waypoints.map((w) => ({ x: w.x, y: w.y, z: 0 })),
        robotId: form.robotId.trim() || null,
      }
      const mission = await createMissionApi(input)
      store.upsertMission(mission)
      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch (e) {
      store.setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDispatch = async (id: string) => {
    try {
      const updated = await dispatchMissionApi(id)
      store.upsertMission(updated)
    } catch (e) {
      store.setError(e instanceof Error ? e.message : 'Dispatch failed')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteMissionApi(id)
      store.removeMission(id)
    } catch (e) {
      store.setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const filteredMissions = store.getFilteredMissions()

  return (
    <div
      className="h-full flex flex-col text-xs text-gray-300 overflow-hidden"
      data-testid={`module-mission-planner-${windowId}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#222]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Mission Planner
        </span>
        <div className="flex gap-1">
          <button
            onClick={loadMissions}
            className="px-2 py-0.5 text-[10px] bg-[#222] hover:bg-[#333] rounded text-gray-300"
            title="Refresh"
          >
            ↻
          </button>
          <button
            onClick={() => {
              setForm(EMPTY_FORM)
              setShowForm(!showForm)
            }}
            className="px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white"
          >
            {showForm ? 'Cancel' : '+ New'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 px-3 py-1.5 border-b border-[#1a1a1a] bg-[#111]">
        <select
          value={store.filters.status ?? ''}
          onChange={(e) =>
            store.setFilter({
              status: (e.target.value || undefined) as MissionStatus | undefined,
            })
          }
          className="flex-1 px-1.5 py-0.5 bg-[#0a0a0a] border border-[#333] rounded text-[10px] text-white"
        >
          <option value="">All statuses</option>
          {MISSION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={store.filters.type ?? ''}
          onChange={(e) =>
            store.setFilter({
              type: (e.target.value || undefined) as MissionType | undefined,
            })
          }
          className="flex-1 px-1.5 py-0.5 bg-[#0a0a0a] border border-[#333] rounded text-[10px] text-white"
        >
          <option value="">All types</option>
          {MISSION_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_ICONS[t]} {t}
            </option>
          ))}
        </select>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="px-3 py-2 border-b border-[#222] space-y-2 bg-[#1a1a1a]">
          <input
            type="text"
            placeholder="Mission name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-2 py-1 bg-[#111] border border-[#333] rounded text-xs text-white"
            data-testid="mission-name-input"
          />
          <div className="flex gap-2">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as MissionType })}
              className="flex-1 px-2 py-1 bg-[#111] border border-[#333] rounded text-xs text-white"
              data-testid="mission-type-select"
            >
              {MISSION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_ICONS[t]} {t}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Robot ID (optional)"
              value={form.robotId}
              onChange={(e) => setForm({ ...form, robotId: e.target.value })}
              className="flex-1 px-2 py-1 bg-[#111] border border-[#333] rounded text-xs text-white"
            />
          </div>
          {/* Interactive waypoint map */}
          <div className="h-32 border border-[#333] rounded overflow-hidden">
            <MiniMap
              mode="waypoint"
              waypoints={form.waypoints.map((w) => ({ x: w.x, y: w.y }))}
              onWaypointAdd={(p: MapPoint) =>
                setForm({ ...form, waypoints: [...form.waypoints, { x: p.x, y: p.y, z: 0 }] })
              }
              onWaypointRemove={(idx: number) =>
                setForm({ ...form, waypoints: form.waypoints.filter((_, i) => i !== idx) })
              }
            />
          </div>
          {form.waypoints.length > 0 && (
            <div className="text-[10px] text-gray-400" data-testid="mission-waypoints-input">
              {form.waypoints.length} waypoint{form.waypoints.length !== 1 ? 's' : ''}:{' '}
              {form.waypoints.map((w) => `(${w.x},${w.y})`).join(' → ')}
            </div>
          )}
          <button
            onClick={handleCreate}
            disabled={!form.name.trim() || submitting}
            className="w-full px-2 py-1 bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded text-white text-[10px] font-semibold"
            data-testid="mission-create-btn"
          >
            {submitting ? 'Creating...' : 'Create Mission'}
          </button>
        </div>
      )}

      {/* Error */}
      {store.error && (
        <div className="px-3 py-1 bg-red-900/30 text-red-400 text-[10px]">{store.error}</div>
      )}

      {/* Mission list */}
      <div className="flex-1 overflow-y-auto">
        {store.loading ? (
          <div className="p-4 text-center text-gray-500">Loading...</div>
        ) : filteredMissions.length === 0 ? (
          <div className="p-4 text-center text-gray-500">No missions</div>
        ) : (
          filteredMissions.map((mission) => (
            <MissionRow
              key={mission.id}
              mission={mission}
              isSelected={store.selectedMissionId === mission.id}
              onSelect={() => store.setSelectedMission(mission.id)}
              onDispatch={() => handleDispatch(mission.id)}
              onDelete={() => handleDelete(mission.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ── Mission Row ──────────────────────────────────────────

function MissionRow({
  mission,
  isSelected,
  onSelect,
  onDispatch,
  onDelete,
}: {
  mission: Mission
  isSelected: boolean
  onSelect: () => void
  onDispatch: () => void
  onDelete: () => void
}): ReactNode {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-2 border-b border-[#1a1a1a] cursor-pointer hover:bg-[#1a1a1a] ${
        isSelected ? 'bg-[#1a1a2a] border-l-2 border-l-blue-500' : ''
      }`}
      data-testid={`mission-row-${mission.id}`}
    >
      {/* Type icon */}
      <span className="text-sm flex-shrink-0">{TYPE_ICONS[mission.type]}</span>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white truncate">{mission.name}</div>
        <div className="text-[10px] text-gray-500 flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: STATUS_COLORS[mission.status] }}
          />
          {mission.status}
          {mission.robotId && ` · ${mission.robotId}`}
          {mission.waypoints.length > 0 && ` · ${mission.waypoints.length} wp`}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1 flex-shrink-0">
        {mission.status === 'pending' && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDispatch()
            }}
            className="px-1.5 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white"
            title="Dispatch"
          >
            ▶
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="px-1.5 py-0.5 text-[10px] text-red-400 hover:text-red-300"
          title="Delete"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
