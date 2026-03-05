/**
 * Mission Engine REST API route handlers.
 * Handles /api/missions.
 */
import type { Database } from 'bun:sqlite'
import {
  createMission,
  getMission,
  listMissions,
  updateMission,
  deleteMission,
  dispatchMission,
  queueMission,
  cancelMission,
  getNextQueued,
  CreateMissionSchema,
  UpdateMissionSchema,
  MissionStatusSchema,
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
 * Handle /api/missions routes.
 */
export function handleMissionRoutes(
  req: Request,
  pathname: string,
  db: Database
): Response | Promise<Response> | null {
  const method = req.method

  if (pathname === '/api/missions' && method === 'GET') {
    const url = new URL(req.url)
    const rawStatus = url.searchParams.get('status') ?? undefined
    const robotId = url.searchParams.get('robotId') ?? undefined
    if (rawStatus) {
      const parsed = MissionStatusSchema.safeParse(rawStatus)
      if (!parsed.success) return errorJson(`Invalid status: ${rawStatus}`, 400)
    }
    return json(listMissions(db, { status: rawStatus, robotId }))
  }

  if (pathname === '/api/missions' && method === 'POST') {
    return handleCreate(req, db)
  }

  // POST /api/missions/next — get next queued mission
  if (pathname === '/api/missions/next' && method === 'GET') {
    const next = getNextQueued(db)
    return next ? json(next) : json(null)
  }

  // POST /api/missions/:id/queue
  const queueMatch = pathname.match(/^\/api\/missions\/([a-f0-9-]+)\/queue$/)
  if (queueMatch && method === 'POST') {
    const mission = queueMission(db, queueMatch[1]!)
    if (!mission) return errorJson('Mission not found or not in draft status', 400)
    return json(mission)
  }

  // POST /api/missions/:id/dispatch
  const dispatchMatch = pathname.match(/^\/api\/missions\/([a-f0-9-]+)\/dispatch$/)
  if (dispatchMatch && method === 'POST') {
    const mission = dispatchMission(db, dispatchMatch[1]!)
    if (!mission) return errorJson('Mission not found or not in queued/pending status', 400)
    return json(mission)
  }

  // POST /api/missions/:id/cancel
  const cancelMatch = pathname.match(/^\/api\/missions\/([a-f0-9-]+)\/cancel$/)
  if (cancelMatch && method === 'POST') {
    const mission = cancelMission(db, cancelMatch[1]!)
    if (!mission) return errorJson('Mission not found or already in terminal status', 400)
    return json(mission)
  }

  const idMatch = pathname.match(/^\/api\/missions\/([a-f0-9-]+)$/)
  if (idMatch) {
    const id = idMatch[1]!
    if (method === 'GET') {
      const mission = getMission(db, id)
      return mission ? json(mission) : errorJson('Mission not found', 404)
    }
    if (method === 'PATCH') return handleUpdate(req, id, db)
    if (method === 'DELETE') {
      return deleteMission(db, id) ? json({ ok: true }) : errorJson('Mission not found', 404)
    }
  }

  return null
}

async function handleCreate(req: Request, db: Database): Promise<Response> {
  try {
    const body = await req.json()
    const parsed = CreateMissionSchema.safeParse(body)
    if (!parsed.success) return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
    return json(createMission(db, parsed.data), 201)
  } catch {
    return errorJson('Invalid JSON body', 400)
  }
}

async function handleUpdate(req: Request, id: string, db: Database): Promise<Response> {
  try {
    const body = await req.json()
    const parsed = UpdateMissionSchema.safeParse(body)
    if (!parsed.success) return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
    const mission = updateMission(db, id, parsed.data)
    return mission ? json(mission) : errorJson('Mission not found', 404)
  } catch {
    return errorJson('Invalid JSON body', 400)
  }
}
