/**
 * Trust Layer v1 Tests — Categories, Overrides, Decay, Thresholds
 *
 * @see Issue #37 — T5.1 Trust Layer v1 BE
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import {
  upsertTrustScore,
  getTrustScore,
  upsertCategoryScore,
  getCategoryScores,
  computeWeightedScore,
  scoreToLevel,
  createOverride,
  listOverrides,
  decayScore,
  applyDecay,
  DEFAULT_THRESHOLDS,
  type TrustFactor,
} from '../trust/model'
import { createTrustDb } from '../trust/db'

function makeDb(): Database {
  return createTrustDb(':memory:')
}

describe('Weighted Score Computation', () => {
  it('computes weighted average of factors', () => {
    const factors: TrustFactor[] = [
      { name: 'sensor_health', weight: 0.4, value: 90 },
      { name: 'mission_success', weight: 0.3, value: 80 },
      { name: 'uptime', weight: 0.2, value: 100 },
      { name: 'error_rate', weight: 0.1, value: 60 },
    ]
    const score = computeWeightedScore(factors)
    // (0.4*90 + 0.3*80 + 0.2*100 + 0.1*60) / 1.0 = 86
    expect(score).toBe(86)
  })

  it('returns 50 for empty factors', () => {
    expect(computeWeightedScore([])).toBe(50)
  })

  it('handles single factor', () => {
    expect(computeWeightedScore([{ name: 'test', weight: 1, value: 75 }])).toBe(75)
  })
})

describe('Thresholds', () => {
  it('green for score >= 80', () => {
    expect(scoreToLevel(85)).toBe('green')
    expect(scoreToLevel(80)).toBe('green')
  })

  it('yellow for score 50-79', () => {
    expect(scoreToLevel(79)).toBe('yellow')
    expect(scoreToLevel(50)).toBe('yellow')
  })

  it('red for score < 50', () => {
    expect(scoreToLevel(49)).toBe('red')
    expect(scoreToLevel(0)).toBe('red')
  })

  it('supports custom thresholds', () => {
    expect(scoreToLevel(70, { green: 90, yellow: 60 })).toBe('yellow')
    expect(scoreToLevel(95, { green: 90, yellow: 60 })).toBe('green')
  })
})

describe('Category Scores', () => {
  let db: Database
  beforeEach(() => {
    db = makeDb()
  })
  afterEach(() => {
    db.close()
  })

  it('upserts category score with factors', () => {
    const cat = upsertCategoryScore(db, 'robot-1', 'navigation', [
      { name: 'path_accuracy', weight: 0.5, value: 90 },
      { name: 'obstacle_avoidance', weight: 0.5, value: 80 },
    ])
    expect(cat.category).toBe('navigation')
    expect(cat.score).toBe(85)
    expect(cat.factors).toHaveLength(2)
  })

  it('updates existing category score', () => {
    upsertCategoryScore(db, 'robot-1', 'perception', [{ name: 'detection', weight: 1, value: 70 }])
    const updated = upsertCategoryScore(db, 'robot-1', 'perception', [
      { name: 'detection', weight: 1, value: 95 },
    ])
    expect(updated.score).toBe(95)
  })

  it('gets all categories for robot', () => {
    upsertCategoryScore(db, 'robot-1', 'navigation', [{ name: 'a', weight: 1, value: 90 }])
    upsertCategoryScore(db, 'robot-1', 'perception', [{ name: 'b', weight: 1, value: 80 }])
    upsertCategoryScore(db, 'robot-1', 'manipulation', [{ name: 'c', weight: 1, value: 70 }])

    const cats = getCategoryScores(db, 'robot-1')
    expect(cats).toHaveLength(3)
  })
})

describe('Operator Override', () => {
  let db: Database
  beforeEach(() => {
    db = makeDb()
    upsertTrustScore(db, {
      robotId: 'robot-1',
      confidenceScore: 85,
      riskLevel: 'low',
    })
    upsertCategoryScore(db, 'robot-1', 'navigation', [{ name: 'test', weight: 1, value: 85 }])
  })
  afterEach(() => {
    db.close()
  })

  it('creates override on main score', () => {
    const override = createOverride(db, {
      robotId: 'robot-1',
      overrideScore: 30,
      reason: 'Robot acting erratically',
      operatorId: 'u-operator',
    })
    expect(override.previousScore).toBe(85)
    expect(override.overrideScore).toBe(30)
    expect(override.active).toBe(true)

    // Verify score was updated
    const trust = getTrustScore(db, 'robot-1')
    expect(trust!.confidenceScore).toBe(30)
  })

  it('creates override on category', () => {
    const override = createOverride(db, {
      robotId: 'robot-1',
      category: 'navigation',
      overrideScore: 20,
      reason: 'Navigation unreliable',
      operatorId: 'u-operator',
    })
    expect(override.category).toBe('navigation')
    expect(override.previousScore).toBe(85)

    const cats = getCategoryScores(db, 'robot-1')
    const nav = cats.find((c) => c.category === 'navigation')
    expect(nav!.score).toBe(20)
  })

  it('deactivates previous override', () => {
    createOverride(db, {
      robotId: 'robot-1',
      overrideScore: 30,
      reason: 'First override',
      operatorId: 'u-op1',
    })
    createOverride(db, {
      robotId: 'robot-1',
      overrideScore: 60,
      reason: 'Second override',
      operatorId: 'u-op2',
    })

    const overrides = listOverrides(db, 'robot-1')
    const active = overrides.filter((o) => o.active)
    expect(active).toHaveLength(1)
    expect(active[0].overrideScore).toBe(60)
  })

  it('lists override history', () => {
    createOverride(db, { robotId: 'robot-1', overrideScore: 30, reason: 'A', operatorId: 'op1' })
    createOverride(db, { robotId: 'robot-1', overrideScore: 60, reason: 'B', operatorId: 'op2' })

    const history = listOverrides(db, 'robot-1')
    expect(history).toHaveLength(2)
  })
})

describe('Auto-Decay', () => {
  it('decays score toward neutral (50)', () => {
    expect(decayScore(100)).toBe(99) // 100 + (50-100)*0.02 = 99
    expect(decayScore(0)).toBe(1) // 0 + (50-0)*0.02 = 1
    expect(decayScore(50)).toBe(50) // already neutral
  })

  it('applies decay to category scores', () => {
    const db = makeDb()
    upsertCategoryScore(db, 'robot-1', 'navigation', [{ name: 'a', weight: 1, value: 100 }])
    upsertCategoryScore(db, 'robot-1', 'perception', [{ name: 'b', weight: 1, value: 0 }])

    applyDecay(db, 'robot-1')

    const cats = getCategoryScores(db, 'robot-1')
    const nav = cats.find((c) => c.category === 'navigation')
    const per = cats.find((c) => c.category === 'perception')
    expect(nav!.score).toBeLessThan(100)
    expect(per!.score).toBeGreaterThan(0)
    db.close()
  })

  it('skips decay for overridden categories', () => {
    const db = makeDb()
    upsertTrustScore(db, { robotId: 'robot-1', confidenceScore: 85, riskLevel: 'low' })
    upsertCategoryScore(db, 'robot-1', 'navigation', [{ name: 'a', weight: 1, value: 30 }])
    createOverride(db, {
      robotId: 'robot-1',
      category: 'navigation',
      overrideScore: 30,
      reason: 'Locked',
      operatorId: 'op1',
    })

    applyDecay(db, 'robot-1')

    const cats = getCategoryScores(db, 'robot-1')
    const nav = cats.find((c) => c.category === 'navigation')
    expect(nav!.score).toBe(30) // no decay
    db.close()
  })
})
