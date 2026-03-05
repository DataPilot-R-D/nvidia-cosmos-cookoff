import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Logger } from 'pino'

import {
  validateCameraSlug,
  type CameraSource,
  type CameraSourceType,
  type CameraStatus,
  type CreateCameraSourceRequest,
  type UpdateCameraSourceRequest,
  type CameraErrorCode,
} from './types'
import type { Go2RTCClient, Go2RTCStream } from '../services/go2rtc-client'

const CAMERA_SOURCE_TYPES: CameraSourceType[] = [
  'isaac-sim',
  'rtsp-physical',
  'usb',
  'webrtc',
  'test',
]
const CAMERA_PROTOCOLS = ['rtsp', 'http-mjpeg', 'webrtc', 'hls'] as const

const moduleDir = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(moduleDir, '../..')
const DEFAULT_DATA_FILE_PATH = resolve(appRoot, 'data/camera-sources.json')
const DEFAULT_HEALTHCHECK_INTERVAL_MS = 30_000

const DEFAULT_TEST_SOURCE: CreateCameraSourceRequest = {
  name: 'Test Pattern',
  slug: 'test.local.pattern',
  type: 'test',
  protocol: 'rtsp',
  url: 'rtsp://localhost:8554/test',
}

export class CameraSourceRegistryError extends Error {
  code: CameraErrorCode

  constructor(code: CameraErrorCode, message: string) {
    super(message)
    this.name = 'CameraSourceRegistryError'
    this.code = code
  }
}

export interface CameraSourceRegistryOptions {
  logger: Logger
  go2rtcClient?: Pick<Go2RTCClient, 'listStreams' | 'upsertStream'>
  dataFilePath?: string
  healthcheckIntervalMs?: number
  startHealthcheck?: boolean
}

export interface CameraSourceRegistry {
  list(filters?: { type?: CameraSourceType; status?: CameraStatus }): CameraSource[]
  get(id: string): CameraSource | null
  create(input: CreateCameraSourceRequest): Promise<CameraSource>
  update(id: string, patch: UpdateCameraSourceRequest): Promise<CameraSource | null>
  delete(id: string): boolean
  runHealthcheckOnce(): Promise<void>
  shutdown(): Promise<void>
}

function isValidType(type: string): type is CameraSourceType {
  return CAMERA_SOURCE_TYPES.includes(type as CameraSourceType)
}

function isValidProtocol(protocol: string): protocol is (typeof CAMERA_PROTOCOLS)[number] {
  return (CAMERA_PROTOCOLS as readonly string[]).includes(protocol)
}

function ensureValidUrl(url: string): void {
  try {
    const parsed = new URL(url)
    if (!parsed.protocol) {
      throw new Error('Missing protocol')
    }
  } catch {
    throw new CameraSourceRegistryError('INVALID_URL', 'Invalid camera source URL')
  }
}

function clone(source: CameraSource): CameraSource {
  return {
    ...source,
    metadata: {
      ...source.metadata,
      tags: source.metadata.tags ? [...source.metadata.tags] : undefined,
    },
  }
}

