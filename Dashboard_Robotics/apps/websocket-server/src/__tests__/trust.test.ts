/**
 * Trust Layer model unit tests.
 * Uses bun:test + bun:sqlite.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  upsertTrustScore,
  getTrustScore,
  listTrustScores,
  requestHandover,
  computeHandoverStatus,
  generateRecommendations,
} from '../trust/model'

let db: Database

function initTestDb(): Database {
  const d = new Database(':memory:')
  d.exec('PRAGMA foreign_keys = ON')
  d.exec(`
    CREATE TABLE IF NOT EXISTS trust_scores (
      id TEXT PRIMARY KEY,
      robotId TEXT NOT NULL UNIQUE,
      confidenceScore REAL NOT NULL DEFAULT 100,
      riskLevel TEXT NOT NULL DEFAULT 'low',
      handoverStatus TEXT NOT NULL DEFAULT 'autonomous',
      reasons TEXT NOT NULL DEFAULT '[]',
      recommendations TEXT NOT NULL DEFAULT '[]',
      sensorHealth TEXT,
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

describe('Trust Layer — computeHandoverStatus', () => {
  test('critical risk → emergency_stop', () => {
    expect(computeHandoverStatus(90, 'critical')).toBe('emergency_stop')
  })

  test('high risk → manual', () => {
    expect(computeHandoverStatus(80, 'high')).toBe('manual')
  })

  test('low confidence → manual', () => {
    expect(computeHandoverStatus(20, 'low')).toBe('manual')
  })

  test('medium risk → supervised', () => {
    expect(computeHandoverStatus(70, 'medium')).toBe('supervised')
  })

  test('medium confidence → supervised', () => {
    expect(computeHandoverStatus(50, 'low')).toBe('supervised')
  })

  test('high confidence + low risk → autonomous', () => {
    expect(computeHandoverStatus(90, 'low')).toBe('autonomous')
  })
})

describe('Trust Layer — generateRecommendations', () => {
  test('critical risk recommends emergency stop', () => {
    const recs = generateRecommendations(80, 'critical')
    expect(recs.some((r) => r.includes('emergency stop'))).toBe(true)
  })

  test('low confidence recommends takeover', () => {
    const recs = generateRecommendations(20, 'low')
    expect(recs.some((r) => r.includes('operator takeover'))).toBe(true)
  })

  test('degraded sensor recommends verify', () => {
    const recs = generateRecommendations(90, 'low', { lidar: 30 })
    expect(recs.some((r) => r.includes('lidar'))).toBe(true)
  })

  test('nominal state returns safe message', () => {
    const recs = generateRecommendations(90, 'low')
    expect(recs[0]).toContain('nominal')
  })
})

describe('Trust Layer — CRUD', () => {
  test('upsert creates new trust score', () => {
    const score = upsertTrustScore(db, {
      robotId: 'robot-1',
      confidenceScore: 85,
      riskLevel: 'low',
    })

    expect(score.robotId).toBe('robot-1')
    expect(score.confidenceScore).toBe(85)
    expect(score.handoverStatus).toBe('autonomous')
  })

  test('upsert updates existing trust score', () => {
    upsertTrustScore(db, {
      robotId: 'robot-1',
      confidenceScore: 85,
      riskLevel: 'low',
    })

    const updated = upsertTrustScore(db, {
      robotId: 'robot-1',
      confidenceScore: 30,
      riskLevel: 'high',
    })

    expect(updated.confidenceScore).toBe(30)
    expect(updated.handoverStatus).toBe('manual')
  })

  test('get trust score by robotId', () => {
    upsertTrustScore(db, {
      robotId: 'robot-1',
      confidenceScore: 90,
      riskLevel: 'low',
    })

    const score = getTrustScore(db, 'robot-1')
    expect(score).not.toBeNull()
    expect(score!.robotId).toBe('robot-1')
  })

  test('get returns null for unknown robot', () => {
    expect(getTrustScore(db, 'unknown')).toBeNull()
  })

  test('list trust scores', () => {
    upsertTrustScore(db, { robotId: 'r1', confidenceScore: 90, riskLevel: 'low' })
    upsertTrustScore(db, { robotId: 'r2', confidenceScore: 30, riskLevel: 'high' })

    const { entries, total } = listTrustScores(db)
    expect(total).toBe(2)
    expect(entries.length).toBe(2)
  })

  test('filter by riskLevel', () => {
    upsertTrustScore(db, { robotId: 'r1', confidenceScore: 90, riskLevel: 'low' })
    upsertTrustScore(db, { robotId: 'r2', confidenceScore: 30, riskLevel: 'high' })

    const { entries } = listTrustScores(db, { riskLevel: 'high' })
    expect(entries.length).toBe(1)
    expect(entries[0]!.robotId).toBe('r2')
  })

  test('stores sensor health', () => {
    const score = upsertTrustScore(db, {
      robotId: 'robot-1',
      confidenceScore: 80,
      riskLevel: 'medium',
      sensorHealth: { lidar: 95, camera: 80, imu: 100 },
    })

    const health = JSON.parse(score.sensorHealth!)
    expect(health.lidar).toBe(95)
  })
})

describe('Trust Layer — Handover', () => {
  test('requestHandover changes status', () => {
    upsertTrustScore(db, { robotId: 'robot-1', confidenceScore: 90, riskLevel: 'low' })

    const result = requestHandover(db, 'robot-1', 'manual', 'Operator override')
    expect(result).not.toBeNull()
    expect(result!.handoverStatus).toBe('manual')

    const reasons = JSON.parse(result!.reasons)
    expect(reasons).toContain('Operator override')
  })

  test('requestHandover returns null for unknown robot', () => {
    expect(requestHandover(db, 'unknown', 'manual', 'test')).toBeNull()
  })
})
