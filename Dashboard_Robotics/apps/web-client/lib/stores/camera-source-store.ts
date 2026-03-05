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
  /** Whether source fetch is currently in progress */
  isLoading: boolean
  /** Last successful fetch timestamp (ms) */
  lastFetchedAt: number | null
  /** Last fetch error message */
  error: string | null
  /** Active polling interval */
  pollingIntervalId: ReturnType<typeof setInterval> | null
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

  /** Fetch camera sources from backend API */
  fetchSources: () => Promise<void>

  /** Start periodic source polling */
  startPolling: (intervalMs?: number) => void

  /** Stop periodic source polling */
  stopPolling: () => void

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

interface BackendCameraSource {
  id: string
  slug: string
  name: string
  type: string
  url: string
  status: string
  go2rtcStream?: string | null
  metadata?: {
    tags?: string[]
  }
}

interface BackendCameraSourcesResponse {
  sources: BackendCameraSource[]
}

function mapBackendStatus(status: string): CameraSourceStatus {
  if (status === 'healthy') return 'online'
  if (status === 'unhealthy' || status === 'degraded') return 'offline'
  return 'unknown'
}

function mapBackendKind(type: string): CameraSource['kind'] {
  if (type === 'rtsp-isaac') return 'sim'
  if (type === 'rtsp-physical') return 'cctv'
  return 'usb'
}

function mapBackendSource(source: BackendCameraSource): CameraSource {
  const tags = [...(source.metadata?.tags ?? [])]
  if (source.slug && !tags.includes(source.slug)) {
    tags.push(source.slug)
  }

  return {
    id: source.id,
    name: source.name,
    kind: mapBackendKind(source.type),
    streamUrl: source.url,
    webrtcCapable: Boolean(source.go2rtcStream),
    tags,
    status: mapBackendStatus(source.status),
  }
}

function resolveSourcesApiUrl(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_WS_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  return baseUrl ? `${baseUrl}/api/cameras/sources` : '/api/cameras/sources'
}

// =============================================================================
// Store
// =============================================================================

export const useCameraSourceStore = create<CameraSourceState & CameraSourceActions>((set, get) => ({
  sources: buildInitialMap(),
  isLoading: false,
  lastFetchedAt: null,
  error: null,
  pollingIntervalId: null,

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

  fetchSources: async () => {
    set({ isLoading: true, error: null })
    try {
      const response = await fetch(resolveSourcesApiUrl())
      if (!response.ok) {
        throw new Error(`Failed to fetch camera sources: ${response.status}`)
      }

      const payload = (await response.json()) as BackendCameraSourcesResponse
      const sources = (payload.sources ?? []).map(mapBackendSource)
      get().setSources(sources)
      set({ isLoading: false, error: null, lastFetchedAt: Date.now() })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch camera sources'
      set({ isLoading: false, error: message })
    }
  },

  startPolling: (intervalMs = 10_000) => {
    const activeInterval = get().pollingIntervalId
    if (activeInterval) {
      clearInterval(activeInterval)
    }

    const intervalId = setInterval(() => {
      void get().fetchSources()
    }, intervalMs)
    set({ pollingIntervalId: intervalId })
  },

  stopPolling: () => {
    const activeInterval = get().pollingIntervalId
    if (activeInterval) {
      clearInterval(activeInterval)
      set({ pollingIntervalId: null })
    }
  },

  getSource: (id: string) => get().sources.get(id),

  getAllSources: () => Array.from(get().sources.values()),

  getByKind: (kind: CameraSource['kind']) =>
    Array.from(get().sources.values()).filter((s) => s.kind === kind),

  getByTag: (tag: string) => Array.from(get().sources.values()).filter((s) => s.tags.includes(tag)),

  reset: () => {
    const activeInterval = get().pollingIntervalId
    if (activeInterval) {
      clearInterval(activeInterval)
    }
    set({
      sources: buildInitialMap(),
      isLoading: false,
      lastFetchedAt: null,
      error: null,
      pollingIntervalId: null,
    })
  },
}))

export type CameraSourceStore = typeof useCameraSourceStore
