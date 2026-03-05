'use client'

/**
 * CameraWallModule Component
 *
 * SOC-style Camera Wall widget: 2x2 grid of camera feeds with overlays.
 * Supports focus mode (click tile → enlarged view + mini-strip).
 * Camera selection persisted to localStorage.
 * Max 4 concurrent WebRTC connections (guardrail).
 *
 * Sources use naming convention:
 * - sim.<scene>.<name> for Isaac Sim cameras
 * - cctv.<site>.<name> for real CCTV cameras
 */

import { type ReactNode, useState, useCallback, useEffect, useMemo } from 'react'
import { useCameraStore } from '@/lib/stores/camera-store'
import { useCameraSourcePolling } from '@/lib/hooks/use-camera-source-polling'
import { CameraTile, type CameraSource as TileCameraSource } from './camera-wall/CameraTile'
import { CameraWallToolbar, type WallLayout } from './camera-wall/CameraWallToolbar'
import { CameraSourcePicker } from './camera-wall/CameraSourcePicker'
import type { ModuleProps } from './ModuleRegistry'
import type { CameraSource } from '@/lib/types/camera'

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'camera-wall-selection'
const MAX_CONCURRENT = 4

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build CameraSource list from camera store entities.
 * Classifies cameras as sim or cctv based on ID/name conventions.
 */
function buildCameraStoreSources(
  cameras: Map<string, import('@workspace/shared-types').CameraEntity>
): CameraSource[] {
  return Array.from(cameras.values()).map((cam) => {
    const isSimulation =
      cam.id.startsWith('sim.') ||
      cam.id.startsWith('isaac') ||
      cam.name.toLowerCase().includes('sim') ||
      cam.name.toLowerCase().includes('isaac') ||
      cam.topic?.includes('/isaac/')
    return {
      id: cam.id,
      name: cam.name,
      kind: isSimulation ? 'sim' : 'cctv',
      streamUrl: cam.topic ?? cam.id,
      webrtcCapable: Boolean(cam.webrtcEnabled || cam.capabilities.supportsWebRTC),
      tags: [],
      status: 'unknown',
    } satisfies CameraSource
  })
}

/**
 * Load selected source IDs from localStorage
 */
function loadSelection(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string')
    }
  } catch {
    /* ignore */
  }
  return []
}

/**
 * Save selected source IDs to localStorage
 */
