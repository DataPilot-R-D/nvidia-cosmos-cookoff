/**
 * World Model (zones + assets) — unit tests.
 * TDD: RED → GREEN → IMPROVE
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { createWorldDb, resetWorldDb } from '../world-model/db'
import {
  createZone,
  getZone,
  listZones,
  updateZone,
  deleteZone,
  createAsset,
  getAsset,
  listAssets,
  updateAsset,
  deleteAsset,
} from '../world-model/model'
import type { Database } from 'bun:sqlite'

let db: Database

beforeEach(() => {
  resetWorldDb()
  db = createWorldDb(':memory:')
})

afterEach(() => {
  db.close()
  resetWorldDb()
})

describe('Zone CRUD', () => {
  it('creates a zone with defaults', () => {
    const zone = createZone(db, { name: 'Alpha' })
    expect(zone.id).toBeTruthy()
    expect(zone.name).toBe('Alpha')
    expect(zone.type).toBe('patrol')
    expect(zone.color).toBe('#3b82f6')
    expect(zone.polygon).toEqual([])
    expect(zone.maxRobots).toBeNull()
    expect(zone.speedLimit).toBeNull()
  })

  it('creates a zone with constraints', () => {
    const zone = createZone(db, {
      name: 'Restricted',
      type: 'restricted',
      polygon: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      color: '#ef4444',
      maxRobots: 2,
      speedLimit: 0.5,
    })
    expect(zone.type).toBe('restricted')
    expect(zone.polygon).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ])
    expect(zone.maxRobots).toBe(2)
    expect(zone.speedLimit).toBe(0.5)
  })

  it('gets a zone by id', () => {
    const created = createZone(db, { name: 'Test' })
    const fetched = getZone(db, created.id)
    expect(fetched).toEqual(created)
  })

  it('returns null for non-existent zone', () => {
    expect(getZone(db, 'non-existent')).toBeNull()
  })

  it('lists all zones', () => {
    createZone(db, { name: 'A' })
    createZone(db, { name: 'B' })
    const zones = listZones(db)
    expect(zones).toHaveLength(2)
  })

  it('updates a zone', () => {
    const zone = createZone(db, { name: 'Old' })
    const updated = updateZone(db, zone.id, { name: 'New', maxRobots: 5 })
    expect(updated!.name).toBe('New')
    expect(updated!.maxRobots).toBe(5)
  })

  it('deletes a zone', () => {
    const zone = createZone(db, { name: 'Doomed' })
    expect(deleteZone(db, zone.id)).toBe(true)
    expect(getZone(db, zone.id)).toBeNull()
  })

  it('rejects invalid zone type', () => {
    expect(() => createZone(db, { name: 'Bad', type: 'invalid' as any })).toThrow()
  })

  it('rejects invalid color', () => {
    expect(() => createZone(db, { name: 'Bad', color: 'red' })).toThrow()
  })
})

describe('Asset CRUD', () => {
  it('creates an asset with defaults', () => {
    const asset = createAsset(db, { name: 'Robot-1' })
    expect(asset.id).toBeTruthy()
    expect(asset.name).toBe('Robot-1')
    expect(asset.type).toBe('robot')
    expect(asset.position).toEqual({ x: 0, y: 0, z: 0 })
    expect(asset.zoneId).toBeNull()
  })

  it('creates an asset linked to a zone', () => {
    const zone = createZone(db, { name: 'Zone1' })
    const asset = createAsset(db, {
      name: 'Cam-1',
      type: 'camera',
      zoneId: zone.id,
      position: { x: 1, y: 2, z: 3 },
    })
    expect(asset.zoneId).toBe(zone.id)
    expect(asset.position).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('lists assets filtered by zoneId', () => {
    const zone = createZone(db, { name: 'Z' })
    createAsset(db, { name: 'A1', zoneId: zone.id })
    createAsset(db, { name: 'A2' })
    expect(listAssets(db, zone.id)).toHaveLength(1)
    expect(listAssets(db)).toHaveLength(2)
  })

  it('updates an asset', () => {
    const asset = createAsset(db, { name: 'Old' })
    const updated = updateAsset(db, asset.id, { name: 'New' })
    expect(updated!.name).toBe('New')
  })

  it('deletes an asset', () => {
    const asset = createAsset(db, { name: 'Doomed' })
    expect(deleteAsset(db, asset.id)).toBe(true)
    expect(getAsset(db, asset.id)).toBeNull()
  })
})
