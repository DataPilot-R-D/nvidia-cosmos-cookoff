/**
 * ZoneEditorModule — Zone CRUD UI for the World Model.
 * Allows creating, editing, deleting zones with type + color assignment.
 * Polygon drawing is wired to the map (future: interactive polygon tool).
 */
'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
import type { ModuleProps } from './ModuleRegistry'
import { MiniMap, type MapPoint } from './shared/MiniMap'

// ── Types ────────────────────────────────────────────────

interface Zone {
  id: string
  name: string
  type: 'patrol' | 'restricted' | 'charging' | 'staging'
  polygon: number[][]
  color: string
  maxRobots: number | null
  speedLimit: number | null
  createdAt: string
  updatedAt: string
}

interface Constraint {
  id: string
  type: 'speed-limit' | 'no-entry' | 'time-window'
  zoneId: string
  params: Record<string, unknown>
  description: string | null
}

type ZoneFormData = {
  name: string
  type: 'patrol' | 'restricted' | 'charging' | 'staging'
  color: string
  maxRobots: string
  speedLimit: string
}

const ZONE_TYPES = ['patrol', 'restricted', 'charging', 'staging'] as const
const TYPE_COLORS: Record<string, string> = {
  patrol: '#3b82f6',
  restricted: '#ef4444',
  charging: '#22c55e',
  staging: '#eab308',
}

const CONSTRAINT_ICONS: Record<string, string> = {
  'speed-limit': '🐢',
  'no-entry': '🚫',
  'time-window': '🕐',
}