function saveSelection(ids: string[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

// =============================================================================
// Main Component
// =============================================================================

export function CameraWallModule({ windowId }: ModuleProps): ReactNode {
  const camerasMap = useCameraStore((state) => state.cameras)
  const { sources: polledSources, lastFetchedAt } = useCameraSourcePolling()

  const availableSources = useMemo(() => {
    const merged = new Map<string, CameraSource>()

    for (const source of buildCameraStoreSources(camerasMap)) {
      merged.set(source.id, source)
    }

    if (lastFetchedAt !== null) {
      for (const source of polledSources) {
        merged.set(source.id, source)
      }
    }

    return Array.from(merged.values())
  }, [camerasMap, polledSources, lastFetchedAt])

  const tileSources = useMemo(() => {
    return availableSources.map(
      (source): TileCameraSource => ({
        id: source.id,
        name: source.name,
        cameraId: source.id,
        type: source.kind === 'sim' ? 'sim' : 'cctv',
      })
    )
  }, [availableSources])

  // Selection state (persisted)
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>(() => loadSelection())
  const [layout, setLayout] = useState<WallLayout>('2x2')
  const [focusedSourceId, setFocusedSourceId] = useState<string | null>(null)

  // Persist selection
  useEffect(() => {
    saveSelection(selectedSourceIds)
  }, [selectedSourceIds])

  // Auto-select first cameras if nothing selected and cameras become available
  useEffect(() => {
    if (selectedSourceIds.length === 0 && availableSources.length > 0) {
      const autoSelect = availableSources.slice(0, MAX_CONCURRENT).map((s) => s.id)
      setSelectedSourceIds(autoSelect)
    }
  }, [availableSources]) // eslint-disable-line react-hooks/exhaustive-deps -- one-shot init: only auto-select when sources first appear, not when user changes selection

  // Filter out stale selections
  const validSelectedIds = useMemo(() => {
    const availableIds = new Set(tileSources.map((s) => s.id))
    return selectedSourceIds.filter((id) => availableIds.has(id))
  }, [selectedSourceIds, tileSources])

  // Sources to display
  const displaySources = useMemo(() => {
    return validSelectedIds
      .map((id) => tileSources.find((s) => s.id === id))
      .filter((s): s is TileCameraSource => s !== undefined)
  }, [validSelectedIds, tileSources])

  // Handlers
  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedSourceIds(ids.slice(0, MAX_CONCURRENT))
  }, [])

  const handleTileClick = useCallback((sourceId: string) => {
    setFocusedSourceId(sourceId)
  }, [])

  const handleExitFocus = useCallback(() => {
    setFocusedSourceId(null)
  }, [])

  // Focused source
  const focusedSource = focusedSourceId
    ? (displaySources.find((s) => s.id === focusedSourceId) ?? null)
    : null

  // No cameras placeholder
  if (availableSources.length === 0) {
    return (
      <div
        className="h-full flex flex-col bg-[#0d0f11]"
        data-testid={`module-camera-wall-${windowId}`}
      >
        <div className="flex-1 flex flex-col items-center justify-center gap-2">
          <div className="text-4xl text-[#333333]">📹</div>
          <span className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">
            Camera Wall
          </span>
          <span className="text-[9px] text-[#444444] text-center max-w-[220px]">
            Waiting for camera sources (Isaac Sim / CCTV)
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="h-full flex flex-col bg-[#0d0f11]"
      data-testid={`module-camera-wall-${windowId}`}
      aria-label="Camera Wall"
    >
      {/* Toolbar */}
      <CameraWallToolbar
        layout={layout}
        onLayoutChange={setLayout}
        availableSources={tileSources}
        selectedSourceIds={validSelectedIds}
        onSelectionChange={handleSelectionChange}
        hasFocus={focusedSource !== null}
        onExitFocus={handleExitFocus}
        sourcePicker={
          <CameraSourcePicker
            selectedSourceIds={validSelectedIds}
            onSelectionChange={handleSelectionChange}
            sources={availableSources}
          />
        }
      />

      {/* Content area */}
      <div className="flex-1 min-h-0 p-1">
        {focusedSource ? (
          /* Focus mode: large camera + mini-strip */
          <div className="h-full flex flex-col gap-1">
            {/* Main focused view */}
            <div className="flex-1 min-h-0">
              <CameraTile source={focusedSource} isFocused onClick={handleExitFocus} enabled />
            </div>
            {/* Mini strip of other cameras */}
            {displaySources.length > 1 && (
              <div className="flex gap-1 h-[80px] flex-shrink-0">
                {displaySources
                  .filter((s) => s.id !== focusedSourceId)
                  .map((source, idx) => (
                    <div key={source.id} className="flex-1 min-w-0">
                      <CameraTile
                        source={source}
                        onClick={handleTileClick}
                        enabled={idx < MAX_CONCURRENT - 1}
                      />
                    </div>
                  ))}
              </div>
            )}
          </div>
        ) : layout === '2x2' ? (
          /* 2x2 Grid */
          <div className="h-full grid grid-cols-2 grid-rows-2 gap-1">
            {displaySources.slice(0, 4).map((source, idx) => (
              <CameraTile
                key={source.id}
                source={source}
                onClick={handleTileClick}
                enabled={idx < MAX_CONCURRENT}
              />
            ))}
            {/* Fill empty slots */}
            {displaySources.length < 4 &&
              Array.from({ length: 4 - displaySources.length }).map((_, i) => (
                <div
                  key={`empty-${i}`}
                  className="bg-[#0a0c0e] border border-[#1a1a1a] rounded flex items-center justify-center"
                >
                  <span className="text-[9px] text-[#333333] font-mono uppercase">No Source</span>
                </div>
              ))}
          </div>
        ) : (
          /* 1x1 single view */
          <div className="h-full">
            {displaySources.length > 0 ? (
              <CameraTile source={displaySources[0]} onClick={handleTileClick} enabled />
            ) : (
              <div className="h-full bg-[#0a0c0e] border border-[#1a1a1a] rounded flex items-center justify-center">
                <span className="text-[9px] text-[#333333] font-mono uppercase">
                  Select a source
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default CameraWallModule
