/**
 * WebSocket Server for Security Robot Command Center
 *
 * This server acts as a bridge between:
 * - Web clients (Dashboard UI)
 * - ROS 2 Bridge (Robot communication)
 *
 * Uses Bun.serve() for high-performance HTTP + WebSocket handling.
 * Socket.IO is integrated via @socket.io/bun-engine for real-time messaging.
 */

import 'dotenv/config'
import { Server as Engine } from '@socket.io/bun-engine'
import type {
  BunWebSocket,
  WebSocketData,
  ServerOptions as EngineServerOptions,
} from '@socket.io/bun-engine'
import { Server as SocketIOServer } from 'socket.io'
import pino from 'pino'

import { registerCameraHandlers, createCameraRegistry, getKnownCameras } from './handlers/camera'
import { registerWebRTCHandlers, createWebRTCRegistry, initializeGo2RTC } from './handlers/webrtc'
import {
  createRosbridgeClient,
  registerRosbridgeHandlers,
  setCurrentRosbridgeClient,
  getCurrentRosbridgeUrl,
  getDiscoveredCameras,
} from './handlers/rosbridge'
import { startMachineStatsEmitter } from './handlers/machine-stats'
import * as mapStorage from './storage/map-storage'
import { getDb } from './incidents/db'
import { handleIncidentRoutes } from './incidents/routes'
import { getAuditDb } from './audit/db'
import { handleAuditRoutes } from './audit/routes'
import { checkPolicy, auditCommand } from './audit/policy'
import { getWorldDb } from './world-model/db'
import { handleWorldModelRoutes } from './world-model/routes'
import { getMissionDb } from './missions/db'
import { handleMissionRoutes } from './missions/routes'
import { getEvidenceDb } from './evidence/db'
import { handleEvidenceRoutes } from './evidence/routes'
import { getTrustDb } from './trust/db'
import { handleTrustRoutes } from './trust/routes'
import { getMapManagerService, registerMapManagerHandlers } from './services/map-manager.js'

// Logger setup
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
})

// Server configuration
const PORT = parseInt(process.env.PORT ?? '8081', 10)

// CORS
// WS_CORS_ORIGIN may be a single origin or a comma-separated allowlist.
const WS_CORS_ORIGIN_RAW = process.env.WS_CORS_ORIGIN ?? 'http://localhost:3001'
const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
]

const ALLOWED_CORS_ORIGINS = Array.from(
  new Set(
    WS_CORS_ORIGIN_RAW.split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .concat(DEFAULT_DEV_ORIGINS)
  )
)

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  return ALLOWED_CORS_ORIGINS.includes(origin)
}

function getCorsOriginForRequest(req: Request): string | null {
  const origin = req.headers.get('origin')
  if (isAllowedOrigin(origin)) return origin

  // Non-browser clients (curl, server-to-server) often have no Origin.
  // In that case we return the first configured origin (if any) to keep responses consistent.
  if (!origin && ALLOWED_CORS_ORIGINS.length > 0) return ALLOWED_CORS_ORIGINS[0]

  return null
}

function getCorsHeaders(req: Request): Record<string, string> {
  const allowOrigin = getCorsOriginForRequest(req)

  // NOTE: Browsers reject Access-Control-Allow-Origin with multiple values.
  // We must return a single matching origin (or omit the header).
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (allowOrigin) {
    headers['Access-Control-Allow-Origin'] = allowOrigin
    headers['Access-Control-Allow-Credentials'] = 'true'
    headers['Vary'] = 'Origin'
  }

  return headers
}

// ROSBridge URL - required for robot communication
const ROS_BRIDGE_URL = process.env.ROS_BRIDGE_URL
if (!ROS_BRIDGE_URL) {
  logger.warn(
    'ROS_BRIDGE_URL not set - ROSBridge connection will be disabled until configured via UI'
  )
}

// =============================================================================
// Socket.IO + Bun Engine Setup
// =============================================================================

