/**
 * Incident Store
 *
 * Zustand store for incident list, selection, filtering and sorting.
 * Seeded with a small demo dataset for UI development.
 */

import { create } from 'zustand'

// =============================================================================
// Types
// =============================================================================

export type IncidentSeverity = 'critical' | 'warning' | 'info'
export type IncidentStatus = 'new' | 'acknowledged' | 'resolved'

export interface Incident {
  id: string
  title: string
  severity: IncidentSeverity
  status: IncidentStatus
  timestamp: string
  cameraId?: string
  location?: string
  description: string
}

export interface IncidentFilters {
  severity?: IncidentSeverity
  status?: IncidentStatus
}

export interface IncidentState {
  incidents: Map<string, Incident>
  selectedIncidentId: string | null
  filters: IncidentFilters
}

export interface IncidentActions {
  addIncident: (incident: Incident) => void
  updateIncident: (id: string, partial: Partial<Incident>) => void
  setSelectedIncident: (id: string | null) => void
  setFilter: (partial: Partial<IncidentFilters>) => void
  getFilteredIncidents: () => Incident[]
}

// =============================================================================
// Sorting Helpers
// =============================================================================

const SEVERITY_ORDER: Record<IncidentSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
} as const

function compareIncidents(a: Incident, b: Incident): number {
  const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  if (sev !== 0) return sev

  // Newest first within same severity
  const ta = new Date(a.timestamp).getTime()
  const tb = new Date(b.timestamp).getTime()
  return tb - ta
}

// =============================================================================
// Initial State (seeded demo data)
// =============================================================================

const seedIncidents: Incident[] = [
  {
    id: 'inc-001',
    title: 'Door Forced Open',
    severity: 'critical',
    status: 'new',
    timestamp: '2026-02-11T00:05:00.000Z',
    location: 'Loading Bay',
    cameraId: 'cam-01',
    description: 'Magnetic contact sensor indicates forced entry on loading bay door.',
  },
  {
    id: 'inc-002',
    title: 'Motion Detected',
    severity: 'warning',
    status: 'acknowledged',
    timestamp: '2026-02-10T18:22:00.000Z',
    location: 'North Corridor',
    cameraId: 'cam-03',
    description: 'Motion detected outside normal schedule; operator acknowledged for review.',
  },
  {
    id: 'inc-003',
    title: 'Camera Offline',
    severity: 'info',
    status: 'resolved',
    timestamp: '2026-02-09T04:10:00.000Z',
    cameraId: 'cam-07',
    description: 'Camera went offline briefly; connectivity restored automatically.',
  },
  {
    id: 'inc-004',
    title: 'Perimeter Breach Alarm',
    severity: 'critical',
    status: 'acknowledged',
    timestamp: '2026-02-10T02:30:00.000Z',
    location: 'Fence Line A',
    description: 'Fence vibration sensor threshold exceeded; patrol scheduled to verify.',
  },
]

const initialState: IncidentState = {
  incidents: new Map(seedIncidents.map((i) => [i.id, i])),
  selectedIncidentId: null,
  filters: {},
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useIncidentStore = create<IncidentState & IncidentActions>((set, get) => ({
  ...initialState,

  addIncident: (incident: Incident) =>
    set((state) => {
      const next = new Map(state.incidents)
      next.set(incident.id, incident)
      return { incidents: next }
    }),

  updateIncident: (id: string, partial: Partial<Incident>) =>
    set((state) => {
      const existing = state.incidents.get(id)
      if (!existing) return state

      const next = new Map(state.incidents)
      next.set(id, { ...existing, ...partial, id: existing.id })
      return { incidents: next }
    }),

  setSelectedIncident: (id: string | null) =>
    set({
      selectedIncidentId: id,
    }),

  setFilter: (partial: Partial<IncidentFilters>) =>
    set((state) => ({
      filters: {
        ...state.filters,
        ...partial,
      },
    })),

  getFilteredIncidents: () => {
    const { incidents, filters } = get()
    const list = Array.from(incidents.values())

    const filtered = list.filter((i) => {
      if (filters.severity && i.severity !== filters.severity) return false
      if (filters.status && i.status !== filters.status) return false
      return true
    })

    filtered.sort(compareIncidents)
    return filtered
  },
}))

export type IncidentStore = typeof useIncidentStore
