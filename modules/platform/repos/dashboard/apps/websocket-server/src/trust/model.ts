/**
 * Trust Layer model — confidence/risk scoring per robot with handover logic.
 *
 * Tracks trust scores, risk levels, and generates recommendations
 * for when an operator should intervene.
 */
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import type { Database } from 'bun:sqlite'

// ── Schemas ──────────────────────────────────────────────

export const RiskLevel = z.enum(['low', 'medium', 'high', 'critical'])
// eslint-disable-next-line no-redeclare
export type RiskLevel = z.infer<typeof RiskLevel>

export const HandoverStatus = z.enum(['autonomous', 'supervised', 'manual', 'emergency_stop'])
// eslint-disable-next-line no-redeclare
export type HandoverStatus = z.infer<typeof HandoverStatus>

export const UpdateTrustSchema = z.object({
  robotId: z.string().min(1, 'robotId is required'),
  confidenceScore: z.number().min(0).max(100),
  riskLevel: RiskLevel,
  handoverStatus: HandoverStatus.optional(),
  reasons: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  sensorHealth: z.record(z.number().min(0).max(100)).optional(),
  metadata: z.record(z.unknown()).optional(),
})
export type UpdateTrustInput = z.infer<typeof UpdateTrustSchema>

export const TrustFilterSchema = z.object({
  robotId: z.string().optional(),
  riskLevel: RiskLevel.optional(),
  handoverStatus: HandoverStatus.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})
export type TrustFilter = z.infer<typeof TrustFilterSchema>

export interface TrustScore {
  id: string
  robotId: string
  confidenceScore: number
  riskLevel: RiskLevel
  handoverStatus: HandoverStatus
  reasons: string
  recommendations: string
  sensorHealth: string | null
  metadata: string | null
  createdAt: string
  updatedAt: string
}

interface TrustRow {
  id: string
  robotId: string
  confidenceScore: number
  riskLevel: string
  handoverStatus: string
  reasons: string
  recommendations: string
  sensorHealth: string | null
  metadata: string | null
  createdAt: string
  updatedAt: string
}

function rowToTrust(row: TrustRow): TrustScore {
  return {
    ...row,
    riskLevel: row.riskLevel as RiskLevel,
    handoverStatus: row.handoverStatus as HandoverStatus,
  }
}

// ── Handover Logic ───────────────────────────────────────

/**
 * Determine handover status based on confidence and risk.
 */
export function computeHandoverStatus(
  confidenceScore: number,
  riskLevel: RiskLevel
): HandoverStatus {
  if (riskLevel === 'critical') return 'emergency_stop'
  if (riskLevel === 'high' || confidenceScore < 30) return 'manual'
  if (riskLevel === 'medium' || confidenceScore < 60) return 'supervised'
  return 'autonomous'
}

/**
 * Generate intervention recommendations based on current state.
 */
export function generateRecommendations(
  confidenceScore: number,
  riskLevel: RiskLevel,
  sensorHealth?: Record<string, number>
): string[] {
  const recs: string[] = []

  if (confidenceScore < 30) {
    recs.push('Confidence critically low — immediate operator takeover recommended')
  } else if (confidenceScore < 60) {
    recs.push('Confidence below threshold — increase operator monitoring')
  }

  if (riskLevel === 'critical') {
    recs.push('CRITICAL risk detected — trigger emergency stop protocol')
  } else if (riskLevel === 'high') {
    recs.push('High risk — consider switching to manual control')
  }

  if (sensorHealth) {
    for (const [sensor, health] of Object.entries(sensorHealth)) {
      if (health < 50) {
        recs.push(`Sensor "${sensor}" degraded (${health}%) — verify hardware`)
      }
    }
  }

  if (recs.length === 0) {
    recs.push('All systems nominal — autonomous operation safe')
  }

  return recs
}

// ── CRUD ─────────────────────────────────────────────────

/**
 * Upsert trust score for a robot. Creates new or updates existing.
 */
