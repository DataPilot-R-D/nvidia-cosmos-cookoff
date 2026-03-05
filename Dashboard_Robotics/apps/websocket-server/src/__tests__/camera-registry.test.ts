import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rm } from 'node:fs/promises'

import type { CameraSource } from '../camera/types'
import { createCameraSourceRegistry } from '../camera/registry'
import { handleCameraSourceRoutes } from '../camera/routes'

interface MockLogger {
  info: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  debug: ReturnType<typeof vi.fn>
}

interface MockGo2RTCClient {
  upsertStream: ReturnType<typeof vi.fn>
  listStreams: ReturnType<typeof vi.fn>
}

function createMockLogger(): MockLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}

function createMockGo2RTCClient(): MockGo2RTCClient {
  return {
    upsertStream: vi.fn().mockResolvedValue(undefined),
    listStreams: vi.fn().mockResolvedValue({}),
  }
}

function makeReq(method: string, path: string, body?: unknown): Request {
  const opts: globalThis.RequestInit = { method }
  if (body !== undefined) {
    opts.body = JSON.stringify(body)
    opts.headers = { 'Content-Type': 'application/json' }
  }
  return new Request(`http://localhost:8081${path}`, opts)
}

async function resolveResponse(r: Response | Promise<Response> | null): Promise<Response> {
  if (!r) throw new Error('No response')
  return r instanceof Promise ? await r : r
}

