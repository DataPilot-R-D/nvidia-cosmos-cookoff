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
// ── Category Scoring ─────────────────────────────────────

export type TrustCategory = 'navigation' | 'manipulation' | 'perception'

export const TrustCategorySchema = z.enum(['navigation', 'manipulation', 'perception'])

export interface TrustFactor {
  name: string
  weight: number // 0-1
  value: number // 0-100
}

export interface CategoryScore {
  id: string
  robotId: string
  category: TrustCategory
  score: number
  factors: TrustFactor[]
  updatedAt: string
}

interface CategoryRow {
  id: string
  robotId: string
  category: string
  score: number
  factors: string
  updatedAt: string
}

/**
 * Compute weighted score from factors.
 */
export function computeWeightedScore(factors: TrustFactor[]): number {
  if (factors.length === 0) return 50
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0)
  if (totalWeight === 0) return 50
  const weighted = factors.reduce((sum, f) => sum + f.weight * f.value, 0)
  return Math.round((weighted / totalWeight) * 100) / 100
}

/**
 * Upsert category score with weighted factors.
 */
export function upsertCategoryScore(
  db: Database,
  robotId: string,
  category: TrustCategory,
  factors: TrustFactor[]
): CategoryScore {
  const score = computeWeightedScore(factors)
  const now = new Date().toISOString()

  const existing = db
    .prepare('SELECT id FROM trust_category_scores WHERE robotId = ? AND category = ?')
    .get(robotId, category) as { id: string } | null

  if (existing) {
    db.prepare(
      `UPDATE trust_category_scores SET score = $score, factors = $factors, updatedAt = $updatedAt
       WHERE robotId = $robotId AND category = $category`
    ).run({
      $robotId: robotId,
      $category: category,
      $score: score,
      $factors: JSON.stringify(factors),
      $updatedAt: now,
    })
    return { id: existing.id, robotId, category, score, factors, updatedAt: now }
  }

  const id = randomUUID()
  db.prepare(
    `INSERT INTO trust_category_scores (id, robotId, category, score, factors, updatedAt)
     VALUES ($id, $robotId, $category, $score, $factors, $updatedAt)`
  ).run({
    $id: id,
    $robotId: robotId,
    $category: category,
    $score: score,
    $factors: JSON.stringify(factors),
    $updatedAt: now,
  })
  return { id, robotId, category, score, factors, updatedAt: now }
}

export function getCategoryScores(db: Database, robotId: string): CategoryScore[] {
  const rows = db
    .prepare('SELECT * FROM trust_category_scores WHERE robotId = ? ORDER BY category')
    .all(robotId) as CategoryRow[]
  return rows.map((r) => ({
    ...r,
    category: r.category as TrustCategory,
    factors: JSON.parse(r.factors) as TrustFactor[],
  }))
}

// ── Thresholds ───────────────────────────────────────────

export interface TrustThresholds {
  green: number // >= this = green
  yellow: number // >= this = yellow
  // < yellow = red
}

export const DEFAULT_THRESHOLDS: TrustThresholds = { green: 80, yellow: 50 }

export function scoreToLevel(
  score: number,
  thresholds: TrustThresholds = DEFAULT_THRESHOLDS
): 'green' | 'yellow' | 'red' {
  if (score >= thresholds.green) return 'green'
  if (score >= thresholds.yellow) return 'yellow'
  return 'red'
}

// ── Operator Override ────────────────────────────────────

export interface TrustOverride {
  id: string
  robotId: string
  category: string | null
  previousScore: number
  overrideScore: number
  reason: string
  operatorId: string
  expiresAt: string | null
  active: boolean
  createdAt: string
}

export const CreateOverrideSchema = z.object({
  robotId: z.string().min(1),
  category: TrustCategorySchema.nullable().optional(),
  overrideScore: z.number().min(0).max(100),
  reason: z.string().min(1),
  operatorId: z.string().min(1),
  expiresAt: z.string().nullable().optional(),
})
export type CreateOverrideInput = z.infer<typeof CreateOverrideSchema>

