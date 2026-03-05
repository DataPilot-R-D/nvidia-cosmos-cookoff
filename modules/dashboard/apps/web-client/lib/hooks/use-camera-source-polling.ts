import { useEffect, useMemo } from 'react'
import { useCameraSourceStore } from '@/lib/stores/camera-source-store'
import type { CameraSource } from '@/lib/types/camera'

export interface UseCameraSourcePollingResult {
  isLoading: boolean
  error: string | null
  sources: CameraSource[]
  lastFetchedAt: number | null
}

export function useCameraSourcePolling(): UseCameraSourcePollingResult {
  const sourcesMap = useCameraSourceStore((state) => state.sources)
  const isLoading = useCameraSourceStore((state) => state.isLoading)
  const error = useCameraSourceStore((state) => state.error)
  const lastFetchedAt = useCameraSourceStore((state) => state.lastFetchedAt)
  const fetchSources = useCameraSourceStore((state) => state.fetchSources)
  const startPolling = useCameraSourceStore((state) => state.startPolling)
  const stopPolling = useCameraSourceStore((state) => state.stopPolling)

  useEffect(() => {
    void fetchSources()
    startPolling(10_000)
    return () => {
      stopPolling()
    }
  }, [fetchSources, startPolling, stopPolling])

  const sources = useMemo(() => Array.from(sourcesMap.values()), [sourcesMap])

  return {
    isLoading,
    error,
    sources,
    lastFetchedAt,
  }
}