describe('Camera Source Registry', () => {
  let tempFile: string
  let logger: MockLogger
  let go2rtcClient: MockGo2RTCClient

  beforeEach(async () => {
    logger = createMockLogger()
    go2rtcClient = createMockGo2RTCClient()
    tempFile = `/tmp/camera-sources-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await rm(tempFile, { force: true })
  })

  it('seeds default test source on init when empty', async () => {
    const registry = await createCameraSourceRegistry({
      logger,
      go2rtcClient,
      dataFilePath: tempFile,
      healthcheckIntervalMs: 1000,
      startHealthcheck: false,
    })

    const sources = registry.list()
    expect(sources).toHaveLength(1)
    expect(sources[0]?.name).toBe('Test Pattern')
    expect(sources[0]?.slug).toBe('test.local.pattern')
    await registry.shutdown()
  })

  it('supports create/get/update/delete operations', async () => {
    const registry = await createCameraSourceRegistry({
      logger,
      go2rtcClient,
      dataFilePath: tempFile,
      startHealthcheck: false,
    })

    const created = await registry.create({
      name: 'Dock Camera',
      slug: 'rtsp.dock.front',
      type: 'rtsp-physical',
      protocol: 'rtsp',
      url: 'rtsp://localhost:8554/dock',
      go2rtcStreamId: 'dock_front',
    })

    const found = registry.get(created.id)
    expect(found?.name).toBe('Dock Camera')

    const updated = await registry.update(created.id, {
      name: 'Dock Camera Updated',
      url: 'rtsp://localhost:8554/dock-new',
    })

    expect(updated?.name).toBe('Dock Camera Updated')

    const deleted = registry.delete(created.id)
    expect(deleted).toBe(true)
    expect(registry.get(created.id)).toBeNull()

    await registry.shutdown()
  })

  it('rejects invalid slug values', async () => {
    const registry = await createCameraSourceRegistry({
      logger,
      go2rtcClient,
      dataFilePath: tempFile,
      startHealthcheck: false,
    })

    await expect(
      registry.create({
        name: 'Invalid Camera',
        slug: 'INVALID SLUG',
        type: 'rtsp-physical',
        protocol: 'rtsp',
        url: 'rtsp://localhost:8554/invalid',
      })
    ).rejects.toMatchObject({ code: 'INVALID_SLUG' })

    await registry.shutdown()
  })

  it('rejects duplicate slug values', async () => {
    const registry = await createCameraSourceRegistry({
      logger,
      go2rtcClient,
      dataFilePath: tempFile,
      startHealthcheck: false,
    })

    await registry.create({
      name: 'Cam One',
      slug: 'rtsp.room.one',
      type: 'rtsp-physical',
      protocol: 'rtsp',
      url: 'rtsp://localhost:8554/one',
    })

    await expect(
      registry.create({
        name: 'Cam Two',
        slug: 'rtsp.room.one',
        type: 'rtsp-physical',
        protocol: 'rtsp',
        url: 'rtsp://localhost:8554/two',
      })
    ).rejects.toMatchObject({ code: 'SLUG_CONFLICT' })

    await registry.shutdown()
  })

  it('updates status with healthcheck transitions', async () => {
    const registry = await createCameraSourceRegistry({
      logger,
      go2rtcClient,
      dataFilePath: tempFile,
      startHealthcheck: false,
    })

    const source = await registry.create({
      name: 'Health Camera',
      slug: 'rtsp.health.cam',
      type: 'rtsp-physical',
      protocol: 'rtsp',
      url: 'rtsp://localhost:8554/health',
      go2rtcStreamId: 'health_cam',
    })

    go2rtcClient.listStreams.mockResolvedValueOnce({})
    await registry.runHealthcheckOnce()
    expect(registry.get(source.id)?.status).toBe('offline')

    go2rtcClient.listStreams.mockResolvedValueOnce({
      health_cam: {
        name: 'health_cam',
        producers: [{ url: 'rtsp://localhost:8554/health', medias: ['video'] }],
        consumers: [],
      },
    })
    await registry.runHealthcheckOnce()
    const afterOnline = registry.get(source.id) as CameraSource
    expect(afterOnline.status).toBe('online')
    expect(afterOnline.lastSeen).not.toBeNull()

    await registry.shutdown()
  })
})

describe('Camera Source Routes', () => {
  let tempFile: string
  let logger: MockLogger
  let go2rtcClient: MockGo2RTCClient

  beforeEach(async () => {
    logger = createMockLogger()
    go2rtcClient = createMockGo2RTCClient()
    tempFile = `/tmp/camera-sources-routes-${Date.now()}-${Math.random().toString(16).slice(2)}.json`
  })

  afterEach(async () => {
    vi.clearAllMocks()
    await rm(tempFile, { force: true })
  })

  it('returns 409 for duplicate slug on POST', async () => {
    const registry = await createCameraSourceRegistry({
      logger,
      go2rtcClient,
      dataFilePath: tempFile,
      startHealthcheck: false,
    })

    const firstReq = makeReq('POST', '/api/cameras/sources', {
      name: 'Cam One',
      slug: 'rtsp.entry.one',
      type: 'rtsp-physical',
      protocol: 'rtsp',
      url: 'rtsp://localhost:8554/one',
    })

    const firstRes = await resolveResponse(
      handleCameraSourceRoutes(firstReq, '/api/cameras/sources', registry)
    )
    expect(firstRes.status).toBe(201)

    const duplicateReq = makeReq('POST', '/api/cameras/sources', {
      name: 'Cam Two',
      slug: 'rtsp.entry.one',
      type: 'rtsp-physical',
      protocol: 'rtsp',
      url: 'rtsp://localhost:8554/two',
    })

    const duplicateRes = await resolveResponse(
      handleCameraSourceRoutes(duplicateReq, '/api/cameras/sources', registry)
    )
    expect(duplicateRes.status).toBe(409)

    await registry.shutdown()
  })

  it('supports list and delete routes', async () => {
    const registry = await createCameraSourceRegistry({
      logger,
      go2rtcClient,
      dataFilePath: tempFile,
      startHealthcheck: false,
    })

    const created = await registry.create({
      name: 'Route Camera',
      slug: 'rtsp.route.camera',
      type: 'rtsp-physical',
      protocol: 'rtsp',
      url: 'rtsp://localhost:8554/route',
    })

    const listReq = makeReq('GET', '/api/cameras/sources?type=rtsp-physical')
    const listRes = await resolveResponse(
      handleCameraSourceRoutes(listReq, '/api/cameras/sources', registry)
    )
    expect(listRes.status).toBe(200)

    const listData = (await listRes.json()) as { sources: CameraSource[] }
    expect(listData.sources.some((src) => src.id === created.id)).toBe(true)

    const deleteReq = makeReq('DELETE', `/api/cameras/sources/${created.id}`)
    const deleteRes = await resolveResponse(
      handleCameraSourceRoutes(deleteReq, `/api/cameras/sources/${created.id}`, registry)
    )
    expect(deleteRes.status).toBe(204)

    await registry.shutdown()
  })
})
