/**
 * Map Library Panel Component
 *
 * Panel for managing saved maps: list, save, load, delete, export.
 * Supports switching between SLAM and MapServer modes.
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useExplorationStore, type SavedMapMetadata } from '@/lib/stores/exploration-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'

// =============================================================================
// Types
// =============================================================================

interface MapLibraryPanelProps {
  onClose: () => void
}

// =============================================================================
// Sub-components
// =============================================================================

function MapThumbnail({ thumbnail, name }: { thumbnail?: string | null; name: string }) {
  if (!thumbnail) {
    return (
      <div className="w-16 h-16 bg-[#252525] rounded flex items-center justify-center text-[#555] text-[9px] font-mono">
        No preview
      </div>
    )
  }

  return (
    <Image
      src={`data:image/png;base64,${thumbnail}`}
      alt={`${name} thumbnail`}
      width={64}
      height={64}
      className="w-16 h-16 rounded object-cover"
      unoptimized
    />
  )
}

function ModeIndicator({ mode }: { mode: 'slam' | 'map_server' | 'none' }) {
  const config = {
    slam: { label: 'SLAM', color: 'bg-green-500', textColor: 'text-green-400' },
    map_server: { label: 'MapServer', color: 'bg-cyan-500', textColor: 'text-cyan-400' },
    none: { label: 'Idle', color: 'bg-gray-500', textColor: 'text-gray-400' },
  }[mode]

  return (
    <div className="flex items-center gap-2 text-[10px] font-mono">
      <div className={`w-2 h-2 rounded-full ${config.color}`} />
      <span className={config.textColor}>{config.label}</span>
    </div>
  )
}

function LoadingOverlay({ message }: { message: string | null }) {
  if (!message) return null

  return (
    <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 rounded-lg">
      <div className="text-center">
        <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <div className="text-[10px] text-cyan-400 font-mono">{message}</div>
      </div>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function MapLibraryPanel({ onClose }: MapLibraryPanelProps) {
  const [saveMapName, setSaveMapName] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Store state
  const savedMaps = useExplorationStore((s) => s.savedMaps)
  const loadSavedMaps = useExplorationStore((s) => s.loadSavedMaps)
  const saveCurrentMap = useExplorationStore((s) => s.saveCurrentMap)
  const deleteMap = useExplorationStore((s) => s.deleteMap)
  const mapServerMode = useExplorationStore((s) => s.mapServerMode)
  const mapLoadingStatus = useExplorationStore((s) => s.mapLoadingStatus)
  const mapLoadingMessage = useExplorationStore((s) => s.mapLoadingMessage)
  const mapLoadingError = useExplorationStore((s) => s.mapLoadingError)
  const loadedMapId = useExplorationStore((s) => s.loadedMapId)

  // WebSocket functions
  const socket = useWebSocketStore((s) => s.socket)

  // Load maps on mount
  useEffect(() => {
    loadSavedMaps()
  }, [loadSavedMaps])

  // Request current map mode on mount
  useEffect(() => {
    if (socket?.connected) {
      socket.emit('get_map_mode')
    }
  }, [socket])

  const handleSaveMap = useCallback(async () => {
    if (!saveMapName.trim()) return

    const mapId = await saveCurrentMap(saveMapName.trim())
    if (mapId) {
      setSaveMapName('')
    }
  }, [saveMapName, saveCurrentMap])

  const handleLoadMap = useCallback(
    (mapId: string) => {
      if (socket?.connected) {
        socket.emit('load_map_to_nav2', { mapId })
      }
    },
    [socket]
  )

  const handleStartSlam = useCallback(() => {
    if (socket?.connected) {
      socket.emit('start_slam')
    }
  }, [socket])

  const handleDeleteMap = useCallback(
    async (mapId: string) => {
      await deleteMap(mapId)
      setDeleteConfirmId(null)
    },
    [deleteMap]
  )

  const handleExportPgm = useCallback((mapId: string) => {
    // Reuse the same API base resolution as the exploration store.
    const envBase = process.env.NEXT_PUBLIC_API_BASE
    const apiBase = envBase
      ? envBase.replace(/\/$/, '')
      : `http://${window.location.hostname}:8081/api`

    window.open(`${apiBase}/maps/${mapId}/pgm`, '_blank')
  }, [])

  const handleExportYaml = useCallback((mapId: string) => {
    const envBase = process.env.NEXT_PUBLIC_API_BASE
    const apiBase = envBase
      ? envBase.replace(/\/$/, '')
      : `http://${window.location.hostname}:8081/api`

    window.open(`${apiBase}/maps/${mapId}/yaml`, '_blank')
  }, [])

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const isLoading = mapLoadingStatus === 'loading'

  return (
    <div className="absolute top-12 right-2 z-20 bg-[#1a1a1a]/95 rounded-lg p-3 w-[320px] max-h-[500px] border border-[#333333] shadow-lg overflow-hidden flex flex-col">
      {/* Loading Overlay */}
      {isLoading && <LoadingOverlay message={mapLoadingMessage} />}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-xs font-mono text-white uppercase tracking-wide">Saved Maps</h3>
          <ModeIndicator mode={mapServerMode} />
        </div>
        <button onClick={onClose} className="text-[#666] hover:text-white text-sm">
          &times;
        </button>
      </div>

      {/* Error Message */}
      {mapLoadingError && (
        <div className="mb-2 px-2 py-1.5 bg-red-900/30 border border-red-800 rounded text-[10px] text-red-400 font-mono">
          {mapLoadingError}
        </div>
      )}

      {/* Mode Switch Button */}
      {mapServerMode === 'map_server' && (
        <button
          onClick={handleStartSlam}
          disabled={isLoading}
          className="mb-3 w-full px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-green-800 disabled:opacity-50 text-white text-[10px] font-mono rounded transition-colors"
        >
          Start SLAM Mode
        </button>
      )}

      {/* Maps List */}
      <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[100px]">
        {savedMaps.length === 0 ? (
          <div className="text-center py-6 text-[#555] text-[10px] font-mono">
            No saved maps yet
          </div>
        ) : (
          savedMaps.map((map) => (
            <MapListItem
              key={map.id}
              map={map}
              isLoaded={loadedMapId === map.id}
              isLoading={isLoading}
              onLoad={() => handleLoadMap(map.id)}
              onDelete={() => setDeleteConfirmId(map.id)}
              onExportPgm={() => handleExportPgm(map.id)}
              onExportYaml={() => handleExportYaml(map.id)}
              formatDate={formatDate}
            />
          ))
        )}
      </div>

      {/* Save Current Map */}
      <div className="border-t border-[#333] pt-3">
        <div className="text-[9px] text-[#666] font-mono uppercase mb-1.5">Save Current Map</div>
        <div className="flex gap-2">
          <input
            type="text"
            value={saveMapName}
            onChange={(e) => setSaveMapName(e.target.value)}
            placeholder="Enter map name..."
            className="flex-1 px-2 py-1.5 bg-[#252525] border border-[#333] rounded text-[10px] text-white font-mono placeholder:text-[#555] focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={handleSaveMap}
            disabled={!saveMapName.trim() || isLoading}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 disabled:opacity-50 text-white text-[10px] font-mono rounded transition-colors"
          >
            Save
          </button>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <DeleteConfirmModal
          mapName={savedMaps.find((m) => m.id === deleteConfirmId)?.name || ''}
          onConfirm={() => handleDeleteMap(deleteConfirmId)}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}
    </div>
  )
}

