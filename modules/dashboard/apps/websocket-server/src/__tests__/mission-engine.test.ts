/**
 * Mission Engine Tests
 *
 * @see Issue #32 — T3.3 Mission Engine v1 BE
 */

import { Database } from 'bun:sqlite'
import {
  createMission,
  getMission,
  listMissions,
  updateMission,
  deleteMission,
  queueMission,
  dispatchMission,
  cancelMission,
  getNextQueued,
} from '../missions/model'
import { createMissionDb } from '../missions/db'

function makeDb(): Database {
  return createMissionDb(':memory:')
}

describe('Mission CRUD', () => {
  let db: Database
  beforeEach(() => {
    db = makeDb()
  })
  afterEach(() => {
    db.close()
  })

  it('creates a mission with defaults', () => {
    const m = createMission(db, { name: 'Patrol A' })
    expect(m.name).toBe('Patrol A')
    expect(m.type).toBe('patrol')
    expect(m.status).toBe('draft')
    expect(m.priority).toBe(5)
    expect(m.progress).toBe(0)
    expect(m.currentZone).toBeNull()
    expect(m.eta).toBeNull()
    expect(m.zoneSequence).toEqual([])
  })

  it('creates deliver mission with zone sequence', () => {
    const m = createMission(db, {
      name: 'Delivery Run',
      type: 'deliver',
      zoneSequence: ['zone-a', 'zone-b', 'zone-c'],
      priority: 2,
    })
    expect(m.type).toBe('deliver')
    expect(m.zoneSequence).toEqual(['zone-a', 'zone-b', 'zone-c'])
    expect(m.priority).toBe(2)
  })

  it('creates custom mission', () => {
    const m = createMission(db, { name: 'Custom Task', type: 'custom' })
    expect(m.type).toBe('custom')
  })

  it('gets mission by id', () => {
    const m = createMission(db, { name: 'Test' })
    const found = getMission(db, m.id)
    expect(found).not.toBeNull()
    expect(found!.name).toBe('Test')
  })

  it('lists missions with status filter', () => {
    createMission(db, { name: 'A' })
    const b = createMission(db, { name: 'B' })
    queueMission(db, b.id)

    expect(listMissions(db, { status: 'draft' })).toHaveLength(1)
    expect(listMissions(db, { status: 'queued' })).toHaveLength(1)
  })

  it('updates progress and currentZone', () => {
    const m = createMission(db, { name: 'Track Me', zoneSequence: ['z1', 'z2'] })
    const updated = updateMission(db, m.id, {
      progress: 50,
      currentZone: 'z1',
      eta: '2026-02-19T15:00:00Z',
    })
    expect(updated!.progress).toBe(50)
    expect(updated!.currentZone).toBe('z1')
    expect(updated!.eta).toBe('2026-02-19T15:00:00Z')
  })

  it('deletes a mission', () => {
    const m = createMission(db, { name: 'Delete Me' })
    expect(deleteMission(db, m.id)).toBe(true)
    expect(getMission(db, m.id)).toBeNull()
  })
})

describe('Mission Lifecycle', () => {
  let db: Database
  beforeEach(() => {
    db = makeDb()
  })
  afterEach(() => {
    db.close()
  })

  it('draft → queued → dispatched → in_progress → completed', () => {
    const m = createMission(db, { name: 'Full Lifecycle' })
    expect(m.status).toBe('draft')

    const queued = queueMission(db, m.id)
    expect(queued!.status).toBe('queued')

    const dispatched = dispatchMission(db, m.id)
    expect(dispatched!.status).toBe('dispatched')

    const inProgress = updateMission(db, m.id, { status: 'in_progress', progress: 25 })
    expect(inProgress!.status).toBe('in_progress')

    const completed = updateMission(db, m.id, { status: 'completed', progress: 100 })
    expect(completed!.status).toBe('completed')
  })

  it('cannot queue a non-draft mission', () => {
    const m = createMission(db, { name: 'Test' })
    queueMission(db, m.id) // draft→queued
    const result = queueMission(db, m.id) // queued→? should fail
    expect(result).toBeNull()
  })

  it('cannot dispatch a draft mission directly', () => {
    const m = createMission(db, { name: 'Test' })
    const result = dispatchMission(db, m.id) // draft, not queued
    expect(result).toBeNull()
  })

  it('cancels an in-progress mission', () => {
    const m = createMission(db, { name: 'Cancel Me' })
    queueMission(db, m.id)
    dispatchMission(db, m.id)
    updateMission(db, m.id, { status: 'in_progress' })

    const cancelled = cancelMission(db, m.id)
    expect(cancelled!.status).toBe('cancelled')
  })

  it('cannot cancel a completed mission', () => {
    const m = createMission(db, { name: 'Done' })
    updateMission(db, m.id, { status: 'completed' })
    expect(cancelMission(db, m.id)).toBeNull()
  })
})

describe('Mission Queue', () => {
  let db: Database
  beforeEach(() => {
    db = makeDb()
  })
  afterEach(() => {
    db.close()
  })

  it('getNextQueued returns highest priority (lowest number)', () => {
    const low = createMission(db, { name: 'Low Priority', priority: 8 })
    const high = createMission(db, { name: 'High Priority', priority: 1 })
    queueMission(db, low.id)
    queueMission(db, high.id)

    const next = getNextQueued(db)
    expect(next!.name).toBe('High Priority')
  })

  it('getNextQueued returns FIFO for same priority', () => {
    const first = createMission(db, { name: 'First' })
    const second = createMission(db, { name: 'Second' })
    queueMission(db, first.id)
    queueMission(db, second.id)

    const next = getNextQueued(db)
    expect(next!.name).toBe('First')
  })

  it('getNextQueued returns null when queue empty', () => {
    createMission(db, { name: 'Draft Only' }) // stays in draft
    expect(getNextQueued(db)).toBeNull()
  })
})
