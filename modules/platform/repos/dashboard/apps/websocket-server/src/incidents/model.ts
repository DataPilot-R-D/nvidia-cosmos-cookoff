/**
 * Incident model — typed CRUD operations on the incidents table.
 * Uses bun:sqlite Database type.
 */
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Database } from 'bun:sqlite'

// ── Schemas ──────────────────────────────────────────────

export const IncidentStatus = z.enum(['New', 'Ack', 'Closed'])
// eslint-disable-next-line no-redeclare
export type IncidentStatus = z.infer<typeof IncidentStatus>

export const IncidentSeverity = z.enum(['Low', 'Medium', 'High', 'Critical'])
// eslint-disable-next-line no-redeclare
export type IncidentSeverity = z.infer<typeof IncidentSeverity>

export const CreateIncidentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().default(''),
  status: IncidentStatus.default('New'),
  severity: IncidentSeverity.default('Low'),
  cameraSourceId: z.string().nullable().optional(),
  robotId: z.string().nullable().optional(),
})
export type CreateIncidentInput = z.infer<typeof CreateIncidentSchema>

export const UpdateIncidentSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: IncidentStatus.optional(),
  severity: IncidentSeverity.optional(),
  cameraSourceId: z.string().nullable().optional(),
  robotId: z.string().nullable().optional(),
})
export type UpdateIncidentInput = z.infer<typeof UpdateIncidentSchema>

export const IncidentFilterSchema = z.object({
  status: IncidentStatus.optional(),
  severity: IncidentSeverity.optional(),
  robotId: z.string().optional(),
  cameraSourceId: z.string().optional(),
})
export type IncidentFilter = z.infer<typeof IncidentFilterSchema>

export interface Incident {
  id: string
  title: string
  description: string
  status: IncidentStatus
  severity: IncidentSeverity
  cameraSourceId: string | null
  robotId: string | null
  createdAt: string
  updatedAt: string
}

// ── CRUD ─────────────────────────────────────────────────

export function createIncident(db: Database, input: CreateIncidentInput): Incident {
  const parsed = CreateIncidentSchema.parse(input)
  const now = new Date().toISOString()
  const id = randomUUID()

  const incident: Incident = {
    id,
    title: parsed.title,
    description: parsed.description,
    status: parsed.status,
    severity: parsed.severity,
    cameraSourceId: parsed.cameraSourceId ?? null,
    robotId: parsed.robotId ?? null,
    createdAt: now,
    updatedAt: now,
  }

  db.prepare(
    `INSERT INTO incidents (id, title, description, status, severity, cameraSourceId, robotId, createdAt, updatedAt)
     VALUES ($id, $title, $description, $status, $severity, $cameraSourceId, $robotId, $createdAt, $updatedAt)`
  ).run({
    $id: incident.id,
    $title: incident.title,
    $description: incident.description,
    $status: incident.status,
    $severity: incident.severity,
    $cameraSourceId: incident.cameraSourceId,
    $robotId: incident.robotId,
    $createdAt: incident.createdAt,
    $updatedAt: incident.updatedAt,
  })

  return incident
}

export function getIncident(db: Database, id: string): Incident | null {
  return (db.prepare('SELECT * FROM incidents WHERE id = ?').get(id) as Incident | null) ?? null
}

export function listIncidents(db: Database, filter?: IncidentFilter): Incident[] {
  const conditions: string[] = []
  const params: Record<string, string> = {}

  if (filter?.status) {
    conditions.push('status = $status')
    params.$status = filter.status
  }
  if (filter?.severity) {
    conditions.push('severity = $severity')
    params.$severity = filter.severity
  }
  if (filter?.robotId) {
    conditions.push('robotId = $robotId')
    params.$robotId = filter.robotId
  }
  if (filter?.cameraSourceId) {
    conditions.push('cameraSourceId = $cameraSourceId')
    params.$cameraSourceId = filter.cameraSourceId
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  return db
    .prepare(`SELECT * FROM incidents ${where} ORDER BY createdAt DESC`)
    .all(params) as Incident[]
}

export function updateIncident(
  db: Database,
  id: string,
  input: UpdateIncidentInput
): Incident | null {
  const parsed = UpdateIncidentSchema.parse(input)
  const existing = getIncident(db, id)
  if (!existing) return null

  const sets: string[] = []
  const params: Record<string, string> = { $id: id }

  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) {
      sets.push(`${key} = $${key}`)
      params[`$${key}`] = value as string
    }
  }

  if (sets.length === 0) return existing

  const now = new Date().toISOString()
  sets.push('updatedAt = $updatedAt')
  params.$updatedAt = now

  db.prepare(`UPDATE incidents SET ${sets.join(', ')} WHERE id = $id`).run(params)
  return getIncident(db, id)
}

export function deleteIncident(db: Database, id: string): boolean {
  const result = db.prepare('DELETE FROM incidents WHERE id = ?').run(id)
  return result.changes > 0
}
