import {
  type CameraSourceType,
  type CameraStatus,
  type CreateCameraSourceRequest,
  type UpdateCameraSourceRequest,
} from './types'
import { CameraSourceRegistryError, type CameraSourceRegistry } from './registry'

const CAMERA_SOURCE_TYPES: CameraSourceType[] = [
  'isaac-sim',
  'rtsp-physical',
  'usb',
  'webrtc',
  'test',
]
const CAMERA_STATUSES: CameraStatus[] = ['online', 'offline', 'error', 'unknown']

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorJson(message: string, status: number): Response {
  return json({ error: message }, status)
}

function parseFilterType(value: string | null): CameraSourceType | undefined {
  if (!value) return undefined
  return CAMERA_SOURCE_TYPES.includes(value as CameraSourceType)
    ? (value as CameraSourceType)
    : undefined
}

function parseFilterStatus(value: string | null): CameraStatus | undefined {
  if (!value) return undefined
  return CAMERA_STATUSES.includes(value as CameraStatus) ? (value as CameraStatus) : undefined
}

function mapRegistryError(error: unknown): Response {
  if (error instanceof CameraSourceRegistryError) {
    if (error.code === 'SLUG_CONFLICT') return errorJson(error.message, 409)
    if (error.code === 'INVALID_SLUG' || error.code === 'INVALID_URL')
      return errorJson(error.message, 400)
    if (error.code === 'CAMERA_NOT_FOUND') return errorJson(error.message, 404)
    return errorJson(error.message, 500)
  }

  return errorJson('Internal server error', 500)
}

export function handleCameraSourceRoutes(
  req: Request,
  pathname: string,
  registry: CameraSourceRegistry
): Response | Promise<Response> | null {
  const method = req.method

  if (pathname === '/api/cameras/sources' && method === 'GET') {
    const url = new URL(req.url)
    const typeRaw = url.searchParams.get('type')
    const statusRaw = url.searchParams.get('status')

    const type = parseFilterType(typeRaw)
    const status = parseFilterStatus(statusRaw)

    if (typeRaw && !type) {
      return errorJson('Invalid type filter', 400)
    }
    if (statusRaw && !status) {
      return errorJson('Invalid status filter', 400)
    }

    const sources = registry.list({ type, status })
    return json({ sources, total: sources.length })
  }

  if (pathname === '/api/cameras/sources' && method === 'POST') {
    return handleCreate(req, registry)
  }

  const idMatch = pathname.match(/^\/api\/cameras\/sources\/([^/]+)$/)
  if (idMatch && method === 'GET') {
    const source = registry.get(idMatch[1]!)
    if (!source) {
      return errorJson('Camera source not found', 404)
    }
    return json(source)
  }

  if (idMatch && method === 'PATCH') {
    return handleUpdate(req, idMatch[1]!, registry)
  }

  if (idMatch && method === 'DELETE') {
    const deleted = registry.delete(idMatch[1]!)
    if (!deleted) {
      return errorJson('Camera source not found', 404)
    }

    return new Response(null, { status: 204 })
  }

  return null
}

async function handleCreate(req: Request, registry: CameraSourceRegistry): Promise<Response> {
  try {
    const body = (await req.json()) as CreateCameraSourceRequest
    const created = await registry.create(body)
    return json(created, 201)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorJson('Invalid JSON body', 400)
    }
    return mapRegistryError(error)
  }
}

async function handleUpdate(
  req: Request,
  id: string,
  registry: CameraSourceRegistry
): Promise<Response> {
  try {
    const body = (await req.json()) as UpdateCameraSourceRequest
    const updated = await registry.update(id, body)
    if (!updated) {
      return errorJson('Camera source not found', 404)
    }
    return json(updated)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return errorJson('Invalid JSON body', 400)
    }
    return mapRegistryError(error)
  }
}
