/**
 * Evidence Store
 *
 * Zustand store for evidence browsing, filtering, and timeline display.
 */

import { create } from 'zustand'

// =============================================================================
// Types
// =============================================================================

export type EvidenceType =
  | 'video_clip'
  | 'snapshot'
  | 'sensor_log'
  | 'audit_entry'
  | 'event'
  | 'note'

export interface Evidence {
  id: string
  type: EvidenceType
  title: string
  description: string
  incidentId: string | null
  missionId: string | null
  robotId: string | null
  cameraSourceId: string | null
  capturedAt: string
  mediaUrl: string | null
  startOffset: number | null
  endOffset: number | null
  metadata: string | null
  createdAt: string
  updatedAt: string
}

export interface EvidenceFilters {
  type?: EvidenceType
  incidentId?: string
  missionId?: string
  robotId?: string
  fromDate?: string
  toDate?: string
}

export interface EvidenceState {
  entries: Map<string, Evidence>
  selectedId: string | null
  filters: EvidenceFilters
  loading: boolean
  error: string | null
}

export interface EvidenceActions {
  setEntries: (entries: Evidence[]) => void
  upsertEntry: (entry: Evidence) => void
  removeEntry: (id: string) => void
  setSelected: (id: string | null) => void
  setFilter: (partial: Partial<EvidenceFilters>) => void
  clearFilters: () => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  getFilteredEntries: () => Evidence[]
  getTimelineSorted: () => Evidence[]
}

// =============================================================================
// Store
// =============================================================================

export const useEvidenceStore = create<EvidenceState & EvidenceActions>((set, get) => ({
  entries: new Map(),
  selectedId: null,
  filters: {},
  loading: false,
  error: null,

  setEntries: (entries) => set({ entries: new Map(entries.map((e) => [e.id, e])) }),

  upsertEntry: (entry) =>
    set((state) => {
      const next = new Map(state.entries)
      next.set(entry.id, entry)
      return { entries: next }
    }),

  removeEntry: (id) =>
    set((state) => {
      const next = new Map(state.entries)
      next.delete(id)
      return { entries: next }
    }),

  setSelected: (id) => set({ selectedId: id }),

  setFilter: (partial) => set((state) => ({ filters: { ...state.filters, ...partial } })),

  clearFilters: () => set({ filters: {} }),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  getFilteredEntries: () => {
    const { entries, filters } = get()
    let list = Array.from(entries.values())

    if (filters.type) list = list.filter((e) => e.type === filters.type)
    if (filters.incidentId) list = list.filter((e) => e.incidentId === filters.incidentId)
    if (filters.missionId) list = list.filter((e) => e.missionId === filters.missionId)
    if (filters.robotId) list = list.filter((e) => e.robotId === filters.robotId)
    if (filters.fromDate) list = list.filter((e) => e.capturedAt >= filters.fromDate!)
    if (filters.toDate) list = list.filter((e) => e.capturedAt <= filters.toDate!)

    return list.sort((a, b) => new Date(b.capturedAt).getTime() - new Date(a.capturedAt).getTime())
  },

  getTimelineSorted: () => {
    const { entries } = get()
    return Array.from(entries.values()).sort(
      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    )
  },
}))