export function upsertTrustScore(db: Database, input: UpdateTrustInput): TrustScore {
  const parsed = UpdateTrustSchema.parse(input)
  const now = new Date().toISOString()
  const handover =
    parsed.handoverStatus ?? computeHandoverStatus(parsed.confidenceScore, parsed.riskLevel)

  const autoRecs =
    parsed.recommendations.length > 0
      ? parsed.recommendations
      : generateRecommendations(parsed.confidenceScore, parsed.riskLevel, parsed.sensorHealth)

  // Check if exists
  const existing = db
    .prepare('SELECT id FROM trust_scores WHERE robotId = ?')
    .get(parsed.robotId) as { id: string } | null

  if (existing) {
    db.prepare(
      `UPDATE trust_scores SET
        confidenceScore = $confidenceScore,
        riskLevel = $riskLevel,
        handoverStatus = $handoverStatus,
        reasons = $reasons,
        recommendations = $recommendations,
        sensorHealth = $sensorHealth,
        metadata = $metadata,
        updatedAt = $updatedAt
      WHERE robotId = $robotId`
    ).run({
      $robotId: parsed.robotId,
      $confidenceScore: parsed.confidenceScore,
      $riskLevel: parsed.riskLevel,
      $handoverStatus: handover,
      $reasons: JSON.stringify(parsed.reasons),
      $recommendations: JSON.stringify(autoRecs),
      $sensorHealth: parsed.sensorHealth ? JSON.stringify(parsed.sensorHealth) : null,
      $metadata: parsed.metadata ? JSON.stringify(parsed.metadata) : null,
      $updatedAt: now,
    })

    return getTrustScore(db, parsed.robotId)!
  }

  const id = randomUUID()
  db.prepare(
    `INSERT INTO trust_scores
      (id, robotId, confidenceScore, riskLevel, handoverStatus, reasons, recommendations,
       sensorHealth, metadata, createdAt, updatedAt)
    VALUES ($id, $robotId, $confidenceScore, $riskLevel, $handoverStatus, $reasons,
       $recommendations, $sensorHealth, $metadata, $createdAt, $updatedAt)`
  ).run({
    $id: id,
    $robotId: parsed.robotId,
    $confidenceScore: parsed.confidenceScore,
    $riskLevel: parsed.riskLevel,
    $handoverStatus: handover,
    $reasons: JSON.stringify(parsed.reasons),
    $recommendations: JSON.stringify(autoRecs),
    $sensorHealth: parsed.sensorHealth ? JSON.stringify(parsed.sensorHealth) : null,
    $metadata: parsed.metadata ? JSON.stringify(parsed.metadata) : null,
    $createdAt: now,
    $updatedAt: now,
  })

  return {
    id,
    robotId: parsed.robotId,
    confidenceScore: parsed.confidenceScore,
    riskLevel: parsed.riskLevel,
    handoverStatus: handover,
    reasons: JSON.stringify(parsed.reasons),
    recommendations: JSON.stringify(autoRecs),
    sensorHealth: parsed.sensorHealth ? JSON.stringify(parsed.sensorHealth) : null,
    metadata: parsed.metadata ? JSON.stringify(parsed.metadata) : null,
    createdAt: now,
    updatedAt: now,
  }
}

export function getTrustScore(db: Database, robotId: string): TrustScore | null {
  const row = db
    .prepare('SELECT * FROM trust_scores WHERE robotId = ?')
    .get(robotId) as TrustRow | null
  return row ? rowToTrust(row) : null
}

export function listTrustScores(
  db: Database,
  filter?: TrustFilter
): { entries: TrustScore[]; total: number } {
  const parsed = TrustFilterSchema.parse(filter ?? {})
  const conditions: string[] = []
  const params: Record<string, string | number> = {}

  if (parsed.robotId) {
    conditions.push('robotId = $robotId')
    params.$robotId = parsed.robotId
  }
  if (parsed.riskLevel) {
    conditions.push('riskLevel = $riskLevel')
    params.$riskLevel = parsed.riskLevel
  }
  if (parsed.handoverStatus) {
    conditions.push('handoverStatus = $handoverStatus')
    params.$handoverStatus = parsed.handoverStatus
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM trust_scores ${where}`).get(params) as {
    cnt: number
  }

  params.$limit = parsed.limit
  params.$offset = parsed.offset

  const rows = db
    .prepare(
      `SELECT * FROM trust_scores ${where} ORDER BY updatedAt DESC LIMIT $limit OFFSET $offset`
    )
    .all(params) as TrustRow[]

  return { entries: rows.map(rowToTrust), total: countRow.cnt }
}

/**
 * Request handover — force a specific handover status for a robot.
 */
export function requestHandover(
  db: Database,
  robotId: string,
  status: HandoverStatus,
  reason: string
): TrustScore | null {
  const existing = getTrustScore(db, robotId)
  if (!existing) return null

  const now = new Date().toISOString()
  const reasons = [...JSON.parse(existing.reasons), reason]

  db.prepare(
    `UPDATE trust_scores SET
      handoverStatus = $handoverStatus,
      reasons = $reasons,
      updatedAt = $updatedAt
    WHERE robotId = $robotId`
  ).run({
    $robotId: robotId,
    $handoverStatus: status,
    $reasons: JSON.stringify(reasons),
    $updatedAt: now,
  })

  return getTrustScore(db, robotId)
}
