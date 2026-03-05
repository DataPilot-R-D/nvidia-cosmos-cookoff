/**
 * Mission model — typed CRUD + dispatch + status tracking.
 */
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Database } from 'bun:sqlite'

// ── Schemas ──────────────────────────────────────────────

export const MissionTypeSchema = z.enum(['patrol', 'inspect', 'goto', 'deliver', 'custom'])
export type MissionType = z.infer<typeof MissionTypeSchema>

export const MissionStatusSchema = z.enum([
  'draft',
  'queued',
  'pending',
  'dispatched',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
])
export type MissionStatus = z.infer<typeof MissionStatusSchema>

const WaypointSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number().default(0),
  label: z.string().optional(),
})

export const CreateMissionSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: MissionTypeSchema.default('patrol'),
  waypoints: z.array(WaypointSchema).default([]),
  zoneSequence: z.array(z.string()).default([]),
  robotId: z.string().nullable().optional(),
  priority: z.number().int().min(0).max(10).default(5),
})
export type CreateMissionInput = z.infer<typeof CreateMissionSchema>

export const UpdateMissionSchema = z.object({
  name: z.string().min(1).optional(),
  type: MissionTypeSchema.optional(),
  waypoints: z.array(WaypointSchema).optional(),
  zoneSequence: z.array(z.string()).optional(),
  robotId: z.string().nullable().optional(),
  status: MissionStatusSchema.optional(),
  priority: z.number().int().min(0).max(10).optional(),
  progress: z.number().min(0).max(100).optional(),
  currentZone: z.string().nullable().optional(),
  eta: z.string().nullable().optional(),
})
export type UpdateMissionInput = z.infer<typeof UpdateMissionSchema>

export interface Waypoint {
  x: number
  y: number
  z: number
  label?: string
}

export interface Mission {
  id: string
  name: string
  type: MissionType
  waypoints: Waypoint[]
  zoneSequence: string[]
  robotId: string | null
  status: MissionStatus
  priority: number
  progress: number
  currentZone: string | null
  eta: string | null
  createdAt: string
  updatedAt: string
}

interface MissionRow {
  id: string
  name: string
  type: string
  waypoints: string
  zoneSequence: string
  robotId: string | null
  status: string
  priority: number
  progress: number
  currentZone: string | null
  eta: string | null
  createdAt: string
  updatedAt: string
}

function rowToMission(row: MissionRow): Mission {
  return {
    ...row,
    type: row.type as MissionType,
    status: row.status as MissionStatus,
    waypoints: JSON.parse(row.waypoints) as Waypoint[],
    zoneSequence: JSON.parse(row.zoneSequence) as string[],
  }
}

// ── CRUD ─────────────────────────────────────────────────

