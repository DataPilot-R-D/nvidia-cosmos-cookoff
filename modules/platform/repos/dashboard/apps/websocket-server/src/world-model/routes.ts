/**
 * World Model REST API route handlers.
 * Handles /api/zones and /api/assets.
 */
import type { Database } from 'bun:sqlite'
import {
  createZone,
  getZone,
  listZones,
  updateZone,
  deleteZone,
  createAsset,
  getAsset,
  listAssets,
  updateAsset,
  deleteAsset,
  CreateZoneSchema,
  UpdateZoneSchema,
  CreateAssetSchema,
  UpdateAssetSchema,
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
 * Handle /api/zones and /api/assets routes.
 */
export function handleWorldModelRoutes(
  req: Request,
  pathname: string,
  db: Database
): Response | Promise<Response> | null {
  const method = req.method

  // ── Zones ────────────────────────────────────────────
  if (pathname === '/api/zones' && method === 'GET') {
    return json(listZones(db))
  }
  if (pathname === '/api/zones' && method === 'POST') {
    return handleCreateZone(req, db)
  }

  const zoneMatch = pathname.match(/^\/api\/zones\/([a-f0-9-]+)$/)
  if (zoneMatch) {
    const id = zoneMatch[1]!
    if (method === 'GET') {
      const zone = getZone(db, id)
      return zone ? json(zone) : errorJson('Zone not found', 404)
    }
    if (method === 'PATCH') return handleUpdateZone(req, id, db)
    if (method === 'DELETE') {
      return deleteZone(db, id) ? json({ ok: true }) : errorJson('Zone not found', 404)
    }
  }

  // ── Assets ───────────────────────────────────────────
  if (pathname === '/api/assets' && method === 'GET') {
    const url = new URL(req.url)
    const zoneId = url.searchParams.get('zoneId') ?? undefined
    return json(listAssets(db, zoneId))
  }
  if (pathname === '/api/assets' && method === 'POST') {
    return handleCreateAsset(req, db)
  }

  const assetMatch = pathname.match(/^\/api\/assets\/([a-f0-9-]+)$/)
  if (assetMatch) {
    const id = assetMatch[1]!
    if (method === 'GET') {
      const asset = getAsset(db, id)
      return asset ? json(asset) : errorJson('Asset not found', 404)
    }
    if (method === 'PATCH') return handleUpdateAsset(req, id, db)
    if (method === 'DELETE') {
      return deleteAsset(db, id) ? json({ ok: true }) : errorJson('Asset not found', 404)
    }
  }

  return null
}

async function handleCreateZone(req: Request, db: Database): Promise<Response> {
  try {
    const body = await req.json()
    const parsed = CreateZoneSchema.safeParse(body)
    if (!parsed.success) return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
    return json(createZone(db, parsed.data), 201)
  } catch {
    return errorJson('Invalid JSON body', 400)
  }
}

async function handleUpdateZone(req: Request, id: string, db: Database): Promise<Response> {
  try {
    const body = await req.json()
    const parsed = UpdateZoneSchema.safeParse(body)
    if (!parsed.success) return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
    const zone = updateZone(db, id, parsed.data)
    return zone ? json(zone) : errorJson('Zone not found', 404)
  } catch {
    return errorJson('Invalid JSON body', 400)
  }
}

async function handleCreateAsset(req: Request, db: Database): Promise<Response> {
  try {
    const body = await req.json()
    const parsed = CreateAssetSchema.safeParse(body)
    if (!parsed.success) return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
    return json(createAsset(db, parsed.data), 201)
  } catch {
    return errorJson('Invalid JSON body', 400)
  }
}

async function handleUpdateAsset(req: Request, id: string, db: Database): Promise<Response> {
  try {
    const body = await req.json()
    const parsed = UpdateAssetSchema.safeParse(body)
    if (!parsed.success) return errorJson(parsed.error.issues.map((i) => i.message).join('; '), 400)
    const asset = updateAsset(db, id, parsed.data)
    return asset ? json(asset) : errorJson('Asset not found', 404)
  } catch {
    return errorJson('Invalid JSON body', 400)
  }
}
