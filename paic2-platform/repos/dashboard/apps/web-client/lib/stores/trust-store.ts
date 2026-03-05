/**
 * Trust Store
 *
 * Zustand store for robot trust scores, risk indicators, and handover controls.
 */

import { create } from 'zustand'

// =============================================================================
// Types
// =============================================================================

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type HandoverStatus = 'autonomous' | 'supervised' | 'manual' | 'emergency_stop'

export interface TrustScore {
  id: string
  robotId: string
  confidenceScore: number
  riskLevel: RiskLevel
  handoverStatus: HandoverStatus
  reasons: string
  recommendations: string
  sensorHealth: string | null
  metadata: string | null
  createdAt: string
  updatedAt: string
}

export interface TrustState {
  scores: Map<string, TrustScore>
  selectedRobotId: string | null
  loading: boolean
  error: string | null
}

export interface TrustActions {
  setScores: (scores: TrustScore[]) => void
  upsertScore: (score: TrustScore) => void
  setSelectedRobot: (robotId: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  getScore: (robotId: string) => TrustScore | undefined
  getSortedScores: () => TrustScore[]
}

// =============================================================================
// Store
// =============================================================================

export const useTrustStore = create<TrustState & TrustActions>((set, get) => ({
  scores: new Map(),
  selectedRobotId: null,
  loading: false,
  error: null,

  setScores: (scores) => set({ scores: new Map(scores.map((s) => [s.robotId, s])) }),

  upsertScore: (score) =>
    set((state) => {
      const next = new Map(state.scores)
      next.set(score.robotId, score)
      return { scores: next }
    }),

  setSelectedRobot: (robotId) => set({ selectedRobotId: robotId }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  getScore: (robotId) => get().scores.get(robotId),

  getSortedScores: () => {
    const riskOrder: Record<RiskLevel, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    }
    return Array.from(get().scores.values()).sort(
      (a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]
    )
  },
}))
