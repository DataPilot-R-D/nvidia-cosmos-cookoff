/**
 * World Model Constraints + Validation Tests
 *
 * @see Issue #30 — T3.1 World Model v1 BE
 */

import { Database } from 'bun:sqlite'
import {
  createZone,
  listZones,
  createAsset,
  createConstraint,
  getConstraint,
  listConstraints,
  updateConstraint,
  deleteConstraint,
} from '../world-model/model'
import { createWorldDb } from '../world-model/db'

function makeDb(): Database {
  return createWorldDb(':memory:')
}

describe('Zone Validation', () => {
  let db: Database
  beforeEach(() => {
    db = makeDb()
  })
  afterEach(() => {
    db.close()
  })

  it('creates zone with staging type', () => {
    const zone = createZone(db, { name: 'Staging Area', type: 'staging', polygon: [] })
    expect(zone.type).toBe('staging')
  })

  it('rejects unclosed polygon', () => {
    expect(() =>
      createZone(db, {
        name: 'Bad Zone',
        polygon: [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
      })
    ).toThrow('Polygon must be closed')
  })

  it('accepts closed polygon', () => {
    const zone = createZone(db, {
      name: 'Good Zone',
      polygon: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    })
    expect(zone.polygon).toHaveLength(4)
  })

  it('accepts empty polygon', () => {
    const zone = createZone(db, { name: 'Empty', polygon: [] })
    expect(zone.polygon).toHaveLength(0)
  })

  it('enforces unique zone names', () => {
    createZone(db, { name: 'Patrol A' })
    expect(() => createZone(db, { name: 'Patrol A' })).toThrow()
  })
})

describe('Constraint CRUD', () => {
  let db: Database
  let zoneId: string

  beforeEach(() => {
    db = makeDb()
    const zone = createZone(db, { name: 'Test Zone' })
    zoneId = zone.id
  })

  afterEach(() => {
    db.close()
  })

  it('creates a speed-limit constraint', () => {
    const c = createConstraint(db, {
      type: 'speed-limit',
      zoneId,
      params: { maxSpeed: 0.5 },
      description: 'Slow zone',
    })
    expect(c.type).toBe('speed-limit')
    expect(c.zoneId).toBe(zoneId)
    expect(c.params).toEqual({ maxSpeed: 0.5 })
    expect(c.description).toBe('Slow zone')
    expect(c.id).toBeTruthy()
  })

  it('creates a no-entry constraint', () => {
    const c = createConstraint(db, { type: 'no-entry', zoneId })
    expect(c.type).toBe('no-entry')
  })

  it('creates a time-window constraint', () => {
    const c = createConstraint(db, {
      type: 'time-window',
      zoneId,
      params: { startHour: 8, endHour: 18 },
    })
    expect(c.params).toEqual({ startHour: 8, endHour: 18 })
  })

  it('gets constraint by id', () => {
    const c = createConstraint(db, { type: 'no-entry', zoneId })
    const found = getConstraint(db, c.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(c.id)
  })

  it('lists all constraints', () => {
    createConstraint(db, { type: 'speed-limit', zoneId, params: { maxSpeed: 1 } })
    createConstraint(db, { type: 'no-entry', zoneId })
    expect(listConstraints(db)).toHaveLength(2)
  })

  it('lists constraints filtered by zoneId', () => {
    const zone2 = createZone(db, { name: 'Zone 2' })
    createConstraint(db, { type: 'speed-limit', zoneId, params: {} })
    createConstraint(db, { type: 'no-entry', zoneId: zone2.id })

    expect(listConstraints(db, zoneId)).toHaveLength(1)
    expect(listConstraints(db, zone2.id)).toHaveLength(1)
  })

  it('updates a constraint', () => {
    const c = createConstraint(db, {
      type: 'speed-limit',
      zoneId,
      params: { maxSpeed: 1 },
    })
    const updated = updateConstraint(db, c.id, {
      params: { maxSpeed: 0.3 },
      description: 'Updated',
    })
    expect(updated!.params).toEqual({ maxSpeed: 0.3 })
    expect(updated!.description).toBe('Updated')
  })

  it('returns null updating non-existent constraint', () => {
    const result = updateConstraint(db, 'nonexistent', { description: 'x' })
    expect(result).toBeNull()
  })

  it('deletes a constraint', () => {
    const c = createConstraint(db, { type: 'no-entry', zoneId })
    expect(deleteConstraint(db, c.id)).toBe(true)
    expect(getConstraint(db, c.id)).toBeNull()
  })

  it('returns false deleting non-existent constraint', () => {
    expect(deleteConstraint(db, 'nonexistent')).toBe(false)
  })

  it('cascade deletes constraints when zone is deleted', () => {
    createConstraint(db, { type: 'speed-limit', zoneId, params: {} })
    createConstraint(db, { type: 'no-entry', zoneId })
    expect(listConstraints(db, zoneId)).toHaveLength(2)

    db.prepare('DELETE FROM zones WHERE id = ?').run(zoneId)
    expect(listConstraints(db, zoneId)).toHaveLength(0)
  })
})
