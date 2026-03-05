import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { handleIncidentRoutes } from '../incidents/routes'
import { createIncident } from '../incidents/model'

let db: Database

function initTestDb(): Database {
  const d = new Database(':memory:')
  d.exec(`
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'New' CHECK(status IN ('New', 'Ack', 'Closed')),
      severity TEXT NOT NULL DEFAULT 'Low' CHECK(severity IN ('Low', 'Medium', 'High', 'Critical')),
      cameraSourceId TEXT,
      robotId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)
  return d
}

function makeReq(method: string, path: string, body?: unknown): Request {
  const opts: globalThis.RequestInit = { method }
  if (body) {
    opts.body = JSON.stringify(body)
    opts.headers = { 'Content-Type': 'application/json' }
  }
  return new Request(`http://localhost:8081${path}`, opts)
}

async function resolveResponse(r: Response | Promise<Response> | null): Promise<Response> {
  if (!r) throw new Error('No response')
  return r instanceof Promise ? await r : r
}

beforeEach(() => {
  db = initTestDb()
})
afterEach(() => {
  db.close()
})

describe('Incident API routes', () => {
  it('POST /api/incidents creates incident', async () => {
    const req = makeReq('POST', '/api/incidents', { title: 'Test fire', severity: 'High' })
    const res = await resolveResponse(handleIncidentRoutes(req, '/api/incidents', db))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.title).toBe('Test fire')
    expect(data.severity).toBe('High')
    expect(data.id).toBeDefined()
  })

  it('POST /api/incidents rejects empty title', async () => {
    const req = makeReq('POST', '/api/incidents', { title: '' })
    const res = await resolveResponse(handleIncidentRoutes(req, '/api/incidents', db))
    expect(res.status).toBe(400)
  })

  it('POST /api/incidents rejects invalid JSON', async () => {
    const req = new Request('http://localhost:8081/api/incidents', {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await resolveResponse(handleIncidentRoutes(req, '/api/incidents', db))
    expect(res.status).toBe(400)
  })

  it('GET /api/incidents returns list', async () => {
    createIncident(db, { title: 'A' })
    createIncident(db, { title: 'B' })
    const req = makeReq('GET', '/api/incidents')
    const res = await resolveResponse(handleIncidentRoutes(req, '/api/incidents', db))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveLength(2)
  })

  it('GET /api/incidents filters by status', async () => {
    createIncident(db, { title: 'A', status: 'New' })
    createIncident(db, { title: 'B', status: 'Closed' })
    const req = makeReq('GET', '/api/incidents?status=Closed')
    const res = await resolveResponse(handleIncidentRoutes(req, '/api/incidents', db))
    const data = await res.json()
    expect(data).toHaveLength(1)
    expect(data[0].status).toBe('Closed')
  })

  it('GET /api/incidents rejects invalid filter', async () => {
    const req = makeReq('GET', '/api/incidents?status=Invalid')
    const res = await resolveResponse(handleIncidentRoutes(req, '/api/incidents', db))
    expect(res.status).toBe(400)
  })

  it('GET /api/incidents/:id returns single', async () => {
    const inc = createIncident(db, { title: 'X' })
    const req = makeReq('GET', `/api/incidents/${inc.id}`)
    const res = await resolveResponse(handleIncidentRoutes(req, `/api/incidents/${inc.id}`, db))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe(inc.id)
  })

  it('GET /api/incidents/:id returns 404', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const req = makeReq('GET', `/api/incidents/${fakeId}`)
    const res = await resolveResponse(handleIncidentRoutes(req, `/api/incidents/${fakeId}`, db))
    expect(res.status).toBe(404)
  })

  it('PATCH /api/incidents/:id updates', async () => {
    const inc = createIncident(db, { title: 'Y', status: 'New' })
    const req = makeReq('PATCH', `/api/incidents/${inc.id}`, { status: 'Ack' })
    const res = await resolveResponse(handleIncidentRoutes(req, `/api/incidents/${inc.id}`, db))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.status).toBe('Ack')
  })

  it('PATCH /api/incidents/:id returns 404 for missing', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const req = makeReq('PATCH', `/api/incidents/${fakeId}`, { status: 'Ack' })
    const res = await resolveResponse(handleIncidentRoutes(req, `/api/incidents/${fakeId}`, db))
    expect(res.status).toBe(404)
  })

  it('returns null for unmatched routes', () => {
    const req = makeReq('GET', '/api/other')
    const res = handleIncidentRoutes(req, '/api/other', db)
    expect(res).toBeNull()
  })
})
