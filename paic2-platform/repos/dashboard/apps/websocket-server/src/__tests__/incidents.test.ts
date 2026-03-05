import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  createIncident,
  getIncident,
  listIncidents,
  updateIncident,
  deleteIncident,
  type CreateIncidentInput,
} from '../incidents/model'

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

beforeEach(() => {
  db = initTestDb()
})
afterEach(() => {
  db.close()
})

describe('Incident model', () => {
  const validInput: CreateIncidentInput = {
    title: 'Fire detected',
    description: 'Smoke in sector 7',
    severity: 'High',
  }

  it('creates an incident with defaults', () => {
    const inc = createIncident(db, { title: 'Test' })
    expect(inc.id).toBeDefined()
    expect(inc.title).toBe('Test')
    expect(inc.status).toBe('New')
    expect(inc.severity).toBe('Low')
    expect(inc.description).toBe('')
    expect(inc.cameraSourceId).toBeNull()
    expect(inc.robotId).toBeNull()
    expect(inc.createdAt).toBeDefined()
  })

  it('creates an incident with all fields', () => {
    const inc = createIncident(db, {
      ...validInput,
      cameraSourceId: 'cam-1',
      robotId: 'robot-a',
      status: 'Ack',
    })
    expect(inc.title).toBe('Fire detected')
    expect(inc.severity).toBe('High')
    expect(inc.status).toBe('Ack')
    expect(inc.cameraSourceId).toBe('cam-1')
    expect(inc.robotId).toBe('robot-a')
  })

  it('rejects invalid status', () => {
    expect(() => createIncident(db, { title: 'X', status: 'Invalid' as any })).toThrow()
  })

  it('rejects empty title', () => {
    expect(() => createIncident(db, { title: '' })).toThrow()
  })

  it('gets incident by id', () => {
    const created = createIncident(db, validInput)
    const found = getIncident(db, created.id)
    expect(found).toEqual(created)
  })

  it('returns null for missing id', () => {
    expect(getIncident(db, 'nonexistent')).toBeNull()
  })

  it('lists all incidents', () => {
    createIncident(db, { title: 'A' })
    createIncident(db, { title: 'B' })
    const all = listIncidents(db)
    expect(all).toHaveLength(2)
  })

  it('filters by status', () => {
    createIncident(db, { title: 'A', status: 'New' })
    createIncident(db, { title: 'B', status: 'Closed' })
    const newOnly = listIncidents(db, { status: 'New' })
    expect(newOnly).toHaveLength(1)
    expect(newOnly[0]!.title).toBe('A')
  })

  it('filters by robotId', () => {
    createIncident(db, { title: 'A', robotId: 'r1' })
    createIncident(db, { title: 'B', robotId: 'r2' })
    const r1 = listIncidents(db, { robotId: 'r1' })
    expect(r1).toHaveLength(1)
    expect(r1[0]!.robotId).toBe('r1')
  })

  it('filters by multiple criteria', () => {
    createIncident(db, { title: 'A', status: 'New', severity: 'High' })
    createIncident(db, { title: 'B', status: 'New', severity: 'Low' })
    createIncident(db, { title: 'C', status: 'Closed', severity: 'High' })
    const result = listIncidents(db, { status: 'New', severity: 'High' })
    expect(result).toHaveLength(1)
    expect(result[0]!.title).toBe('A')
  })

  it('updates status', async () => {
    const inc = createIncident(db, validInput)
    await new Promise((r) => setTimeout(r, 5))
    const updated = updateIncident(db, inc.id, { status: 'Closed' })
    expect(updated!.status).toBe('Closed')
    expect(updated!.updatedAt).not.toBe(inc.updatedAt)
  })

  it('updates severity', () => {
    const inc = createIncident(db, validInput)
    const updated = updateIncident(db, inc.id, { severity: 'Critical' })
    expect(updated!.severity).toBe('Critical')
  })

  it('returns null when updating nonexistent', () => {
    expect(updateIncident(db, 'nope', { status: 'Ack' })).toBeNull()
  })

  it('deletes an incident', () => {
    const inc = createIncident(db, validInput)
    expect(deleteIncident(db, inc.id)).toBe(true)
    expect(getIncident(db, inc.id)).toBeNull()
  })

  it('returns false when deleting nonexistent', () => {
    expect(deleteIncident(db, 'nope')).toBe(false)
  })
})
