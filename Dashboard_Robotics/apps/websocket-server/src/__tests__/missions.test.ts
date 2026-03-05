/**
 * Mission Engine — unit tests.
 * TDD: RED → GREEN → IMPROVE
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { createMissionDb, resetMissionDb } from '../missions/db'
import {
  createMission,
  getMission,
  listMissions,
  updateMission,
  deleteMission,
  dispatchMission,
  queueMission,
} from '../missions/model'
import type { Database } from 'bun:sqlite'

let db: Database

beforeEach(() => {
  resetMissionDb()
  db = createMissionDb(':memory:')
})

afterEach(() => {
  db.close()
  resetMissionDb()
})

describe('Mission CRUD', () => {
  it('creates a mission with defaults', () => {
    const m = createMission(db, { name: 'Patrol A' })
    expect(m.id).toBeTruthy()
    expect(m.name).toBe('Patrol A')
    expect(m.type).toBe('patrol')
    expect(m.status).toBe('draft')
    expect(m.waypoints).toEqual([])
    expect(m.robotId).toBeNull()
  })

  it('creates a mission with waypoints', () => {
    const m = createMission(db, {
      name: 'Inspect B',
      type: 'inspect',
      waypoints: [
        { x: 1, y: 2, z: 0, label: 'start' },
        { x: 3, y: 4, z: 0 },
      ],
      robotId: 'robot-1',
    })
    expect(m.type).toBe('inspect')
    expect(m.waypoints).toHaveLength(2)
    expect(m.waypoints[0]!.label).toBe('start')
    expect(m.robotId).toBe('robot-1')
  })

  it('gets a mission by id', () => {
    const created = createMission(db, { name: 'Test' })
    const fetched = getMission(db, created.id)
    expect(fetched).toEqual(created)
  })

  it('returns null for non-existent mission', () => {
    expect(getMission(db, 'nope')).toBeNull()
  })

  it('lists missions with filter', () => {
    createMission(db, { name: 'A', robotId: 'r1' })
    createMission(db, { name: 'B', robotId: 'r2' })
    expect(listMissions(db, { robotId: 'r1' })).toHaveLength(1)
    expect(listMissions(db)).toHaveLength(2)
  })

  it('updates a mission', () => {
    const m = createMission(db, { name: 'Old' })
    const updated = updateMission(db, m.id, { name: 'New', status: 'in_progress' })
    expect(updated!.name).toBe('New')
    expect(updated!.status).toBe('in_progress')
  })

  it('deletes a mission', () => {
    const m = createMission(db, { name: 'Doomed' })
    expect(deleteMission(db, m.id)).toBe(true)
    expect(getMission(db, m.id)).toBeNull()
  })
})

describe('Mission Dispatch', () => {
  it('dispatches a queued mission', () => {
    const m = createMission(db, { name: 'Go' })
    queueMission(db, m.id)
    const dispatched = dispatchMission(db, m.id)
    expect(dispatched!.status).toBe('dispatched')
  })

  it('rejects dispatch of non-pending mission', () => {
    const m = createMission(db, { name: 'Go' })
    updateMission(db, m.id, { status: 'completed' })
    expect(dispatchMission(db, m.id)).toBeNull()
  })

  it('rejects dispatch of non-existent mission', () => {
    expect(dispatchMission(db, 'nope')).toBeNull()
  })
})
