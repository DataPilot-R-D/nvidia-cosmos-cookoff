/**
 * ROS Topic Stats
 *
 * Pure helper for estimating message frequency (Hz) from incoming publish timestamps.
 *
 * We intentionally use an exponential moving average (EMA) to smooth jitter and
 * avoid storing large per-topic buffers.
 */

export interface TopicStats {
  /** Last time we observed a message for the topic (ms since epoch) */
  lastMessageAt: number | null
  /** Last time used as delta base for instantaneous Hz (ms since epoch) */
  lastRateSampleAt: number | null
  /** Smoothed message rate (Hz) */
  emaHz: number | null
}

export interface UpdateTopicStatsOptions {
  /** EMA smoothing factor. 0.2 = responsive, 0.05 = very smooth */
  alpha?: number
  /** Ignore deltas below this threshold to avoid clock bursts (ms) */
  minDeltaMs?: number
  /** Ignore deltas above this threshold (topic paused) (ms) */
  maxDeltaMs?: number
}

const DEFAULT_OPTS: Required<UpdateTopicStatsOptions> = {
  alpha: 0.2,
  minDeltaMs: 5,
  maxDeltaMs: 60_000,
}

export function createEmptyTopicStats(): TopicStats {
  return {
    lastMessageAt: null,
    lastRateSampleAt: null,
    emaHz: null,
  }
}

/**
 * Update stats for a new message at `nowMs`.
 */
export function updateTopicStats(
  prev: TopicStats,
  nowMs: number,
  options: UpdateTopicStatsOptions = {}
): TopicStats {
  const opts = { ...DEFAULT_OPTS, ...options }

  // Always update lastMessageAt.
  if (prev.lastRateSampleAt === null) {
    return {
      lastMessageAt: nowMs,
      lastRateSampleAt: nowMs,
      emaHz: prev.emaHz,
    }
  }

  const delta = nowMs - prev.lastRateSampleAt
  if (delta < opts.minDeltaMs || delta > opts.maxDeltaMs) {
    // We still track activity, but don't change the rate estimate.
    return {
      ...prev,
      lastMessageAt: nowMs,
      lastRateSampleAt: nowMs,
    }
  }

  const instantHz = 1000 / delta
  const nextHz =
    prev.emaHz === null ? instantHz : opts.alpha * instantHz + (1 - opts.alpha) * prev.emaHz

  return {
    lastMessageAt: nowMs,
    lastRateSampleAt: nowMs,
    emaHz: nextHz,
  }
}
