/**
 * Evidence Bundle model — typed CRUD operations.
 * Links events, video pointers, and attachments to incidents and missions.
 */
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Database } from 'bun:sqlite'

// ── Schemas ──────────────────────────────────────────────

export const EvidenceTypeSchema = z.enum([
  'video_clip',
  'snapshot',
  'sensor_log',
  'audit_entry',
  'event',
  'note',
])
// eslint-disable-next-line no-redeclare
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>

export const CreateEvidenceSchema = z.object({
  type: EvidenceTypeSchema,
  title: z.string().min(1, 'Title is required'),
  description: z.string().default(''),
  incidentId: z.string().nullable().optional(),
  missionId: z.string().nullable().optional(),
  robotId: z.string().nullable().optional(),
  cameraSourceId: z.string().nullable().optional(),
  /** ISO timestamp of when the evidence was captured */
  capturedAt: z.string().optional(),
  /** Video pointer: stream URL or recording path */
  mediaUrl: z.string().nullable().optional(),
  /** Start/end offsets in seconds for video clips */
  startOffset: z.number().nullable().optional(),
  endOffset: z.number().nullable().optional(),
  /** Arbitrary metadata (sensor readings, coordinates, etc.) */
  metadata: z.record(z.unknown()).optional(),
})
export type CreateEvidenceInput = z.infer<typeof CreateEvidenceSchema>

export const UpdateEvidenceSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  incidentId: z.string().nullable().optional(),
  missionId: z.string().nullable().optional(),
  robotId: z.string().nullable().optional(),
  cameraSourceId: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  startOffset: z.number().nullable().optional(),
  endOffset: z.number().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
})
export type UpdateEvidenceInput = z.infer<typeof UpdateEvidenceSchema>

export const EvidenceFilterSchema = z.object({
  type: EvidenceTypeSchema.optional(),
  incidentId: z.string().optional(),
  missionId: z.string().optional(),
  robotId: z.string().optional(),
  cameraSourceId: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})
export type EvidenceFilter = z.infer<typeof EvidenceFilterSchema>

export interface Evidence {
  id: string
  type: EvidenceType
  title: string
  description: string
  incidentId: string | null
  missionId: string | null
  robotId: string | null
  cameraSourceId: string | null
  capturedAt: string
  mediaUrl: string | null
  startOffset: number | null
  endOffset: number | null
  metadata: string | null
  createdAt: string
  updatedAt: string
}

interface EvidenceRow {
  id: string
  type: string
  title: string
  description: string
  incidentId: string | null
  missionId: string | null
  robotId: string | null
  cameraSourceId: string | null
  capturedAt: string
  mediaUrl: string | null
  startOffset: number | null
  endOffset: number | null
  metadata: string | null
  createdAt: string
  updatedAt: string
}

function rowToEvidence(row: EvidenceRow): Evidence {
  return { ...row, type: row.type as EvidenceType }
}

// ── CRUD ─────────────────────────────────────────────────

export function createEvidence(db: Database, input: CreateEvidenceInput): Evidence {
  const parsed = CreateEvidenceSchema.parse(input)
  const now = new Date().toISOString()
  const id = randomUUID()

  const evidence: Evidence = {
    id,
    type: parsed.type,
    title: parsed.title,
    description: parsed.description,
    incidentId: parsed.incidentId ?? null,
    missionId: parsed.missionId ?? null,
    robotId: parsed.robotId ?? null,
    cameraSourceId: parsed.cameraSourceId ?? null,
    capturedAt: parsed.capturedAt ?? now,
    mediaUrl: parsed.mediaUrl ?? null,
    startOffset: parsed.startOffset ?? null,
    endOffset: parsed.endOffset ?? null,
    metadata: parsed.metadata ? JSON.stringify(parsed.metadata) : null,
    createdAt: now,
    updatedAt: now,
  }

  db.prepare(
    `INSERT INTO evidence
       (id, type, title, description, incidentId, missionId, robotId, cameraSourceId,
        capturedAt, mediaUrl, startOffset, endOffset, metadata, createdAt, updatedAt)
     VALUES ($id, $type, $title, $description, $incidentId, $missionId, $robotId, $cameraSourceId,
        $capturedAt, $mediaUrl, $startOffset, $endOffset, $metadata, $createdAt, $updatedAt)`
  ).run({
    $id: evidence.id,
    $type: evidence.type,
    $title: evidence.title,
    $description: evidence.description,
    $incidentId: evidence.incidentId,
    $missionId: evidence.missionId,
    $robotId: evidence.robotId,
    $cameraSourceId: evidence.cameraSourceId,
    $capturedAt: evidence.capturedAt,
    $mediaUrl: evidence.mediaUrl,
    $startOffset: evidence.startOffset,
    $endOffset: evidence.endOffset,
    $metadata: evidence.metadata,
    $createdAt: evidence.createdAt,
    $updatedAt: evidence.updatedAt,
  })

  return evidence
}

