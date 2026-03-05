/**
 * Mission model — typed CRUD + dispatch + status tracking.
 */
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Database } from 'bun:sqlite'

// ── Schemas ──────────────────────────────────────────────

export const MissionTypeSchema = z.enum(['patrol', 'inspect', 'goto'])
export type MissionType = z.infer<typeof MissionTypeSchema>

export const MissionStatusSchema = z.enum([
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
  robotId: z.string().nullable().optional(),
})
export type CreateMissionInput = z.infer<typeof CreateMissionSchema>

export const UpdateMissionSchema = z.object({
  name: z.string().min(1).optional(),
  type: MissionTypeSchema.optional(),
  waypoints: z.array(WaypointSchema).optional(),
  robotId: z.string().nullable().optional(),
  status: MissionStatusSchema.optional(),
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
  robotId: string | null
  status: MissionStatus
  createdAt: string
  updatedAt: string
}

interface MissionRow {
  id: string
  name: string
  type: string
  waypoints: string
  robotId: string | null
  status: string
  createdAt: string
  updatedAt: string
}

function rowToMission(row: MissionRow): Mission {
  return {
    ...row,
    type: row.type as MissionType,
    status: row.status as MissionStatus,
    waypoints: JSON.parse(row.waypoints) as Waypoint[],
  }
}

// ── CRUD ─────────────────────────────────────────────────

export function createMission(db: Database, input: CreateMissionInput): Mission {
  const parsed = CreateMissionSchema.parse(input)
  const now = new Date().toISOString()
  const id = randomUUID()

  db.prepare(
    `INSERT INTO missions (id, name, type, waypoints, robotId, status, createdAt, updatedAt)
     VALUES ($id, $name, $type, $waypoints, $robotId, $status, $createdAt, $updatedAt)`
  ).run({
    $id: id,
    $name: parsed.name,
    $type: parsed.type,
    $waypoints: JSON.stringify(parsed.waypoints),
    $robotId: parsed.robotId ?? null,
    $status: 'pending',
    $createdAt: now,
    $updatedAt: now,
  })

  return {
    id,
    name: parsed.name,
    type: parsed.type,
    waypoints: parsed.waypoints,
    robotId: parsed.robotId ?? null,
    status: 'pending',
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

export function updateMission(db: Database, id: string, input: UpdateMissionInput): Mission | null {
  const parsed = UpdateMissionSchema.parse(input)
  const existing = getMission(db, id)
  if (!existing) return null

  const sets: string[] = []
  const params: Record<string, string | number | null> = { $id: id }

  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) {
      if (key === 'waypoints') {
        sets.push('waypoints = $waypoints')
        params.$waypoints = JSON.stringify(value)
      } else {
        sets.push(`${key} = $${key}`)
        params[`$${key}`] = value as string | number | null
      }
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

export function dispatchMission(db: Database, id: string): Mission | null {
  const mission = getMission(db, id)
  if (!mission) return null
  if (mission.status !== 'pending') return null // can only dispatch pending missions

  return updateMission(db, id, { status: 'dispatched' })
}
