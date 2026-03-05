'use client'

import { type ReactNode, useMemo, useState } from 'react'
import { useCameraSourceStore } from '@/lib/stores/camera-source-store'
import type { CameraSource, CameraSourceKind } from '@/lib/types/camera'

type KindFilter = 'all' | 'sim' | 'cctv'

export interface CameraSourcePickerProps {
  selectedSourceIds: string[]
  onSelectionChange: (sourceIds: string[]) => void
  maxSelected?: number
  sources?: CameraSource[]
}

function badgeColor(kind: CameraSourceKind): string {
  if (kind === 'sim') return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
  if (kind === 'cctv') return 'bg-blue-500/20 text-blue-300 border-blue-500/40'
  return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
}

function statusDotColor(status: CameraSource['status']): string {
  if (status === 'online') return 'bg-green-500'
  if (status === 'offline') return 'bg-red-500'
  return 'bg-gray-500'
}

export function CameraSourcePicker({
  selectedSourceIds,
  onSelectionChange,
  maxSelected = 4,
  sources,
}: CameraSourcePickerProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const storeSourcesMap = useCameraSourceStore((state) => state.sources)

  const storeSources = useMemo(() => Array.from(storeSourcesMap.values()), [storeSourcesMap])

  const allSources = useMemo(() => {
    const merged = new Map<string, CameraSource>()
    for (const source of storeSources) {
      merged.set(source.id, source)
    }
    for (const source of sources ?? []) {
      merged.set(source.id, source)
    }
    return Array.from(merged.values())
  }, [storeSources, sources])

  const filteredSources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return allSources.filter((source) => {
      if (kindFilter !== 'all' && source.kind !== kindFilter) {
        return false
      }

      if (!normalizedQuery) {
        return true
      }

      const haystack = `${source.name} ${source.tags.join(' ')}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [allSources, kindFilter, query])

  const toggleSource = (sourceId: string): void => {
    const isSelected = selectedSourceIds.includes(sourceId)
    if (isSelected) {
      onSelectionChange(selectedSourceIds.filter((id) => id !== sourceId))
      return
    }

    if (selectedSourceIds.length >= maxSelected) {
      return
    }

    onSelectionChange([...selectedSourceIds, sourceId])
  }

  const selectedCount = selectedSourceIds.length

  return (
    <div className="relative w-full sm:w-auto">
      <button
        type="button"
        className="w-full sm:w-auto px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-colors"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
      >
        Sources ({selectedCount}/{maxSelected})
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-1 w-full sm:w-[380px] bg-[#0d1117] border border-[#1f2937] rounded-md shadow-lg shadow-black/50 p-2">
          <div className="flex items-center gap-1 mb-2">
            {(['all', 'sim', 'cctv'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setKindFilter(filter)}
                className={`px-2 py-1 text-[10px] uppercase font-mono rounded border transition-colors ${
                  kindFilter === filter
                    ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                    : 'border-[#2a3440] bg-[#111827] text-[#7e8a9a] hover:border-cyan-500/30'
                }`}
              >
                {filter === 'all' ? 'All' : filter === 'sim' ? 'Sim' : 'CCTV'}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or tag"
            className="w-full mb-2 px-2 py-1 text-[11px] font-mono bg-[#0b1220] border border-[#2a3440] rounded text-[#cbd5e1] placeholder:text-[#4b5563] focus:outline-none focus:border-cyan-500/50"
          />

          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredSources.length === 0 && (
              <div className="px-2 py-3 text-center text-[10px] uppercase font-mono tracking-wider text-[#5b6472]">
                No matching sources
              </div>
            )}

            {filteredSources.map((source) => {
              const isSelected = selectedSourceIds.includes(source.id)
              const isDisabled = !isSelected && selectedSourceIds.length >= maxSelected

              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => toggleSource(source.id)}
                  disabled={isDisabled}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded border text-left transition-colors ${
                    isSelected
                      ? 'border-cyan-500/50 bg-cyan-500/15'
                      : 'border-[#202938] bg-[#0b1220] hover:border-[#334155]'
                  } ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="min-w-0">
                    <div className="text-[11px] text-[#d1d5db] font-mono truncate">
                      {source.name}
                    </div>
                    <div className="text-[9px] text-[#64748b] font-mono truncate">
                      {source.tags.join(', ')}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 ml-2">
                    <span className={`h-2 w-2 rounded-full ${statusDotColor(source.status)}`} />
                    <span
                      className={`px-1.5 py-0.5 text-[8px] font-mono uppercase rounded border ${badgeColor(source.kind)}`}
                    >
                      {source.kind}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