// =============================================================================
// Map List Item
// =============================================================================

interface MapListItemProps {
  map: SavedMapMetadata
  isLoaded: boolean
  isLoading: boolean
  onLoad: () => void
  onDelete: () => void
  onExportPgm: () => void
  onExportYaml: () => void
  formatDate: (timestamp: number) => string
}

function MapListItem({
  map,
  isLoaded,
  isLoading,
  onLoad,
  onDelete,
  onExportPgm,
  onExportYaml,
  formatDate,
}: MapListItemProps) {
  const [showExport, setShowExport] = useState(false)

  return (
    <div
      className={`p-2 bg-[#252525] rounded border ${isLoaded ? 'border-cyan-500' : 'border-[#333]'} transition-colors`}
    >
      <div className="flex gap-2">
        {/* Thumbnail */}
        <MapThumbnail thumbnail={map.thumbnail} name={map.name} />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-white font-mono truncate">{map.name}</div>
            {isLoaded && (
              <span className="px-1 py-0.5 bg-cyan-900/50 text-cyan-400 text-[8px] font-mono rounded">
                LOADED
              </span>
            )}
          </div>
          <div className="text-[9px] text-[#666] font-mono mt-0.5">
            {map.width}x{map.height} | {map.resolution}m/px
          </div>
          <div className="text-[8px] text-[#555] font-mono">{formatDate(map.createdAt)}</div>
          {map.exploredPercent !== undefined && (
            <div className="text-[8px] text-green-500 font-mono">
              {map.exploredPercent.toFixed(1)}% explored
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-1 mt-2">
        <button
          onClick={onLoad}
          disabled={isLoading || isLoaded}
          className="flex-1 px-2 py-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-[#333] disabled:text-[#666] text-white text-[9px] font-mono rounded transition-colors"
        >
          Load
        </button>
        <button
          onClick={() => setShowExport(!showExport)}
          className="px-2 py-1 bg-[#333] hover:bg-[#444] text-white text-[9px] font-mono rounded transition-colors"
        >
          Export
        </button>
        <button
          onClick={onDelete}
          disabled={isLoading}
          className="px-2 py-1 bg-red-900/50 hover:bg-red-800/50 disabled:opacity-50 text-red-400 text-[9px] font-mono rounded transition-colors"
        >
          Del
        </button>
      </div>

      {/* Export Options */}
      {showExport && (
        <div className="flex gap-1 mt-1">
          <button
            onClick={onExportPgm}
            className="flex-1 px-2 py-1 bg-[#333] hover:bg-[#444] text-[#888] hover:text-white text-[8px] font-mono rounded transition-colors"
          >
            Download PGM
          </button>
          <button
            onClick={onExportYaml}
            className="flex-1 px-2 py-1 bg-[#333] hover:bg-[#444] text-[#888] hover:text-white text-[8px] font-mono rounded transition-colors"
          >
            Download YAML
          </button>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Delete Confirm Modal
// =============================================================================

interface DeleteConfirmModalProps {
  mapName: string
  onConfirm: () => void
  onCancel: () => void
}

function DeleteConfirmModal({ mapName, onConfirm, onCancel }: DeleteConfirmModalProps) {
  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20 rounded-lg">
      <div className="bg-[#252525] rounded-lg p-4 border border-[#333] max-w-[250px]">
        <div className="text-sm text-white mb-2">Delete map?</div>
        <div className="text-[10px] text-[#888] mb-3 font-mono truncate">{mapName}</div>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-[10px] font-mono rounded transition-colors"
          >
            Delete
          </button>
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-1.5 bg-[#333] hover:bg-[#444] text-white text-[10px] font-mono rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
