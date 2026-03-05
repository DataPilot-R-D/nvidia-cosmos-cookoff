/**
 * Mission Store
 *
 * Zustand store for mission CRUD, filtering, and real-time status updates via WS.
 */

import { create } from 'zustand'

// =============================================================================
// Types
// =============================================================================

export type MissionType = 'patrol' | 'inspect' | 'goto'
export type MissionStatus =
  | 'pending'
  | 'dispatched'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface Waypoint {
  x: number
  y: number
  z: number
  label?: string
}

export interface Mission {
  id: string
  name: string
  type: MissionType
  waypoints: Waypoint[]
  robotId: string | null
  status: MissionStatus
  createdAt: string
  updatedAt: string
}

export interface CreateMissionInput {
  name: string
  type: MissionType
  waypoints?: Waypoint[]
  robotId?: string | null
}

export interface MissionFilters {
  status?: MissionStatus
  type?: MissionType
}

export interface MissionState {
  missions: Map<string, Mission>
  selectedMissionId: string | null
  filters: MissionFilters
  loading: boolean
  error: string | null
}

export interface MissionActions {
  setMissions: (missions: Mission[]) => void
  upsertMission: (mission: Mission) => void
  removeMission: (id: string) => void
  setSelectedMission: (id: string | null) => void
  setFilter: (partial: Partial<MissionFilters>) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  getFilteredMissions: () => Mission[]
}

// =============================================================================
// Store
// =============================================================================

export const useMissionStore = create<MissionState & MissionActions>((set, get) => ({
  missions: new Map(),
  selectedMissionId: null,
  filters: {},
  loading: false,
  error: null,

  setMissions: (missions) =>
    set({
      missions: new Map(missions.map((m) => [m.id, m])),
    }),

  upsertMission: (mission) =>
    set((state) => {
      const next = new Map(state.missions)
      next.set(mission.id, mission)
      return { missions: next }
    }),

  removeMission: (id) =>
    set((state) => {
      const next = new Map(state.missions)
      next.delete(id)
      return { missions: next }
    }),

  setSelectedMission: (id) => set({ selectedMissionId: id }),

  setFilter: (partial) => set((state) => ({ filters: { ...state.filters, ...partial } })),

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),

  getFilteredMissions: () => {
    const { missions, filters } = get()
    let list = Array.from(missions.values())

    if (filters.status) {
      list = list.filter((m) => m.status === filters.status)
    }
    if (filters.type) {
      list = list.filter((m) => m.type === filters.type)
    }

    // Sort: newest first
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },
}))
