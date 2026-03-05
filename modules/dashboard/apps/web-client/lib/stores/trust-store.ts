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

export type TrustCategory = 'navigation' | 'manipulation' | 'perception'

export interface CategoryScore {
  id: string
  robotId: string
  category: TrustCategory
  score: number
  factors: Array<{ name: string; weight: number; value: number }>
  updatedAt: string
}

export interface TrustOverride {
  id: string
  robotId: string
  category: string | null
  previousScore: number
  overrideScore: number
  reason: string
  operatorId: string
  expiresAt: string | null
  active: boolean
  createdAt: string
}

export interface TrustThresholds {
  green: number
  yellow: number
}

export interface TrustState {
  scores: Map<string, TrustScore>
  categories: Map<string, CategoryScore[]>
  overrides: Map<string, TrustOverride[]>
  thresholds: TrustThresholds
  selectedRobotId: string | null
  loading: boolean
  error: string | null
}

export interface TrustActions {
  setScores: (scores: TrustScore[]) => void
  upsertScore: (score: TrustScore) => void
  setCategories: (robotId: string, cats: CategoryScore[]) => void
  setOverrides: (robotId: string, overrides: TrustOverride[]) => void
  setThresholds: (t: TrustThresholds) => void
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
  categories: new Map(),
  overrides: new Map(),
  thresholds: { green: 80, yellow: 50 },
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

  setCategories: (robotId, cats) =>
    set((state) => {
      const next = new Map(state.categories)
      next.set(robotId, cats)
      return { categories: next }
    }),

  setOverrides: (robotId, overrides) =>
    set((state) => {
      const next = new Map(state.overrides)
      next.set(robotId, overrides)
      return { overrides: next }
    }),

  setThresholds: (t) => set({ thresholds: t }),

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
