/**
 * DropZone Component
 *
 * Invisible overlay that handles drag & drop from Toolbox.
 * Captures drop events and creates widgets at the drop position.
 *
 * Features:
 * - Visual feedback during drag
 * - Grid position calculation
 * - Module type validation
 * - Accessible announcements
 *
 * @see Toolbox, grid-config
 */

'use client'

import { useState, useCallback, useRef, type ReactNode, type DragEvent } from 'react'

import { useTabStore } from '@/lib/stores'
import { isValidModuleType } from '@/components/widgets'
import {
  calculateGridX,
  calculateGridY,
  clampGridX,
  clampGridY,
  DEFAULT_COLS,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_WIDGET_SIZE,
} from './grid-config'

// =============================================================================
// Types
// =============================================================================

export interface DropZoneProps {
  /** Callback when widget is dropped with position */
  onDropWithPosition?: (data: DropData) => void
  /** Optional custom className */
  className?: string
  /** Number of columns in the grid */
  cols?: number
  /** Row height in pixels */
  rowHeight?: number
}

export interface DropData {
  moduleType: string
  x: number
  y: number
}

interface PreviewPosition {
  x: number
  y: number
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate unique widget ID
 */
function generateWidgetId(): string {
  return `widget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

// =============================================================================
// Component
// =============================================================================

export function DropZone({
  onDropWithPosition,
  className = '',
  cols = DEFAULT_COLS.lg,
  rowHeight = DEFAULT_ROW_HEIGHT,
}: DropZoneProps): ReactNode {
  const [isDragActive, setIsDragActive] = useState(false)
  const [previewPosition, setPreviewPosition] = useState<PreviewPosition | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Store selectors
  const activeTabId = useTabStore((state) => state.activeTabId)
  const addWidget = useTabStore((state) => state.addWidget)

  // Handle drag enter
  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (e.dataTransfer.types.includes('moduleType')) {
      setIsDragActive(true)
    }
  }, [])

  // Handle drag over - update preview position
  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'

      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const containerWidth = rect.width

      // Calculate grid position
      let gridX = calculateGridX(e.clientX, rect.left, containerWidth, cols)
      let gridY = calculateGridY(e.clientY, rect.top, rowHeight)

      // Clamp to valid range
      gridX = clampGridX(gridX, cols, DEFAULT_WIDGET_SIZE.w)
      gridY = clampGridY(gridY)

      setPreviewPosition({ x: gridX, y: gridY })
    },
    [cols, rowHeight]
  )

  // Handle drag leave
  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    // Only deactivate if leaving the actual drop zone
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragActive(false)
      setPreviewPosition(null)
    }
  }, [])

  // Handle drop
  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragActive(false)
      setPreviewPosition(null)

      const moduleType = e.dataTransfer.getData('moduleType')

      // Validate module type
      if (!moduleType || !isValidModuleType(moduleType)) {
        return
      }

      if (!containerRef.current || !activeTabId) return

      const rect = containerRef.current.getBoundingClientRect()
      const containerWidth = rect.width

      // Calculate grid position
      let gridX = calculateGridX(e.clientX, rect.left, containerWidth, cols)
      let gridY = calculateGridY(e.clientY, rect.top, rowHeight)

      // Clamp to valid range
      gridX = clampGridX(gridX, cols, DEFAULT_WIDGET_SIZE.w)
      gridY = clampGridY(gridY)

      // Create widget with position
      const widgetId = generateWidgetId()

      // Add widget to store
      addWidget(activeTabId, {
        id: widgetId,
        moduleType,
      })

      // Callback with position data
      onDropWithPosition?.({
        moduleType,
        x: gridX,
        y: gridY,
      })
    },
    [activeTabId, addWidget, cols, rowHeight, onDropWithPosition]
  )

  // Calculate preview dimensions in pixels
  const getPreviewStyle = useCallback(() => {
    if (!previewPosition || !containerRef.current) return {}

    const rect = containerRef.current.getBoundingClientRect()
    const colWidth = rect.width / cols
    const margin = 8 // DEFAULT_MARGIN

    return {
      left: `${previewPosition.x * colWidth + margin}px`,
      top: `${previewPosition.y * rowHeight + margin}px`,
      width: `${DEFAULT_WIDGET_SIZE.w * colWidth - margin * 2}px`,
      height: `${DEFAULT_WIDGET_SIZE.h * rowHeight - margin * 2}px`,
    }
  }, [previewPosition, cols, rowHeight])

  return (
    <div
      ref={containerRef}
      className={`
        absolute inset-0 z-10
        ${isDragActive ? 'drag-active bg-orange-500/10' : 'bg-transparent'}
        pointer-events-auto transition-colors duration-200
        ${className}
      `}
      data-testid="drop-zone"
      role="region"
      aria-label="Drop zone for widgets"
      aria-dropeffect={isDragActive ? 'copy' : 'none'}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop Preview Ghost */}
      {isDragActive && previewPosition && (
        <div
          className="absolute border-2 border-dashed border-orange-500 bg-orange-500/20 rounded pointer-events-none"
          style={getPreviewStyle()}
          data-testid="drop-preview"
          aria-hidden="true"
        />
      )}

      {/* Screen Reader Announcement */}
      {isDragActive && (
        <div className="sr-only" role="status" aria-live="polite">
          Drop zone active. Release to create widget at position{' '}
          {previewPosition
            ? `column ${previewPosition.x}, row ${previewPosition.y}`
            : 'current cursor location'}
          .
        </div>
      )}
    </div>
  )
}

export default DropZone
