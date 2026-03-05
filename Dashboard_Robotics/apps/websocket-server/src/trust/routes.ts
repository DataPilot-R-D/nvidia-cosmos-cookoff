/**
 * Trust Layer REST API route handlers.
 */
import type { Database } from 'bun:sqlite'
import {
  upsertTrustScore,
  getTrustScore,
  listTrustScores,
  requestHandover,
  getCategoryScores,
  createOverride,
  listOverrides,
  CreateOverrideSchema,
  UpdateTrustSchema,
  TrustFilterSchema,
  HandoverStatus,
} from './model'

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
 * Handle trust API routes. Returns Response | Promise<Response> if matched, null otherwise.
 */
export function handleTrustRoutes(
  req: Request,
  pathname: string,
  db: Database
): Response | Promise<Response> | null {
  const method = req.method

  // PUT /api/trust — upsert trust score
  if (pathname === '/api/trust' && method === 'PUT') {
    return handleUpsert(req, db)
  }

  // GET /api/trust — list all trust scores
  if (pathname === '/api/trust' && method === 'GET') {
    return handleList(req, db)
  }

  // GET /api/trust/:robotId — get trust score for robot
  const robotMatch = pathname.match(/^\/api\/trust\/([^/]+)$/)
  if (robotMatch && method === 'GET') {
    return handleGet(robotMatch[1]!, db)
  }

  // GET /api/trust/:robotId/categories — category scores
  const catMatch = pathname.match(/^\/api\/trust\/([^/]+)\/categories$/)
  if (catMatch && method === 'GET') {
    return json(getCategoryScores(db, catMatch[1]!))
  }

  // POST /api/trust/:robotId/override — operator override
  const overrideMatch = pathname.match(/^\/api\/trust\/([^/]+)\/override$/)
  if (overrideMatch && method === 'POST') {
    return handleOverride(req, overrideMatch[1]!, db)
  }

  // GET /api/trust/:robotId/overrides — override history
  const overridesMatch = pathname.match(/^\/api\/trust\/([^/]+)\/overrides$/)
  if (overridesMatch && method === 'GET') {
    return json(listOverrides(db, overridesMatch[1]!))
  }

  // POST /api/trust/:robotId/handover — request handover
  const handoverMatch = pathname.match(/^\/api\/trust\/([^/]+)\/handover$/)
  if (handoverMatch && method === 'POST') {
    return handleHandover(req, handoverMatch[1]!, db)
  }

  return null
}

async function handleUpsert(req: Request, db: Database): Promise<Response> {
  try {
    const body = await req.json()
    const parsed = UpdateTrustSchema.safeParse(body)
    if (!parsed.success) {
      return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
    }
    const score = upsertTrustScore(db, parsed.data)
    return json(score)
  } catch {
    return errorJson('Invalid JSON body', 400)
  }
}

function handleList(req: Request, db: Database): Response {
  const url = new URL(req.url)
  const filterInput: Record<string, string> = {}
  for (const key of ['robotId', 'riskLevel', 'handoverStatus', 'limit', 'offset']) {
    const val = url.searchParams.get(key)
    if (val) filterInput[key] = val
  }
  const parsed = TrustFilterSchema.safeParse(filterInput)
  if (!parsed.success) {
    return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
  }
  return json(listTrustScores(db, parsed.data))
}

function handleGet(robotId: string, db: Database): Response {
  const score = getTrustScore(db, robotId)
  if (!score) return errorJson('Trust score not found', 404)
  return json(score)
}

async function handleOverride(req: Request, robotId: string, db: Database): Promise<Response> {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const parsed = CreateOverrideSchema.safeParse({ ...body, robotId })
    if (!parsed.success) {
      return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
    }
    const override = createOverride(db, parsed.data)
    return json(override, 201)
  } catch {
    return errorJson('Invalid JSON body', 400)
  }
}

async function handleHandover(req: Request, robotId: string, db: Database): Promise<Response> {
  try {
    const body = (await req.json()) as Record<string, unknown>
    const status = HandoverStatus.safeParse(body?.status)
    if (!status.success) {
      return errorJson('Invalid handover status', 400)
    }
    const reason = typeof body?.reason === 'string' ? body.reason : 'Operator requested handover'
    const score = requestHandover(db, robotId, status.data, reason)
    if (!score) return errorJson('Robot trust score not found', 404)
    return json(score)
  } catch {
    return errorJson('Invalid JSON body', 400)
  }
}
