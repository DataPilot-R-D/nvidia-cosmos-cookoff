/**
 * Evidence model unit tests.
 * Uses bun:test + bun:sqlite (same pattern as incidents/missions tests).
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  createEvidence,
  getEvidence,
  listEvidence,
  updateEvidence,
  deleteEvidence,
} from '../evidence/model'

let db: Database

function initTestDb(): Database {
  const d = new Database(':memory:')
  d.exec('PRAGMA foreign_keys = ON')
  d.exec(`
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK(type IN ('video_clip', 'snapshot', 'sensor_log', 'audit_entry', 'note')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      incidentId TEXT,
      missionId TEXT,
      robotId TEXT,
      cameraSourceId TEXT,
      capturedAt TEXT NOT NULL,
      mediaUrl TEXT,
      startOffset REAL,
      endOffset REAL,
      metadata TEXT,
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

describe('Evidence CRUD', () => {
  test('creates evidence with required fields', () => {
    const e = createEvidence(db, {
      type: 'video_clip',
      title: 'Camera 1 recording',
    })

    expect(e.id).toBeTruthy()
    expect(e.type).toBe('video_clip')
    expect(e.title).toBe('Camera 1 recording')
    expect(e.description).toBe('')
    expect(e.incidentId).toBeNull()
    expect(e.missionId).toBeNull()
    expect(e.createdAt).toBeTruthy()
  })

  test('creates evidence with all fields', () => {
    const e = createEvidence(db, {
      type: 'snapshot',
      title: 'Alert frame',
      description: 'Suspicious movement detected',
      incidentId: 'inc-1',
      missionId: 'mis-1',
      robotId: 'robot-1',
      cameraSourceId: 'cam-front',
      capturedAt: '2026-02-11T00:00:00Z',
      mediaUrl: 'rtsp://192.168.1.10/stream1',
      startOffset: 10.5,
      endOffset: 25.0,
      metadata: { confidence: 0.95, zone: 'entrance' },
    })

    expect(e.type).toBe('snapshot')
    expect(e.incidentId).toBe('inc-1')
    expect(e.missionId).toBe('mis-1')
    expect(e.mediaUrl).toBe('rtsp://192.168.1.10/stream1')
    expect(e.startOffset).toBe(10.5)
    expect(e.endOffset).toBe(25.0)
    expect(e.metadata).toBeTruthy()
    const meta = JSON.parse(e.metadata!)
    expect(meta.confidence).toBe(0.95)
  })

  test('gets evidence by id', () => {
    const created = createEvidence(db, { type: 'note', title: 'Test note' })
    const found = getEvidence(db, created.id)
    expect(found).not.toBeNull()
    expect(found!.title).toBe('Test note')
  })

  test('returns null for nonexistent id', () => {
    const found = getEvidence(db, 'nonexistent')
    expect(found).toBeNull()
  })

  test('lists evidence with pagination', () => {
    for (let i = 0; i < 5; i++) {
      createEvidence(db, { type: 'note', title: `Note ${i}` })
    }

    const { entries, total } = listEvidence(db, { limit: 2, offset: 0 })
    expect(total).toBe(5)
    expect(entries.length).toBe(2)
  })

  test('filters by type', () => {
    createEvidence(db, { type: 'video_clip', title: 'Vid' })
    createEvidence(db, { type: 'note', title: 'Note' })

    const { entries, total } = listEvidence(db, { type: 'video_clip' })
    expect(total).toBe(1)
    expect(entries[0]!.type).toBe('video_clip')
  })

  test('filters by incidentId', () => {
    createEvidence(db, { type: 'note', title: 'A', incidentId: 'inc-1' })
    createEvidence(db, { type: 'note', title: 'B', incidentId: 'inc-2' })

    const { entries } = listEvidence(db, { incidentId: 'inc-1' })
    expect(entries.length).toBe(1)
    expect(entries[0]!.title).toBe('A')
  })

  test('filters by missionId', () => {
    createEvidence(db, { type: 'note', title: 'A', missionId: 'mis-1' })
    createEvidence(db, { type: 'note', title: 'B' })

    const { entries } = listEvidence(db, { missionId: 'mis-1' })
    expect(entries.length).toBe(1)
  })

  test('filters by date range', () => {
    createEvidence(db, {
      type: 'note',
      title: 'Old',
      capturedAt: '2026-01-01T00:00:00Z',
    })
    createEvidence(db, {
      type: 'note',
      title: 'New',
      capturedAt: '2026-02-11T00:00:00Z',
    })

    const { entries } = listEvidence(db, { fromDate: '2026-02-01T00:00:00Z' })
    expect(entries.length).toBe(1)
    expect(entries[0]!.title).toBe('New')
  })

  test('updates evidence', () => {
    const e = createEvidence(db, { type: 'note', title: 'Original' })
    const updated = updateEvidence(db, e.id, {
      title: 'Updated',
      incidentId: 'inc-99',
    })

    expect(updated).not.toBeNull()
    expect(updated!.title).toBe('Updated')
    expect(updated!.incidentId).toBe('inc-99')
    expect(updated!.updatedAt).not.toBe(e.updatedAt)
  })

  test('updates metadata', () => {
    const e = createEvidence(db, { type: 'note', title: 'Test' })
    const updated = updateEvidence(db, e.id, {
      metadata: { score: 42 },
    })

    expect(updated).not.toBeNull()
    const meta = JSON.parse(updated!.metadata!)
    expect(meta.score).toBe(42)
  })

  test('update returns null for nonexistent id', () => {
    const result = updateEvidence(db, 'nonexistent', { title: 'New' })
    expect(result).toBeNull()
  })

  test('deletes evidence', () => {
    const e = createEvidence(db, { type: 'note', title: 'To delete' })
    const deleted = deleteEvidence(db, e.id)
    expect(deleted).toBe(true)

    const found = getEvidence(db, e.id)
    expect(found).toBeNull()
  })

  test('delete returns false for nonexistent id', () => {
    const deleted = deleteEvidence(db, 'nonexistent')
    expect(deleted).toBe(false)
  })

  test('rejects invalid type', () => {
    expect(() => {
      createEvidence(db, { type: 'invalid' as never, title: 'Bad' })
    }).toThrow()
  })
})
