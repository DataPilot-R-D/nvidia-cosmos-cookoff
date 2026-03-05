/**
 * Camera Sources Store
 *
 * Zustand store for managing the camera source registry.
 * Initialized with DEFAULT_CAMERAS, can be updated at runtime
 * via discovery or manual config.
 *
 * @see T1.6 — Camera Sources store
 */

import { create } from 'zustand'
import { type CameraSource, type CameraSourceStatus } from '@/lib/types/camera'
import { DEFAULT_CAMERAS } from '@/lib/config/default-cameras'

// =============================================================================
// Types
// =============================================================================

export interface CameraSourceState {
  /** All registered camera sources (keyed by id for O(1) lookup) */
  sources: ReadonlyMap<string, CameraSource>
}

export interface CameraSourceActions {
  /** Add or update a camera source */
  upsertSource: (source: CameraSource) => void

  /** Remove a camera source by id */
  removeSource: (id: string) => void

  /** Update status of a camera source */
  setStatus: (id: string, status: CameraSourceStatus) => void

  /** Bulk replace all sources (e.g. from API response) */
  setSources: (sources: CameraSource[]) => void

  /** Get source by id */
  getSource: (id: string) => CameraSource | undefined

  /** Get all sources as array */
  getAllSources: () => CameraSource[]

  /** Get sources filtered by kind */
  getByKind: (kind: CameraSource['kind']) => CameraSource[]

  /** Get sources filtered by tag */
  getByTag: (tag: string) => CameraSource[]

  /** Reset to default cameras */
  reset: () => void
}

// =============================================================================
// Initial State
// =============================================================================

function buildInitialMap(): Map<string, CameraSource> {
  const map = new Map<string, CameraSource>()
  for (const cam of DEFAULT_CAMERAS) {
    map.set(cam.id, { ...cam })
  }
  return map
}

// =============================================================================
// Store
// =============================================================================

export const useCameraSourceStore = create<CameraSourceState & CameraSourceActions>((set, get) => ({
  sources: buildInitialMap(),

  upsertSource: (source: CameraSource) =>
    set((state) => {
      const next = new Map(state.sources)
      next.set(source.id, source)
      return { sources: next }
    }),

  removeSource: (id: string) =>
    set((state) => {
      const next = new Map(state.sources)
      next.delete(id)
      return { sources: next }
    }),

  setStatus: (id: string, status: CameraSourceStatus) =>
    set((state) => {
      const existing = state.sources.get(id)
      if (!existing) return state
      const next = new Map(state.sources)
      next.set(id, { ...existing, status })
      return { sources: next }
    }),

  setSources: (sources: CameraSource[]) =>
    set(() => {
      const map = new Map<string, CameraSource>()
      for (const s of sources) {
        map.set(s.id, s)
      }
      return { sources: map }
    }),

  getSource: (id: string) => get().sources.get(id),

  getAllSources: () => Array.from(get().sources.values()),

  getByKind: (kind: CameraSource['kind']) =>
    Array.from(get().sources.values()).filter((s) => s.kind === kind),

  getByTag: (tag: string) => Array.from(get().sources.values()).filter((s) => s.tags.includes(tag)),

  reset: () => set({ sources: buildInitialMap() }),
}))

export type CameraSourceStore = typeof useCameraSourceStore
