/**
 * World Model — typed CRUD for zones and assets.
 */
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Database } from 'bun:sqlite'

// ── Zone Schemas ─────────────────────────────────────────

export const ZoneTypeSchema = z.enum(['patrol', 'restricted', 'charging'])
export type ZoneType = z.infer<typeof ZoneTypeSchema>

export const CreateZoneSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: ZoneTypeSchema.default('patrol'),
  polygon: z.array(z.array(z.number()).length(2)).default([]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color')
    .default('#3b82f6'),
  maxRobots: z.number().int().positive().nullable().optional(),
  speedLimit: z.number().positive().nullable().optional(),
})
export type CreateZoneInput = z.infer<typeof CreateZoneSchema>

export const UpdateZoneSchema = z.object({
  name: z.string().min(1).optional(),
  type: ZoneTypeSchema.optional(),
  polygon: z.array(z.array(z.number()).length(2)).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  maxRobots: z.number().int().positive().nullable().optional(),
  speedLimit: z.number().positive().nullable().optional(),
})
export type UpdateZoneInput = z.infer<typeof UpdateZoneSchema>

export interface Zone {
  id: string
  name: string
  type: ZoneType
  polygon: number[][]
  color: string
  maxRobots: number | null
  speedLimit: number | null
  createdAt: string
  updatedAt: string
}

interface ZoneRow {
  id: string
  name: string
  type: string
  polygon: string
  color: string
  maxRobots: number | null
  speedLimit: number | null
  createdAt: string
  updatedAt: string
}

function rowToZone(row: ZoneRow): Zone {
  return {
    ...row,
    type: row.type as ZoneType,
    polygon: JSON.parse(row.polygon) as number[][],
  }
}

// ── Zone CRUD ────────────────────────────────────────────

export function createZone(db: Database, input: CreateZoneInput): Zone {
  const parsed = CreateZoneSchema.parse(input)
  const now = new Date().toISOString()
  const id = randomUUID()

  db.prepare(
    `INSERT INTO zones (id, name, type, polygon, color, maxRobots, speedLimit, createdAt, updatedAt)
     VALUES ($id, $name, $type, $polygon, $color, $maxRobots, $speedLimit, $createdAt, $updatedAt)`
  ).run({
    $id: id,
    $name: parsed.name,
    $type: parsed.type,
    $polygon: JSON.stringify(parsed.polygon),
    $color: parsed.color,
    $maxRobots: parsed.maxRobots ?? null,
    $speedLimit: parsed.speedLimit ?? null,
    $createdAt: now,
    $updatedAt: now,
  })

  return {
    id,
    name: parsed.name,
    type: parsed.type,
    polygon: parsed.polygon,
    color: parsed.color,
    maxRobots: parsed.maxRobots ?? null,
    speedLimit: parsed.speedLimit ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

export function getZone(db: Database, id: string): Zone | null {
  const row = db.prepare('SELECT * FROM zones WHERE id = ?').get(id) as ZoneRow | null
  return row ? rowToZone(row) : null
}

export function listZones(db: Database): Zone[] {
  const rows = db.prepare('SELECT * FROM zones ORDER BY createdAt DESC').all() as ZoneRow[]
  return rows.map(rowToZone)
}

export function updateZone(db: Database, id: string, input: UpdateZoneInput): Zone | null {
  const parsed = UpdateZoneSchema.parse(input)
  const existing = getZone(db, id)
  if (!existing) return null

  const sets: string[] = []
  const params: Record<string, string | number | null> = { $id: id }

  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined) {
      if (key === 'polygon') {
        sets.push('polygon = $polygon')
        params.$polygon = JSON.stringify(value)
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

  db.prepare(`UPDATE zones SET ${sets.join(', ')} WHERE id = $id`).run(params)
  return getZone(db, id)
}

export function deleteZone(db: Database, id: string): boolean {
  const result = db.prepare('DELETE FROM zones WHERE id = ?').run(id)
  return result.changes > 0
}

// ── Asset Schemas ────────────────────────────────────────

export const CreateAssetSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.string().min(1).default('robot'),
  zoneId: z.string().nullable().optional(),
  position: z
    .object({
      x: z.number().default(0),
      y: z.number().default(0),
      z: z.number().default(0),
    })
    .default({ x: 0, y: 0, z: 0 }),
})
export type CreateAssetInput = z.infer<typeof CreateAssetSchema>

export const UpdateAssetSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  zoneId: z.string().nullable().optional(),
  position: z
    .object({
      x: z.number().optional(),
      y: z.number().optional(),
      z: z.number().optional(),
    })
    .optional(),
})
export type UpdateAssetInput = z.infer<typeof UpdateAssetSchema>

