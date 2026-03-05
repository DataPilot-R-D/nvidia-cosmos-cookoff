/**
 * Audit Log model — append-only CRUD operations.
 * Only INSERT and SELECT — no UPDATE or DELETE (immutable log).
 */
import { z } from 'zod'
import type { Database } from 'bun:sqlite'

// ── Schemas ──────────────────────────────────────────────

export const AuditAction = z.enum([
  'teleop',
  'nav_goal',
  'estop',
  'camera_control',
  'map_set_goal',
  'incident_manage',
  'settings_edit',
  'login',
  'logout',
  'policy_denied',
])
// eslint-disable-next-line no-redeclare
export type AuditAction = z.infer<typeof AuditAction>

export const AuditResult = z.enum(['ok', 'denied', 'error'])
// eslint-disable-next-line no-redeclare
export type AuditResult = z.infer<typeof AuditResult>

export const AppendAuditSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  userRole: z.string().default('unknown'),
  action: z.string().min(1, 'action is required'),
  params: z.record(z.unknown()).optional(),
  result: AuditResult.default('ok'),
  reason: z.string().optional(),
})
export type AppendAuditInput = z.infer<typeof AppendAuditSchema>

export const AuditFilterSchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  result: AuditResult.optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
})
export type AuditFilter = z.infer<typeof AuditFilterSchema>

export interface AuditEntry {
  id: number
  timestamp: string
  userId: string
  userRole: string
  action: string
  params: string | null
  result: string
  reason: string | null
}

// ── Operations ───────────────────────────────────────────

/**
 * Append a new audit log entry (append-only, no updates).
 */
export function appendAuditLog(db: Database, input: AppendAuditInput): AuditEntry {
  const parsed = AppendAuditSchema.parse(input)
  const now = new Date().toISOString()
  const paramsJson = parsed.params ? JSON.stringify(parsed.params) : null

  const stmt = db.prepare(
    `INSERT INTO audit_log (timestamp, userId, userRole, action, params, result, reason)
     VALUES ($timestamp, $userId, $userRole, $action, $params, $result, $reason)`
  )

  const info = stmt.run({
    $timestamp: now,
    $userId: parsed.userId,
    $userRole: parsed.userRole,
    $action: parsed.action,
    $params: paramsJson,
    $result: parsed.result,
    $reason: parsed.reason ?? null,
  })

  return {
    id: Number(info.lastInsertRowid),
    timestamp: now,
    userId: parsed.userId,
    userRole: parsed.userRole,
    action: parsed.action,
    params: paramsJson,
    result: parsed.result,
    reason: parsed.reason ?? null,
  }
}

/**
 * List audit log entries with filters and pagination.
 */
export function listAuditLog(
  db: Database,
  filter?: AuditFilter
): { entries: AuditEntry[]; total: number } {
  const parsed = AuditFilterSchema.parse(filter ?? {})
  const conditions: string[] = []
  const params: Record<string, string | number> = {}

  if (parsed.userId) {
    conditions.push('userId = $userId')
    params.$userId = parsed.userId
  }
  if (parsed.action) {
    conditions.push('action = $action')
    params.$action = parsed.action
  }
  if (parsed.result) {
    conditions.push('result = $result')
    params.$result = parsed.result
  }
  if (parsed.dateFrom) {
    conditions.push('timestamp >= $dateFrom')
    params.$dateFrom = parsed.dateFrom
  }
  if (parsed.dateTo) {
    conditions.push('timestamp <= $dateTo')
    params.$dateTo = parsed.dateTo
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM audit_log ${where}`).get(params) as {
    cnt: number
  }
  const total = countRow.cnt

  params.$limit = parsed.limit
  params.$offset = parsed.offset

  const entries = db
    .prepare(`SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT $limit OFFSET $offset`)
    .all(params) as AuditEntry[]

  return { entries, total }
}
