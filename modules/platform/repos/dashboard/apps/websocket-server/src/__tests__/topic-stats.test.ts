import { describe, expect, it } from 'vitest'
import { createEmptyTopicStats, updateTopicStats } from '../handlers/rosbridge/topic-stats'

describe('topic-stats', () => {
  it('computes instantaneous hz on first delta and applies EMA afterwards', () => {
    const s0 = createEmptyTopicStats()
    const s1 = updateTopicStats(s0, 1000)
    expect(s1.emaHz).toBeNull()

    // 20ms period -> 50 Hz
    const s2 = updateTopicStats(s1, 1020, { alpha: 0.2 })
    expect(s2.emaHz).toBeCloseTo(50, 5)

    // 40ms period -> 25 Hz
    const s3 = updateTopicStats(s2, 1060, { alpha: 0.2 })
    // EMA: 0.2*25 + 0.8*50 = 45
    expect(s3.emaHz).toBeCloseTo(45, 5)
  })

  it('ignores very large deltas for rate (topic paused), but updates activity', () => {
    const s0 = updateTopicStats(createEmptyTopicStats(), 1000)
    const s1 = updateTopicStats(s0, 1100)
    expect(s1.lastMessageAt).toBe(1100)

    const s2 = updateTopicStats(s1, 1000 + 120_000, { maxDeltaMs: 60_000 })
    expect(s2.lastMessageAt).toBe(121000)
    // rate should remain the same (or null if not established)
    expect(s2.emaHz).toBe(s1.emaHz)
  })
})