export interface Asset {
  id: string
  name: string
  type: string
  zoneId: string | null
  position: { x: number; y: number; z: number }
  createdAt: string
  updatedAt: string
}

interface AssetRow {
  id: string
  name: string
  type: string
  zoneId: string | null
  positionX: number
  positionY: number
  positionZ: number
  createdAt: string
  updatedAt: string
}

function rowToAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    zoneId: row.zoneId,
    position: { x: row.positionX, y: row.positionY, z: row.positionZ },
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

// ── Asset CRUD ───────────────────────────────────────────

export function createAsset(db: Database, input: CreateAssetInput): Asset {
  const parsed = CreateAssetSchema.parse(input)
  const now = new Date().toISOString()
  const id = randomUUID()

  db.prepare(
    `INSERT INTO assets (id, name, type, zoneId, positionX, positionY, positionZ, createdAt, updatedAt)
     VALUES ($id, $name, $type, $zoneId, $positionX, $positionY, $positionZ, $createdAt, $updatedAt)`
  ).run({
    $id: id,
    $name: parsed.name,
    $type: parsed.type,
    $zoneId: parsed.zoneId ?? null,
    $positionX: parsed.position.x,
    $positionY: parsed.position.y,
    $positionZ: parsed.position.z,
    $createdAt: now,
    $updatedAt: now,
  })

  return {
    id,
    name: parsed.name,
    type: parsed.type,
    zoneId: parsed.zoneId ?? null,
    position: parsed.position,
    createdAt: now,
    updatedAt: now,
  }
}

export function getAsset(db: Database, id: string): Asset | null {
  const row = db.prepare('SELECT * FROM assets WHERE id = ?').get(id) as AssetRow | null
  return row ? rowToAsset(row) : null
}

export function listAssets(db: Database, zoneId?: string): Asset[] {
  if (zoneId) {
    const rows = db
      .prepare('SELECT * FROM assets WHERE zoneId = ? ORDER BY createdAt DESC')
      .all(zoneId) as AssetRow[]
    return rows.map(rowToAsset)
  }
  const rows = db.prepare('SELECT * FROM assets ORDER BY createdAt DESC').all() as AssetRow[]
  return rows.map(rowToAsset)
}

export function updateAsset(db: Database, id: string, input: UpdateAssetInput): Asset | null {
  const parsed = UpdateAssetSchema.parse(input)
  const existing = getAsset(db, id)
  if (!existing) return null

  const sets: string[] = []
  const params: Record<string, string | number | null> = { $id: id }

  if (parsed.name !== undefined) {
    sets.push('name = $name')
    params.$name = parsed.name
  }
  if (parsed.type !== undefined) {
    sets.push('type = $type')
    params.$type = parsed.type
  }
  if (parsed.zoneId !== undefined) {
    sets.push('zoneId = $zoneId')
    params.$zoneId = parsed.zoneId ?? null
  }
  if (parsed.position) {
    if (parsed.position.x !== undefined) {
      sets.push('positionX = $positionX')
      params.$positionX = parsed.position.x
    }
    if (parsed.position.y !== undefined) {
      sets.push('positionY = $positionY')
      params.$positionY = parsed.position.y
    }
    if (parsed.position.z !== undefined) {
      sets.push('positionZ = $positionZ')
      params.$positionZ = parsed.position.z
    }
  }

  if (sets.length === 0) return existing

  const now = new Date().toISOString()
  sets.push('updatedAt = $updatedAt')
  params.$updatedAt = now

  db.prepare(`UPDATE assets SET ${sets.join(', ')} WHERE id = $id`).run(params)
  return getAsset(db, id)
}

export function deleteAsset(db: Database, id: string): boolean {
  const result = db.prepare('DELETE FROM assets WHERE id = ?').run(id)
  return result.changes > 0
}
