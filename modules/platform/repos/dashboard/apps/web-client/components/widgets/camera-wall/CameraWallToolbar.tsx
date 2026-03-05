'use client'

/**
 * CameraWallToolbar Component
 *
 * Toolbar for Camera Wall: layout switch + camera source selector.
 */

import { type ReactNode, useCallback } from 'react'
import type { CameraSource } from './CameraTile'

// =============================================================================
// Types
// =============================================================================

export type WallLayout = '2x2' | '1x1'

export interface CameraWallToolbarProps {
  /** Current layout */
  layout: WallLayout
  /** Layout change handler */
  onLayoutChange: (layout: WallLayout) => void
  /** All available camera sources */
  availableSources: CameraSource[]
  /** Currently selected source IDs */
  selectedSourceIds: string[]
  /** Selection change handler */
  onSelectionChange: (sourceIds: string[]) => void
  /** Whether a camera is focused */
  hasFocus: boolean
  /** Handler to exit focus mode */
  onExitFocus?: () => void
}

// =============================================================================
// Main Component
// =============================================================================

export function CameraWallToolbar({
  layout,
  onLayoutChange,
  availableSources,
  selectedSourceIds,
  onSelectionChange,
  hasFocus,
  onExitFocus,
}: CameraWallToolbarProps): ReactNode {
  const toggleSource = useCallback(
    (sourceId: string) => {
      const isSelected = selectedSourceIds.includes(sourceId)
      if (isSelected) {
        onSelectionChange(selectedSourceIds.filter((id) => id !== sourceId))
      } else {
        // Max 4 concurrent
        if (selectedSourceIds.length >= 4) return
        onSelectionChange([...selectedSourceIds, sourceId])
      }
    },
    [selectedSourceIds, onSelectionChange]
  )

  return (
    <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#222222] gap-2">
      {/* Left: Layout switcher + back button */}
      <div className="flex items-center gap-2">
        {hasFocus && onExitFocus && (
          <button
            type="button"
            onClick={onExitFocus}
            className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded
              bg-cyan-500/20 text-cyan-400 border border-cyan-500/50
              hover:bg-cyan-500/30 transition-colors"
          >
            ← Back to wall
          </button>
        )}

        {!hasFocus && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onLayoutChange('2x2')}
              className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors
                ${
                  layout === '2x2'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                    : 'bg-[#1a1f23] text-[#666666] border border-[#333333] hover:border-[#444444]'
                }`}
              aria-pressed={layout === '2x2'}
              title="2x2 Grid"
            >
              ⊞ 2×2
            </button>
            <button
              type="button"
              onClick={() => onLayoutChange('1x1')}
              className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors
                ${
                  layout === '1x1'
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                    : 'bg-[#1a1f23] text-[#666666] border border-[#333333] hover:border-[#444444]'
                }`}
              aria-pressed={layout === '1x1'}
              title="Single view"
            >
              □ 1×1
            </button>
          </div>
        )}
      </div>

      {/* Right: Source selector */}
      <div className="flex items-center gap-1 overflow-x-auto">
        <span className="text-[8px] text-[#444444] font-mono uppercase tracking-wider mr-1 flex-shrink-0">
          Sources ({selectedSourceIds.length}/4):
        </span>
        {availableSources.map((source) => {
          const isSelected = selectedSourceIds.includes(source.id)
          return (
            <button
              key={source.id}
              type="button"
              onClick={() => toggleSource(source.id)}
              className={`px-1.5 py-0.5 text-[8px] font-mono rounded transition-colors flex-shrink-0
                ${
                  isSelected
                    ? source.type === 'sim'
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                    : 'bg-[#1a1f23] text-[#555555] border border-[#333333] hover:border-[#444444]'
                }
                ${!isSelected && selectedSourceIds.length >= 4 ? 'opacity-50 cursor-not-allowed' : ''}
              `}
              disabled={!isSelected && selectedSourceIds.length >= 4}
              title={`${source.name} (${source.type})`}
            >
              {source.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default CameraWallToolbar