// Socket.IO server setup
// NOTE: MessagePack parser temporarily disabled for Bun compatibility testing
type CorsCallback = (err: Error | null, allow?: boolean) => void
const corsOriginCallback = (origin: string | undefined, callback: CorsCallback): void => {
  // origin can be undefined (non-browser). Allow in that case.
  if (!origin) {
    callback(null, true)
    return
  }
  callback(null, isAllowedOrigin(origin))
}

const io = new SocketIOServer({
  cors: {
    origin: corsOriginCallback,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e7, // 10MB for large video frames
  // parser, // Disabled for testing
})

// Create Bun engine for Socket.IO with CORS support
const engine = new Engine({
  path: '/socket.io/',
  cors: {
    origin: corsOriginCallback as unknown as NonNullable<
      NonNullable<EngineServerOptions['cors']>['origin']
    >,
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

// Bind Socket.IO to Bun engine
io.bind(engine)

// Create registries for camera and WebRTC state
const cameraRegistry = createCameraRegistry()
const webrtcRegistry = createWebRTCRegistry(logger)

// Create map manager service
const mapManager = getMapManagerService(io, logger)

// Create rosbridge client (with optional URL)
let rosbridgeClient = createRosbridgeClient(io, logger, ROS_BRIDGE_URL || '')
setCurrentRosbridgeClient(rosbridgeClient, ROS_BRIDGE_URL || '')

// Function to reconnect to a new rosbridge URL
function reconnectRosbridge(newUrl: string): void {
  logger.info({ oldUrl: getCurrentRosbridgeUrl(), newUrl }, 'Reconnecting to new rosbridge URL')

  // Disconnect existing client
  const client = rosbridgeClient as ReturnType<typeof createRosbridgeClient> & {
    disconnect: () => void
  }
  client.disconnect()

  // Create new client with new URL
  rosbridgeClient = createRosbridgeClient(io, logger, newUrl)
  setCurrentRosbridgeClient(rosbridgeClient, newUrl)

  // Connect to new rosbridge
  const newClient = rosbridgeClient as ReturnType<typeof createRosbridgeClient> & {
    connect: () => void
  }
  newClient.connect()
}

// Connect to rosbridge and initialize go2rtc after IO is ready
setTimeout(async () => {
  // Initialize go2rtc (non-blocking, will fallback to legacy if unavailable)
  logger.info('Initializing go2rtc WebRTC server...')
  await initializeGo2RTC(webrtcRegistry, logger)

  // Start machine stats emitter (CPU, Memory, GPU, etc.)
  startMachineStatsEmitter(io, logger)

  // Connect to rosbridge (only if URL is configured)
  if (ROS_BRIDGE_URL) {
    logger.info({ url: ROS_BRIDGE_URL }, 'Initiating rosbridge connection')
    const client = rosbridgeClient as ReturnType<typeof createRosbridgeClient> & {
      connect: () => void
    }
    client.connect()
  } else {
    logger.info('Skipping rosbridge connection - configure via UI or set ROS_BRIDGE_URL env var')
  }
}, 1000)

// =============================================================================
// CORS Helper
// =============================================================================

function jsonResponse(req: Request, data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: getCorsHeaders(req),
  })
}

function errorResponse(req: Request, message: string, status = 500): Response {
  return Response.json(
    { error: message },
    {
      status,
      headers: getCorsHeaders(req),
    }
  )
}

function binaryResponse(
  req: Request,
  data: Buffer | Uint8Array,
  contentType: string,
  filename: string
): Response {
  return new Response(data, {
    status: 200,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

// =============================================================================
// HTTP Route Handlers
// =============================================================================

async function handleHealthCheck(req: Request): Promise<Response> {
  return jsonResponse(req, {
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime(),
    connectedClients: io.engine?.clientsCount ?? 0,
    runtime: 'bun',
  })
}

async function handleGetCameras(req: Request): Promise<Response> {
  const cameras = getKnownCameras(cameraRegistry)
  return jsonResponse(req, {
    cameras,
    count: cameras.length,
  })
}

async function handleListMaps(req: Request, url: URL): Promise<Response> {
  try {
    const robotId = url.searchParams.get('robotId') || undefined
    const maps = mapStorage.listMaps(robotId)
    return jsonResponse(req, { maps, count: maps.length })
  } catch (error) {
    logger.error({ error }, 'Failed to list maps')
    return errorResponse(req, 'Failed to list maps')
  }
}

async function handleGetMap(req: Request, id: string): Promise<Response> {
  try {
    const map = mapStorage.loadMap(id)
    if (!map) {
      return errorResponse(req, 'Map not found', 404)
    }
    return jsonResponse(req, map)
  } catch (error) {
    logger.error({ error }, 'Failed to load map')
    return errorResponse(req, 'Failed to load map')
  }
}

async function handleCreateMap(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as {
      name?: string
      width?: number
      height?: number
      resolution?: number
      originX?: number
      originY?: number
      frameId?: string
      data?: string
      robotId?: string
      exploredPercent?: number
    }

    const {
      name,
      width,
      height,
      resolution,
      originX,
      originY,
      frameId,
      data,
      robotId,
      exploredPercent,
    } = body

    if (!name || !data) {
      return errorResponse(req, 'Missing required fields: name, data', 400)
    }

    // saveMap is now async (generates thumbnail)
    const metadata = await mapStorage.saveMap({
      name,
      width: width || 0,
      height: height || 0,
      resolution: resolution || 0.05,
      originX: originX || 0,
      originY: originY || 0,
      frameId: frameId || 'map',
      data,
      robotId,
      exploredPercent,
    })

    logger.info({ mapId: metadata.id, name }, 'Map saved')
    return jsonResponse(req, metadata, 201)
  } catch (error) {
    logger.error({ error }, 'Failed to save map')
    return errorResponse(req, 'Failed to save map')
  }
}

async function handleGetThumbnail(req: Request, id: string): Promise<Response> {
  try {
    const maps = mapStorage.listMaps()
    const mapMeta = maps.find((m) => m.id === id)

    if (!mapMeta) {
      return errorResponse(req, 'Map not found', 404)
    }

    if (!mapMeta.thumbnail) {
      return errorResponse(req, 'Thumbnail not available', 404)
    }

    // Decode base64 thumbnail to binary
    const pngBuffer = Buffer.from(mapMeta.thumbnail, 'base64')

    return new Response(pngBuffer, {
      status: 200,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get thumbnail')
    return errorResponse(req, 'Failed to get thumbnail')
  }
}

async function handleDeleteMap(req: Request, id: string): Promise<Response> {
  try {
    const deleted = mapStorage.deleteMap(id)
    if (!deleted) {
      return errorResponse(req, 'Map not found', 404)
    }
    logger.info({ mapId: id }, 'Map deleted')
    return jsonResponse(req, { success: true })
  } catch (error) {
    logger.error({ error }, 'Failed to delete map')
    return errorResponse(req, 'Failed to delete map')
  }
}

async function handleExportPgm(req: Request, id: string): Promise<Response> {
  try {
    const map = mapStorage.loadMap(id)
    if (!map) {
      return errorResponse(req, 'Map not found', 404)
    }

    const pgmBuffer = mapStorage.convertToPgm(map)
    const filename = `${map.name.replace(/[^a-z0-9]/gi, '_')}.pgm`

    return binaryResponse(req, pgmBuffer, 'image/x-portable-graymap', filename)
  } catch (error) {
    logger.error({ error }, 'Failed to export map as PGM')
    return errorResponse(req, 'Failed to export map')
  }
}

async function handleExportYaml(req: Request, id: string): Promise<Response> {
  try {
    const map = mapStorage.loadMap(id)
    if (!map) {
      return errorResponse(req, 'Map not found', 404)
    }

    const pgmFilename = `${map.name.replace(/[^a-z0-9]/gi, '_')}.pgm`
    const yaml = mapStorage.generateYaml(map, pgmFilename)
    const filename = `${map.name.replace(/[^a-z0-9]/gi, '_')}.yaml`

    return binaryResponse(req, Buffer.from(yaml), 'text/yaml', filename)
  } catch (error) {
    logger.error({ error }, 'Failed to export map YAML')
    return errorResponse(req, 'Failed to export map YAML')
  }
}

// =============================================================================
// URL Pattern Matching Helpers
// =============================================================================

function extractMapId(pathname: string, prefix: string, suffix = ''): string | null {
  // Handle patterns like /api/maps/:id or /api/maps/:id/pgm
  const pattern = new RegExp(`^${prefix}/([^/]+)${suffix}$`)
  const match = pathname.match(pattern)
  return match ? match[1] : null
}

// =============================================================================
// Socket.IO Connection Handling
// =============================================================================

// Audit middleware: extract userId from handshake auth
io.use((socket, next) => {
  const auth = socket.handshake.auth as Record<string, unknown>
  ;(socket as unknown as { userId: string }).userId =
    typeof auth?.userId === 'string' && auth.userId ? auth.userId : 'anonymous'
  ;(socket as unknown as { userRole: string }).userRole =
    typeof auth?.userRole === 'string' && auth.userRole ? auth.userRole : 'unknown'
  next()
})

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Client connected')
  const userId = (socket as unknown as { userId: string }).userId
  const userRole = (socket as unknown as { userRole: string }).userRole

  // Register camera, WebRTC, rosbridge and map manager handlers
  registerCameraHandlers(io, socket, cameraRegistry, logger)
  registerWebRTCHandlers(io, socket, webrtcRegistry, logger)
  registerRosbridgeHandlers(io, socket, rosbridgeClient, logger)
  registerMapManagerHandlers(io, socket, mapManager, logger)

  // Send initial connection status
  socket.emit('connection', {
    type: 'connection',
    timestamp: Date.now(),
    data: {
      status: 'connected',
      clientId: socket.id,
      robotIds: [],
    },
  })

  // Send discovered cameras to new client
  const cameras = getDiscoveredCameras()
  if (cameras.length > 0) {
    logger.info({ cameraCount: cameras.length }, 'Sending discovered cameras to new client')
    for (const camera of cameras) {
      socket.emit('camera_discovered', {
        type: 'camera_discovered',
        timestamp: Date.now(),
        data: camera,
      })
    }
  }

  // Handle robot state updates (from ROS bridge)
  socket.on('robot_state', (data) => {
    logger.debug({ data }, 'Received robot state')
    socket.broadcast.emit('robot_state', data)
  })

  // Handle commands (from web clients) — with policy check + audit
  socket.on('command', (data: Record<string, unknown>) => {
    const rawType = typeof data?.type === 'string' ? data.type.trim() : ''
    if (!rawType) {
      socket.emit('command_denied', {
        type: 'command_denied',
        timestamp: Date.now(),
        data: { action: 'unknown', reason: 'Missing or empty command type' },
      })
      return
    }
    const action = rawType
    const auditDb = getAuditDb()
    const policy = checkPolicy(auditDb, userId, action, data)

    if (!policy.allowed) {
      logger.warn({ userId, action, reason: policy.reason }, 'Command denied by policy')
      socket.emit('command_denied', {
        type: 'command_denied',
        timestamp: Date.now(),
        data: { action, reason: policy.reason },
      })
      return
    }

    auditCommand(auditDb, userId, policy.user?.role ?? userRole, action, data)
    logger.info({ data, userId }, 'Received command')
    socket.broadcast.emit('command', data)
  })

  // Handle alerts — with RBAC + audit
  socket.on('alert', (data: Record<string, unknown>) => {
    const auditDb = getAuditDb()
    const policy = checkPolicy(auditDb, userId, 'alert', data)
    if (!policy.allowed) {
      logger.warn({ userId, reason: policy.reason }, 'Alert denied by policy')
      socket.emit('command_denied', {
        type: 'command_denied',
        timestamp: Date.now(),
        data: { action: 'alert', reason: policy.reason },
      })
      return
    }
    auditCommand(auditDb, userId, policy.user?.role ?? userRole, 'alert', data)
    logger.warn({ data, userId }, 'Received alert')
    io.emit('alert', data)
  })

  // Handle rosbridge URL change request — with RBAC + audit
  socket.on('set_rosbridge_url', (data: { url: string }) => {
    const auditDb = getAuditDb()
    const policy = checkPolicy(auditDb, userId, 'set_rosbridge_url', { url: data.url })
    if (!policy.allowed) {
      logger.warn({ userId, reason: policy.reason }, 'set_rosbridge_url denied by policy')
      socket.emit('command_denied', {
        type: 'command_denied',
        timestamp: Date.now(),
        data: { action: 'set_rosbridge_url', reason: policy.reason },
      })
      return
    }
    auditCommand(auditDb, userId, policy.user?.role ?? userRole, 'set_rosbridge_url', {
      url: data.url,
    })
    logger.info({ url: data.url, userId }, 'Client requested rosbridge URL change')
    if ((data.url && data.url.startsWith('ws://')) || data.url.startsWith('wss://')) {
      reconnectRosbridge(data.url)
      io.emit('rosbridge_status', {
        type: 'rosbridge_status',
        timestamp: Date.now(),
        data: { connected: false, url: data.url, reconnecting: true },
      })
    } else {
      socket.emit('rosbridge_error', {
        type: 'rosbridge_error',
        timestamp: Date.now(),
        data: { error: 'Invalid URL format. Must start with ws:// or wss://' },
      })
    }
  })

  // Handle get rosbridge URL request
  socket.on('get_rosbridge_url', () => {
    socket.emit('rosbridge_url', {
      type: 'rosbridge_url',
      timestamp: Date.now(),
      data: { url: getCurrentRosbridgeUrl() },
    })
  })

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    logger.info({ socketId: socket.id, reason }, 'Client disconnected')
  })

  // Handle errors
  socket.on('error', (error) => {
    logger.error({ socketId: socket.id, error }, 'Socket error')
  })
})

// =============================================================================
// Bun.serve() - Main Server
// =============================================================================

const server = Bun.serve<WebSocketData>({
  port: PORT,
  // idleTimeout must be > pingInterval (25s) to prevent premature disconnection
  idleTimeout: 30,

  // WebSocket handlers from @socket.io/bun-engine
  websocket: {
    open(ws: BunWebSocket) {
      engine.onWebSocketOpen(ws)
    },
    message(ws: BunWebSocket, message) {
      engine.onWebSocketMessage(ws, message)
    },
    close(ws: BunWebSocket, code, message) {
      engine.onWebSocketClose(ws, code, message)
    },
  },

  async fetch(req, server) {
    const url = new URL(req.url)
    const { pathname } = url
    const method = req.method

    // CORS preflight (must be before other handlers)
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...getCorsHeaders(req),
          'Access-Control-Max-Age': '86400',
        },
      })
    }

    // Socket.IO handling - add CORS headers to engine responses
    if (pathname.startsWith('/socket.io')) {
      const response = await engine.handleRequest(req, server)

      // If engine returns a Response, add CORS headers
      if (response instanceof Response) {
        // Clone headers and add CORS
        const newHeaders = new Headers(response.headers)
        const allowOrigin = getCorsOriginForRequest(req)
        if (allowOrigin) {
          newHeaders.set('Access-Control-Allow-Origin', allowOrigin)
          newHeaders.set('Vary', 'Origin')
          newHeaders.set('Access-Control-Allow-Credentials', 'true')
        }
        newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        newHeaders.set('Access-Control-Allow-Headers', 'Content-Type')

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        })
      }

      return response
    }

    // Health check
    if (pathname === '/health' && method === 'GET') {
      return handleHealthCheck(req)
    }

    // Camera API
    if (pathname === '/api/cameras' && method === 'GET') {
      return handleGetCameras(req)
    }

    // Maps API
    if (pathname === '/api/maps' && method === 'GET') {
      return handleListMaps(req, url)
    }

    if (pathname === '/api/maps' && method === 'POST') {
      return handleCreateMap(req)
    }

    // /api/maps/:id/thumbnail
    const thumbnailId = extractMapId(pathname, '/api/maps', '/thumbnail')
    if (thumbnailId && method === 'GET') {
      return handleGetThumbnail(req, thumbnailId)
    }

    // /api/maps/:id/pgm
    const pgmId = extractMapId(pathname, '/api/maps', '/pgm')
    if (pgmId && method === 'GET') {
      return handleExportPgm(req, pgmId)
    }

    // /api/maps/:id/yaml
    const yamlId = extractMapId(pathname, '/api/maps', '/yaml')
    if (yamlId && method === 'GET') {
      return handleExportYaml(req, yamlId)
    }

    // /api/maps/:id
    const mapId = extractMapId(pathname, '/api/maps', '')
    if (mapId) {
      if (method === 'GET') {
        return handleGetMap(req, mapId)
      }
      if (method === 'DELETE') {
        return handleDeleteMap(req, mapId)
      }
    }

    // Incident API
    if (pathname.startsWith('/api/incidents')) {
      const incidentDb = getDb()
      const incidentResponse = handleIncidentRoutes(req, pathname, incidentDb)
      if (incidentResponse) {
        // handleIncidentRoutes may return a Promise<Response>
        const resolved = await incidentResponse
        // Add CORS headers
        const corsHeaders = getCorsHeaders(req)
        for (const [k, v] of Object.entries(corsHeaders)) {
          resolved.headers.set(k, v)
        }
        return resolved
      }
    }

    // Audit API
    if (pathname === '/api/audit') {
      const auditDb = getAuditDb()
      const auditResponse = handleAuditRoutes(req, pathname, auditDb)
      if (auditResponse) {
        const corsHeaders = getCorsHeaders(req)
        for (const [k, v] of Object.entries(corsHeaders)) {
          auditResponse.headers.set(k, v)
        }
        return auditResponse
      }
    }

    // World Model API (zones + assets)
    if (pathname.startsWith('/api/zones') || pathname.startsWith('/api/assets')) {
      const worldDb = getWorldDb()
      const worldResponse = handleWorldModelRoutes(req, pathname, worldDb)
      if (worldResponse) {
        const resolved = await worldResponse
        const corsHeaders = getCorsHeaders(req)
        for (const [k, v] of Object.entries(corsHeaders)) {
          resolved.headers.set(k, v)
        }
        return resolved
      }
    }

    // Mission API
    if (pathname.startsWith('/api/missions')) {
      const missionDb = getMissionDb()
      const missionResponse = handleMissionRoutes(req, pathname, missionDb)
      if (missionResponse) {
        const resolved = await missionResponse
        const corsHeaders = getCorsHeaders(req)
        for (const [k, v] of Object.entries(corsHeaders)) {
          resolved.headers.set(k, v)
        }
        return resolved
      }
    }

    // ── Evidence API ──────────────────────────────────────
    if (pathname.startsWith('/api/evidence')) {
      const evidenceDb = getEvidenceDb()
      const evidenceResponse = handleEvidenceRoutes(req, pathname, evidenceDb)
      if (evidenceResponse) {
        const resolved = await evidenceResponse
        const corsHeaders = getCorsHeaders(req)
        for (const [k, v] of Object.entries(corsHeaders)) {
          resolved.headers.set(k, v)
        }
        return resolved
      }
    }

    // ── Trust API ─────────────────────────────────────────
    if (pathname.startsWith('/api/trust')) {
      const trustDb = getTrustDb()
      const trustResponse = handleTrustRoutes(req, pathname, trustDb)
      if (trustResponse) {
        const resolved = await trustResponse
        const corsHeaders = getCorsHeaders(req)
        for (const [k, v] of Object.entries(corsHeaders)) {
          resolved.headers.set(k, v)
        }
        return resolved
      }
    }

    // 404 Not Found
    return errorResponse(req, 'Not Found', 404)
  },
})

logger.info(
  { port: PORT, corsAllowlist: ALLOWED_CORS_ORIGINS, runtime: 'bun' },
  'Bun server started'
)

// =============================================================================
// Graceful Shutdown
// =============================================================================

const shutdown = () => {
  logger.info('Shutting down server...')
  server.stop()
  io.close(() => {
    logger.info('Server shut down complete')
    process.exit(0)
  })
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