export function createOverride(db: Database, input: CreateOverrideInput): TrustOverride {
  const parsed = CreateOverrideSchema.parse(input)
  const now = new Date().toISOString()
  const id = randomUUID()

  // Get previous score
  let previousScore = 50
  if (parsed.category) {
    const cat = db
      .prepare('SELECT score FROM trust_category_scores WHERE robotId = ? AND category = ?')
      .get(parsed.robotId, parsed.category) as { score: number } | null
    if (cat) previousScore = cat.score
  } else {
    const trust = getTrustScore(db, parsed.robotId)
    if (trust) previousScore = trust.confidenceScore
  }

  // Deactivate previous overrides for same robot+category
  db.prepare(
    `UPDATE trust_overrides SET active = 0 WHERE robotId = ? AND category ${parsed.category ? '= ?' : 'IS NULL'} AND active = 1`
  ).run(...[parsed.robotId, ...(parsed.category ? [parsed.category] : [])])

  db.prepare(
    `INSERT INTO trust_overrides (id, robotId, category, previousScore, overrideScore, reason, operatorId, expiresAt, active, createdAt)
     VALUES ($id, $robotId, $category, $previousScore, $overrideScore, $reason, $operatorId, $expiresAt, 1, $createdAt)`
  ).run({
    $id: id,
    $robotId: parsed.robotId,
    $category: parsed.category ?? null,
    $previousScore: previousScore,
    $overrideScore: parsed.overrideScore,
    $reason: parsed.reason,
    $operatorId: parsed.operatorId,
    $expiresAt: parsed.expiresAt ?? null,
    $createdAt: now,
  })

  // Apply override to score
  if (parsed.category) {
    db.prepare(
      `UPDATE trust_category_scores SET score = ?, updatedAt = ? WHERE robotId = ? AND category = ?`
    ).run(parsed.overrideScore, now, parsed.robotId, parsed.category)
  } else {
    db.prepare(`UPDATE trust_scores SET confidenceScore = ?, updatedAt = ? WHERE robotId = ?`).run(
      parsed.overrideScore,
      now,
      parsed.robotId
    )
  }

  return {
    id,
    robotId: parsed.robotId,
    category: parsed.category ?? null,
    previousScore,
    overrideScore: parsed.overrideScore,
    reason: parsed.reason,
    operatorId: parsed.operatorId,
    expiresAt: parsed.expiresAt ?? null,
    active: true,
    createdAt: now,
  }
}

export function listOverrides(db: Database, robotId: string): TrustOverride[] {
  const rows = db
    .prepare('SELECT * FROM trust_overrides WHERE robotId = ? ORDER BY createdAt DESC')
    .all(robotId) as Array<Omit<TrustOverride, 'active'> & { active: number }>
  return rows.map((r) => ({ ...r, active: r.active === 1 }))
}

// ── Auto-Decay ───────────────────────────────────────────

const DECAY_RATE = 0.02 // 2% toward neutral per call
const NEUTRAL_SCORE = 50

/**
 * Decay a score toward neutral (50). Call periodically.
 */
export function decayScore(current: number, rate: number = DECAY_RATE): number {
  const diff = NEUTRAL_SCORE - current
  return Math.round((current + diff * rate) * 100) / 100
}

/**
 * Apply decay to all category scores for a robot.
 */
export function applyDecay(db: Database, robotId: string): void {
  const categories = getCategoryScores(db, robotId)
  const now = new Date().toISOString()
  for (const cat of categories) {
    // Skip if there's an active, non-expired override
    const activeOverride = db
      .prepare(
        'SELECT id FROM trust_overrides WHERE robotId = ? AND category = ? AND active = 1 AND (expiresAt IS NULL OR expiresAt > ?)'
      )
      .get(robotId, cat.category, now) as { id: string } | null
    if (activeOverride) continue

    const decayed = decayScore(cat.score)
    db.prepare('UPDATE trust_category_scores SET score = ?, updatedAt = ? WHERE id = ?').run(
      decayed,
      now,
      cat.id
    )
  }
}

// ── Existing: requestHandover ────────────────────────────

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