export function getEvidence(db: Database, id: string): Evidence | null {
  const row = db.prepare('SELECT * FROM evidence WHERE id = ?').get(id) as EvidenceRow | null
  return row ? rowToEvidence(row) : null
}

export function listEvidence(
  db: Database,
  filter?: EvidenceFilter
): { entries: Evidence[]; total: number } {
  const parsed = EvidenceFilterSchema.parse(filter ?? {})
  const conditions: string[] = []
  const params: Record<string, string | number> = {}

  if (parsed.type) {
    conditions.push('type = $type')
    params.$type = parsed.type
  }
  if (parsed.incidentId) {
    conditions.push('incidentId = $incidentId')
    params.$incidentId = parsed.incidentId
  }
  if (parsed.missionId) {
    conditions.push('missionId = $missionId')
    params.$missionId = parsed.missionId
  }
  if (parsed.robotId) {
    conditions.push('robotId = $robotId')
    params.$robotId = parsed.robotId
  }
  if (parsed.cameraSourceId) {
    conditions.push('cameraSourceId = $cameraSourceId')
    params.$cameraSourceId = parsed.cameraSourceId
  }
  if (parsed.fromDate) {
    conditions.push('capturedAt >= $fromDate')
    params.$fromDate = parsed.fromDate
  }
  if (parsed.toDate) {
    conditions.push('capturedAt <= $toDate')
    params.$toDate = parsed.toDate
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM evidence ${where}`).get(params) as {
    cnt: number
  }
  const total = countRow.cnt

  params.$limit = parsed.limit
  params.$offset = parsed.offset

  const rows = db
    .prepare(`SELECT * FROM evidence ${where} ORDER BY capturedAt DESC LIMIT $limit OFFSET $offset`)
    .all(params) as EvidenceRow[]

  return { entries: rows.map(rowToEvidence), total }
}

export function updateEvidence(
  db: Database,
  id: string,
  input: UpdateEvidenceInput
): Evidence | null {
  const parsed = UpdateEvidenceSchema.parse(input)
  const existing = getEvidence(db, id)
  if (!existing) return null

  const ALLOWED_COLUMNS = [
    'title',
    'description',
    'incidentId',
    'missionId',
    'robotId',
    'cameraSourceId',
    'mediaUrl',
    'startOffset',
    'endOffset',
  ] as const
  const sets: string[] = []
  const params: Record<string, string | number | null> = { $id: id }

  if (parsed.metadata !== undefined) {
    sets.push('metadata = $metadata')
    params.$metadata = JSON.stringify(parsed.metadata)
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

  db.prepare(`UPDATE evidence SET ${sets.join(', ')} WHERE id = $id`).run(params)
  return getEvidence(db, id)
}

export function deleteEvidence(db: Database, id: string): boolean {
  const result = db.prepare('DELETE FROM evidence WHERE id = ?').run(id)
  return result.changes > 0
}

// ── Bundle ───────────────────────────────────────────────

export interface EvidenceBundle {
  incidentId: string
  items: Evidence[]
  summary: {
    total: number
    byType: Record<string, number>
    timeRange: { earliest: string; latest: string } | null
    cameras: string[]
  }
}

/**
 * Get all evidence items linked to an incident, grouped as a bundle.
 */
export function getBundle(db: Database, incidentId: string): EvidenceBundle {
  const items = listEvidence(db, { incidentId, limit: 500, offset: 0 }).entries

  const byType: Record<string, number> = {}
  const cameras = new Set<string>()
  let earliest: string | null = null
  let latest: string | null = null

  for (const item of items) {
    byType[item.type] = (byType[item.type] ?? 0) + 1
    if (item.cameraSourceId) cameras.add(item.cameraSourceId)
    if (!earliest || item.capturedAt < earliest) earliest = item.capturedAt
    if (!latest || item.capturedAt > latest) latest = item.capturedAt
  }

  return {
    incidentId,
    items,
    summary: {
      total: items.length,
      byType,
      timeRange: earliest && latest ? { earliest, latest } : null,
      cameras: [...cameras],
    },
  }
}
