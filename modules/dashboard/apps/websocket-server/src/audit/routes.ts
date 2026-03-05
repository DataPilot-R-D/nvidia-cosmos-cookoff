/**
 * Audit Log REST API route handlers.
 * GET /api/audit — list with filters (userId, action, dateFrom, dateTo, limit, offset)
 */
import type { Database } from 'bun:sqlite'
import { listAuditLog, AuditFilterSchema } from './model'

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorJson(message: string, status: number): Response {
  return json({ error: message }, status)
}

/**
 * Handle audit API routes. Returns Response if matched, null otherwise.
 */
export function handleAuditRoutes(req: Request, pathname: string, db: Database): Response | null {
  if (pathname !== '/api/audit' || req.method !== 'GET') return null

  const url = new URL(req.url)
  const filterInput: Record<string, string> = {}
  for (const key of ['userId', 'action', 'result', 'dateFrom', 'dateTo', 'limit', 'offset']) {
    const val = url.searchParams.get(key)
    if (val) filterInput[key] = val
  }

  const parsed = AuditFilterSchema.safeParse(filterInput)
  if (!parsed.success) {
    return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
  }

  const result = listAuditLog(db, parsed.data)
  return json(result)
}