export function createMission(db: Database, input: CreateMissionInput): Mission {
  const parsed = CreateMissionSchema.parse(input)
  const now = new Date().toISOString()
  const id = randomUUID()

  db.prepare(
    `INSERT INTO missions (id, name, type, waypoints, zoneSequence, robotId, status, priority, progress, currentZone, eta, createdAt, updatedAt)
     VALUES ($id, $name, $type, $waypoints, $zoneSequence, $robotId, $status, $priority, $progress, $currentZone, $eta, $createdAt, $updatedAt)`
  ).run({
    $id: id,
    $name: parsed.name,
    $type: parsed.type,
    $waypoints: JSON.stringify(parsed.waypoints),
    $zoneSequence: JSON.stringify(parsed.zoneSequence),
    $robotId: parsed.robotId ?? null,
    $status: 'draft',
    $priority: parsed.priority,
    $progress: 0,
    $currentZone: null,
    $eta: null,
    $createdAt: now,
    $updatedAt: now,
  })

  return {
    id,
    name: parsed.name,
    type: parsed.type,
    waypoints: parsed.waypoints,
    zoneSequence: parsed.zoneSequence,
    robotId: parsed.robotId ?? null,
    status: 'draft',
    priority: parsed.priority,
    progress: 0,
    currentZone: null,
    eta: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function getMission(db: Database, id: string): Mission | null {
  const row = db.prepare('SELECT * FROM missions WHERE id = ?').get(id) as MissionRow | null
  return row ? rowToMission(row) : null
}

export function listMissions(
  db: Database,
  filter?: { status?: string; robotId?: string }
): Mission[] {
  const conditions: string[] = []
  const params: Record<string, string> = {}

  if (filter?.status) {
    conditions.push('status = $status')
    params.$status = filter.status
  }
  if (filter?.robotId) {
    conditions.push('robotId = $robotId')
    params.$robotId = filter.robotId
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = db
    .prepare(`SELECT * FROM missions ${where} ORDER BY createdAt DESC`)
    .all(params) as MissionRow[]
  return rows.map(rowToMission)
}

const VALID_TRANSITIONS: Record<MissionStatus, readonly MissionStatus[]> = {
  draft: ['queued', 'cancelled'],
  queued: ['pending', 'dispatched', 'cancelled'],
  pending: ['dispatched', 'cancelled'],
  dispatched: ['in_progress', 'failed', 'cancelled'],
  in_progress: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
} as const

export function updateMission(db: Database, id: string, input: UpdateMissionInput): Mission | null {
  const parsed = UpdateMissionSchema.parse(input)
  const existing = getMission(db, id)
  if (!existing) return null

  // Enforce valid state transitions
  if (parsed.status && parsed.status !== existing.status) {
    const allowed = VALID_TRANSITIONS[existing.status]
    if (!allowed.includes(parsed.status)) return null
  }

  const ALLOWED_COLUMNS = [
    'name',
    'type',
    'robotId',
    'status',
    'priority',
    'progress',
    'currentZone',
    'eta',
  ] as const
  const sets: string[] = []
  const params: Record<string, string | number | null> = { $id: id }

  if (parsed.waypoints !== undefined) {
    sets.push('waypoints = $waypoints')
    params.$waypoints = JSON.stringify(parsed.waypoints)
  }

  if ((parsed as Record<string, unknown>).zoneSequence !== undefined) {
    sets.push('zoneSequence = $zoneSequence')
    params.$zoneSequence = JSON.stringify((parsed as Record<string, unknown>).zoneSequence)
  }

  for (const col of ALLOWED_COLUMNS) {
    const value = parsed[col]
    if (value !== undefined) {
      sets.push(`${col} = $${col}`)
      params[`$${col}`] = value as string | number | null
    }
  }

  if (sets.length === 0) return existing

  const now = new Date().toISOString()
  sets.push('updatedAt = $updatedAt')
  params.$updatedAt = now

  db.prepare(`UPDATE missions SET ${sets.join(', ')} WHERE id = $id`).run(params)
  return getMission(db, id)
}

export function deleteMission(db: Database, id: string): boolean {
  const result = db.prepare('DELETE FROM missions WHERE id = ?').run(id)
  return result.changes > 0
}

// ── Dispatch ─────────────────────────────────────────────

/**
 * Queue a mission (draft → queued).
 */
export function queueMission(db: Database, id: string): Mission | null {
  const mission = getMission(db, id)
  if (!mission) return null
  if (mission.status !== 'draft') return null
  return updateMission(db, id, { status: 'queued' })
}

/**
 * Dispatch a mission (queued/pending → dispatched).
 */
export function dispatchMission(db: Database, id: string): Mission | null {
  const mission = getMission(db, id)
  if (!mission) return null
  if (!['queued', 'pending'].includes(mission.status)) return null
  return updateMission(db, id, { status: 'dispatched' })
}

/**
 * Get next mission from queue (FIFO with priority override).
 * Higher priority (lower number) first, then by creation time.
 */
export function getNextQueued(db: Database): Mission | null {
  const row = db
    .prepare(
      `SELECT * FROM missions WHERE status = 'queued' ORDER BY priority ASC, createdAt ASC LIMIT 1`
    )
    .get() as MissionRow | null
  return row ? rowToMission(row) : null
}

/**
 * Cancel a mission (any non-terminal status → cancelled).
 */
export function cancelMission(db: Database, id: string): Mission | null {
  const mission = getMission(db, id)
  if (!mission) return null
  if (['completed', 'failed', 'cancelled'].includes(mission.status)) return null
  return updateMission(db, id, { status: 'cancelled' })
}
