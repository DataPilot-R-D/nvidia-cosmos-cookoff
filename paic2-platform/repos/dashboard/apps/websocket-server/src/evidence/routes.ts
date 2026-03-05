/**
 * Evidence REST API route handlers.
 * Designed to plug into the Bun.serve() fetch handler.
 */
import type { Database } from 'bun:sqlite'
import {
  createEvidence,
  getEvidence,
  listEvidence,
  updateEvidence,
  deleteEvidence,
  CreateEvidenceSchema,
  UpdateEvidenceSchema,
  EvidenceFilterSchema,
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
 * Handle evidence API routes. Returns Response | Promise<Response> if matched, null otherwise.
 */
export function handleEvidenceRoutes(
  req: Request,
  pathname: string,
  db: Database
): Response | Promise<Response> | null {
  const method = req.method

  // POST /api/evidence
  if (pathname === '/api/evidence' && method === 'POST') {
    return handleCreate(req, db)
  }

  // GET /api/evidence
  if (pathname === '/api/evidence' && method === 'GET') {
    return handleList(req, db)
  }

  // GET /api/evidence/:id
  const idMatch = pathname.match(/^\/api\/evidence\/([a-f0-9-]+)$/)
  if (idMatch && method === 'GET') {
    return handleGet(idMatch[1]!, db)
  }

  // PATCH /api/evidence/:id
  if (idMatch && method === 'PATCH') {
    return handleUpdate(req, idMatch[1]!, db)
  }

  // DELETE /api/evidence/:id
  if (idMatch && method === 'DELETE') {
    return handleDelete(idMatch[1]!, db)
  }

  return null
}

async function handleCreate(req: Request, db: Database): Promise<Response> {
  try {
    const body = await req.json()
    const parsed = CreateEvidenceSchema.safeParse(body)
    if (!parsed.success) {
      return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
    }
    const evidence = createEvidence(db, parsed.data)
    return json(evidence, 201)
  } catch {
    return errorJson('Invalid JSON body', 400)
  }
}

function handleList(req: Request, db: Database): Response {
  const url = new URL(req.url)
  const filterInput: Record<string, string> = {}
  for (const key of [
    'type',
    'incidentId',
    'missionId',
    'robotId',
    'cameraSourceId',
    'fromDate',
    'toDate',
    'limit',
    'offset',
  ]) {
    const val = url.searchParams.get(key)
    if (val) filterInput[key] = val
  }
  const parsed = EvidenceFilterSchema.safeParse(filterInput)
  if (!parsed.success) {
    return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
  }
  const result = listEvidence(db, parsed.data)
  return json(result)
}

function handleGet(id: string, db: Database): Response {
  const evidence = getEvidence(db, id)
  if (!evidence) return errorJson('Evidence not found', 404)
  return json(evidence)
}

async function handleUpdate(req: Request, id: string, db: Database): Promise<Response> {
  try {
    const body = await req.json()
    const parsed = UpdateEvidenceSchema.safeParse(body)
    if (!parsed.success) {
      return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
    }
    const evidence = updateEvidence(db, id, parsed.data)
    if (!evidence) return errorJson('Evidence not found', 404)
    return json(evidence)
  } catch {
    return errorJson('Invalid JSON body', 400)
  }
}

function handleDelete(id: string, db: Database): Response {
  const deleted = deleteEvidence(db, id)
  if (!deleted) return errorJson('Evidence not found', 404)
  return json({ ok: true })
}