const API_BASE = (process.env.NEXT_PUBLIC_WS_URL ?? '')
  .replace(/^ws:\/\//, 'http://')
  .replace(/^wss:\/\//, 'https://')

// ── Component ────────────────────────────────────────────

export function ZoneEditorModule({ windowId }: ModuleProps): ReactNode {
  const [zones, setZones] = useState<Zone[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingZone, setEditingZone] = useState<Zone | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ZoneFormData>({
    name: '',
    type: 'patrol',
    color: '#3b82f6',
    maxRobots: '',
    speedLimit: '',
  })
  const [drawingPolygon, setDrawingPolygon] = useState<MapPoint[]>([])
  const [isDrawing, setIsDrawing] = useState(false)
  const [constraints, setConstraints] = useState<Constraint[]>([])
  const [hiddenZones, setHiddenZones] = useState<Set<string>>(new Set())

  const toggleZoneVisibility = useCallback((id: string) => {
    setHiddenZones((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const fetchConstraints = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/constraints`)
      if (res.ok) setConstraints(await res.json())
    } catch {
      /* non-critical */
    }
  }, [])

  const fetchZones = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`${API_BASE}/api/zones`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setZones(data)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch zones')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchZones()
    fetchConstraints()
  }, [fetchZones, fetchConstraints])

  const resetForm = () => {
    setForm({ name: '', type: 'patrol', color: '#3b82f6', maxRobots: '', speedLimit: '' })
    setEditingZone(null)
    setShowForm(false)
    setDrawingPolygon([])
    setIsDrawing(false)
  }

  const handlePolygonVertexAdd = useCallback((point: MapPoint) => {
    setDrawingPolygon((prev) => [...prev, point])
  }, [])

  const handlePolygonClose = useCallback(() => {
    setIsDrawing(false)
  }, [])

  const handleSubmit = async () => {
    if (!form.name.trim()) return

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      type: form.type,
      color: form.color,
      polygon: drawingPolygon.map((p) => [p.x, p.y]),
    }
    if (form.maxRobots) body.maxRobots = parseInt(form.maxRobots, 10)
    if (form.speedLimit) body.speedLimit = parseFloat(form.speedLimit)

    try {
      const url = editingZone ? `${API_BASE}/api/zones/${editingZone.id}` : `${API_BASE}/api/zones`
      const res = await fetch(url, {
        method: editingZone ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      resetForm()
      fetchZones()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  const handleEdit = (zone: Zone) => {
    setEditingZone(zone)
    setForm({
      name: zone.name,
      type: zone.type,
      color: zone.color,
      maxRobots: zone.maxRobots?.toString() ?? '',
      speedLimit: zone.speedLimit?.toString() ?? '',
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${API_BASE}/api/zones/${id}`, { method: 'DELETE' })
      fetchZones()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div
      className="h-full flex flex-col text-xs text-gray-300 overflow-hidden"
      data-testid={`module-zone-editor-${windowId}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#222]">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          Zone Editor
        </span>
        <button
          onClick={() => {
            resetForm()
            setShowForm(!showForm)
          }}
          className="px-2 py-0.5 text-[10px] bg-blue-600 hover:bg-blue-500 rounded text-white"
        >
          {showForm ? 'Cancel' : '+ New Zone'}
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="px-3 py-2 border-b border-[#222] space-y-2 bg-[#1a1a1a]">
          <input
            type="text"
            placeholder="Zone name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full px-2 py-1 bg-[#111] border border-[#333] rounded text-xs text-white"
          />
          <div className="flex gap-2">
            <select
              value={form.type}
              onChange={(e) => {
                const type = e.target.value as ZoneFormData['type']
                setForm({ ...form, type, color: TYPE_COLORS[type] ?? form.color })
              }}
              className="flex-1 px-2 py-1 bg-[#111] border border-[#333] rounded text-xs text-white"
            >
              {ZONE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="w-8 h-6 bg-transparent border border-[#333] rounded cursor-pointer"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Max robots"
              value={form.maxRobots}
              onChange={(e) => setForm({ ...form, maxRobots: e.target.value })}
              className="flex-1 px-2 py-1 bg-[#111] border border-[#333] rounded text-xs text-white"
            />
            <input
              type="number"
              placeholder="Speed limit (m/s)"
              value={form.speedLimit}
              onChange={(e) => setForm({ ...form, speedLimit: e.target.value })}
              className="flex-1 px-2 py-1 bg-[#111] border border-[#333] rounded text-xs text-white"
              step="0.1"
            />
          </div>
          {/* Polygon drawing */}
          <div className="flex gap-2 items-center">
            <button
              onClick={() => {
                setIsDrawing(!isDrawing)
                if (!isDrawing) setDrawingPolygon([])
              }}
              className={`flex-1 px-2 py-1 text-[10px] font-semibold rounded ${
                isDrawing
                  ? 'bg-orange-600 hover:bg-orange-500 text-white'
                  : 'bg-[#222] hover:bg-[#333] text-gray-300'
              }`}
            >
              {isDrawing ? '✏️ Drawing...' : '✏️ Draw Polygon'}
            </button>
            {drawingPolygon.length > 0 && (
              <span className="text-[10px] text-gray-400">{drawingPolygon.length} vertices</span>
            )}
          </div>
          {(isDrawing || drawingPolygon.length > 0) && (
            <div className="h-32 border border-[#333] rounded overflow-hidden">
              <MiniMap
                mode={isDrawing ? 'polygon' : 'view'}
                drawingPolygon={drawingPolygon}
                onPolygonVertexAdd={handlePolygonVertexAdd}
                onPolygonClose={handlePolygonClose}
                zones={zones.map((z) => ({
                  id: z.id,
                  name: z.name,
                  polygon: z.polygon.map((p) => ({ x: p[0], y: p[1] })),
                  color: z.color,
                }))}
              />
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={!form.name.trim()}
            className="w-full px-2 py-1 bg-green-600 hover:bg-green-500 disabled:opacity-40 rounded text-white text-[10px] font-semibold"
          >
            {editingZone ? 'Update Zone' : 'Create Zone'}
          </button>
        </div>
      )}

      {/* Error */}
      {error && <div className="px-3 py-1 bg-red-900/30 text-red-400 text-[10px]">{error}</div>}

      {/* Map overview */}
      {zones.length > 0 && !showForm && (
        <div className="h-28 border-b border-[#222]">
          <MiniMap
            mode="view"
            zones={zones
              .filter((z) => !hiddenZones.has(z.id))
              .map((z) => ({
                id: z.id,
                name: z.name,
                polygon: z.polygon.map((p) => ({ x: p[0], y: p[1] })),
                color: z.color,
              }))}
          />
        </div>
      )}

      {/* Zone list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500">Loading...</div>
        ) : zones.length === 0 ? (
          <div className="p-4 text-center text-gray-500">No zones defined</div>
        ) : (
          zones.map((zone) => {
            const zoneConstraints = constraints.filter((c) => c.zoneId === zone.id)
            const isHidden = hiddenZones.has(zone.id)
            return (
              <div
                key={zone.id}
                className={`flex items-center gap-2 px-3 py-2 border-b border-[#1a1a1a] hover:bg-[#1a1a1a] ${isHidden ? 'opacity-40' : ''}`}
                data-testid={`zone-item-${zone.id}`}
              >
                <button
                  onClick={() => toggleZoneVisibility(zone.id)}
                  className="text-[10px] flex-shrink-0"
                  title={isHidden ? 'Show zone' : 'Hide zone'}
                  data-testid={`zone-toggle-${zone.id}`}
                >
                  {isHidden ? '👁️‍🗨️' : '👁️'}
                </button>
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: zone.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">{zone.name}</div>
                  <div className="text-[10px] text-gray-500">
                    {zone.type}
                    {zone.maxRobots != null && ` · max ${zone.maxRobots}`}
                    {zone.speedLimit != null && ` · ${zone.speedLimit} m/s`}
                    {zoneConstraints.length > 0 && (
                      <span className="ml-1" data-testid={`zone-constraints-${zone.id}`}>
                        {zoneConstraints.map((c) => CONSTRAINT_ICONS[c.type] ?? '⚙️').join(' ')}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleEdit(zone)}
                  className="text-[10px] text-blue-400 hover:text-blue-300"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(zone.id)}
                  className="text-[10px] text-red-400 hover:text-red-300"
                >
                  Del
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