async function writeRegistryFile(filePath: string, values: CameraSource[]): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(values, null, 2)}\n`, 'utf-8')
}

async function readRegistryFile(filePath: string, logger: Logger): Promise<CameraSource[]> {
  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      logger.warn({ filePath }, 'Camera source registry file is not an array, resetting')
      return []
    }

    const sources: CameraSource[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const source = item as Partial<CameraSource>
      if (
        !source.id ||
        !source.name ||
        !source.slug ||
        !source.type ||
        !source.protocol ||
        !source.url
      ) {
        continue
      }
      if (!isValidType(source.type) || !isValidProtocol(source.protocol)) {
        continue
      }
      sources.push({
        id: source.id,
        name: source.name,
        slug: source.slug,
        type: source.type,
        protocol: source.protocol,
        url: source.url,
        go2rtcStreamId: source.go2rtcStreamId ?? null,
        status: source.status ?? 'unknown',
        lastSeen: source.lastSeen ?? null,
        metadata: source.metadata ?? {},
        createdAt: source.createdAt ?? Date.now(),
        updatedAt: source.updatedAt ?? Date.now(),
      })
    }

    return sources
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return []
    }

    logger.warn({ filePath, error }, 'Failed to read camera source registry file, resetting')
    return []
  }
}

export async function createCameraSourceRegistry(
  options: CameraSourceRegistryOptions
): Promise<CameraSourceRegistry> {
  const {
    logger,
    go2rtcClient,
    dataFilePath = DEFAULT_DATA_FILE_PATH,
    healthcheckIntervalMs = DEFAULT_HEALTHCHECK_INTERVAL_MS,
    startHealthcheck = true,
  } = options

  const sources = new Map<string, CameraSource>()

  function sortedValues(): CameraSource[] {
    return Array.from(sources.values()).sort((a, b) => a.createdAt - b.createdAt)
  }

  function list(filters?: { type?: CameraSourceType; status?: CameraStatus }): CameraSource[] {
    const values = sortedValues()
    return values
      .filter((item) => {
        if (filters?.type && item.type !== filters.type) return false
        if (filters?.status && item.status !== filters.status) return false
        return true
      })
      .map(clone)
  }

  function get(id: string): CameraSource | null {
    const source = sources.get(id)
    return source ? clone(source) : null
  }

  function findBySlug(slug: string, excludedId?: string): CameraSource | undefined {
    for (const source of sources.values()) {
      if (excludedId && source.id === excludedId) continue
      if (source.slug === slug) return source
    }
    return undefined
  }

  function validateSourceData(
    payload:
      | CreateCameraSourceRequest
      | (UpdateCameraSourceRequest & Pick<CameraSource, 'type' | 'protocol' | 'url' | 'slug'>)
  ): void {
    const slugError = validateCameraSlug(payload.slug)
    if (slugError) {
      throw new CameraSourceRegistryError('INVALID_SLUG', slugError)
    }

    if (!isValidType(payload.type)) {
      throw new CameraSourceRegistryError('INVALID_URL', 'Invalid camera type')
    }

    if (!isValidProtocol(payload.protocol)) {
      throw new CameraSourceRegistryError('INVALID_URL', 'Invalid camera protocol')
    }

    ensureValidUrl(payload.url)
  }

  async function persist(): Promise<void> {
    await writeRegistryFile(dataFilePath, sortedValues())
  }

  async function syncGo2RTC(source: CameraSource): Promise<void> {
    if (!source.go2rtcStreamId || !go2rtcClient) return

    try {
      await go2rtcClient.upsertStream(source.go2rtcStreamId, source.url)
    } catch (error) {
      logger.warn(
        { sourceId: source.id, streamId: source.go2rtcStreamId, error },
        'Failed to sync source with go2rtc'
      )
      throw new CameraSourceRegistryError('GO2RTC_UNREACHABLE', 'Failed to sync source with go2rtc')
    }
  }

  async function create(input: CreateCameraSourceRequest): Promise<CameraSource> {
    validateSourceData(input)

    if (findBySlug(input.slug)) {
      throw new CameraSourceRegistryError(
        'SLUG_CONFLICT',
        `Camera source slug already exists: ${input.slug}`
      )
    }

    const now = Date.now()
    const source: CameraSource = {
      id: crypto.randomUUID(),
      name: input.name,
      slug: input.slug,
      type: input.type,
      protocol: input.protocol,
      url: input.url,
      go2rtcStreamId: input.go2rtcStreamId ?? null,
      status: 'unknown',
      lastSeen: null,
      metadata: input.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    }

    await syncGo2RTC(source)
    sources.set(source.id, source)
    await persist()
    return clone(source)
  }

  async function update(
    id: string,
    patch: UpdateCameraSourceRequest
  ): Promise<CameraSource | null> {
    const existing = sources.get(id)
    if (!existing) {
      return null
    }

    const next: CameraSource = {
      ...existing,
      name: patch.name ?? existing.name,
      slug: patch.slug ?? existing.slug,
      type: patch.type ?? existing.type,
      protocol: patch.protocol ?? existing.protocol,
      url: patch.url ?? existing.url,
      go2rtcStreamId:
        patch.go2rtcStreamId === undefined ? existing.go2rtcStreamId : patch.go2rtcStreamId,
      metadata: patch.metadata ?? existing.metadata,
      updatedAt: Date.now(),
    }

    validateSourceData(next)

    const duplicate = findBySlug(next.slug, id)
    if (duplicate) {
      throw new CameraSourceRegistryError(
        'SLUG_CONFLICT',
        `Camera source slug already exists: ${next.slug}`
      )
    }

    await syncGo2RTC(next)
    sources.set(id, next)
    await persist()
    return clone(next)
  }

  function del(id: string): boolean {
    const removed = sources.delete(id)
    if (!removed) return false

    void persist().catch((error) => {
      logger.error({ error, id }, 'Failed to persist camera source delete')
    })
    return true
  }

  async function runHealthcheckOnce(): Promise<void> {
    if (!go2rtcClient) return

    let streams: Record<string, Go2RTCStream>
    try {
      streams = await go2rtcClient.listStreams()
    } catch (error) {
      let changed = false
      const now = Date.now()
      for (const source of sources.values()) {
        if (!source.go2rtcStreamId) continue
        if (source.status !== 'error') {
          source.status = 'error'
          source.updatedAt = now
          changed = true
        }
      }
      if (changed) {
        await persist()
      }

      logger.warn({ error }, 'go2rtc healthcheck failed')
      return
    }

    let changed = false
    const now = Date.now()
    for (const source of sources.values()) {
      if (!source.go2rtcStreamId) continue

      const stream = streams[source.go2rtcStreamId]
      const isOnline = Boolean(
        stream && Array.isArray(stream.producers) && stream.producers.length > 0
      )
      const nextStatus: CameraStatus = isOnline ? 'online' : 'offline'

      if (source.status !== nextStatus) {
        source.status = nextStatus
        source.updatedAt = now
        changed = true
      }

      if (isOnline) {
        source.lastSeen = now
        source.updatedAt = now
        changed = true
      }
    }

    if (changed) {
      await persist()
    }
  }

  const loadedSources = await readRegistryFile(dataFilePath, logger)
  for (const source of loadedSources) {
    sources.set(source.id, source)
  }

  if (sources.size === 0) {
    await create(DEFAULT_TEST_SOURCE)
  }

  let healthcheckTimer: ReturnType<typeof setInterval> | null = null

  if (startHealthcheck) {
    healthcheckTimer = setInterval(() => {
      void runHealthcheckOnce().catch((error) => {
        logger.warn({ error }, 'Camera source healthcheck iteration failed')
      })
    }, healthcheckIntervalMs)
  }

  async function shutdown(): Promise<void> {
    if (healthcheckTimer) {
      clearInterval(healthcheckTimer)
      healthcheckTimer = null
    }
  }

  return {
    list,
    get,
    create,
    update,
    delete: del,
    runHealthcheckOnce,
    shutdown,
  }
}
