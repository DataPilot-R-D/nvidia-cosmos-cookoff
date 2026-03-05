/**
 * Incident REST API route handlers.
 * Designed to plug into the Bun.serve() fetch handler.
 */
import type { Database } from 'bun:sqlite'
import {
  createIncident,
  getIncident,
  listIncidents,
  updateIncident,
  CreateIncidentSchema,
  UpdateIncidentSchema,
  IncidentFilterSchema,
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
 * Handle incident API routes. Returns Response | Promise<Response> if matched, null otherwise.
 */
export function handleIncidentRoutes(
  req: Request,
  pathname: string,
  db: Database
): Response | Promise<Response> | null {
  const method = req.method

  // POST /api/incidents
  if (pathname === '/api/incidents' && method === 'POST') {
    return handleCreate(req, db)
  }

  // GET /api/incidents
  if (pathname === '/api/incidents' && method === 'GET') {
    return handleList(req, db)
  }

  // GET /api/incidents/:id
  const idMatch = pathname.match(/^\/api\/incidents\/([a-f0-9-]+)$/)
  if (idMatch && method === 'GET') {
    return handleGet(idMatch[1]!, db)
  }

  // PATCH /api/incidents/:id
  if (idMatch && method === 'PATCH') {
    return handleUpdate(req, idMatch[1]!, db)
  }

  return null
}

async function handleCreate(req: Request, db: Database): Promise<Response> {
  try {
    const body = await req.json()
    const parsed = CreateIncidentSchema.safeParse(body)
    if (!parsed.success) {
      return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
    }
    const incident = createIncident(db, parsed.data)
    return json(incident, 201)
  } catch {
    return errorJson('Invalid JSON body', 400)
  }
}

function handleList(req: Request, db: Database): Response {
  const url = new URL(req.url)
  const filterInput: Record<string, string> = {}
  for (const key of ['status', 'severity', 'robotId', 'cameraSourceId']) {
    const val = url.searchParams.get(key)
    if (val) filterInput[key] = val
  }
  const parsed = IncidentFilterSchema.safeParse(filterInput)
  if (!parsed.success) {
    return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
  }
  const incidents = listIncidents(db, parsed.data)
  return json(incidents)
}

function handleGet(id: string, db: Database): Response {
  const incident = getIncident(db, id)
  if (!incident) return errorJson('Incident not found', 404)
  return json(incident)
}

async function handleUpdate(req: Request, id: string, db: Database): Promise<Response> {
  try {
    const body = await req.json()
    const parsed = UpdateIncidentSchema.safeParse(body)
    if (!parsed.success) {
      return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
    }
    const incident = updateIncident(db, id, parsed.data)
    if (!incident) return errorJson('Incident not found', 404)
    return json(incident)
  } catch {
    return errorJson('Invalid JSON body', 400)
  }
}
