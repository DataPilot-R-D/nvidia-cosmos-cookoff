/**
 * Toolbox Component
 *
 * Sidebar panel with draggable module items.
 * Users can drag modules from here and drop them onto the grid.
 *
 * Features:
 * - Drag & Drop API integration
 * - Visual feedback during drag
 * - Accessible keyboard navigation
 * - Collapsed/expanded states
 *
 * @see Liquid Glass Design System
 */

'use client'

import { useState, useCallback, type ReactNode, type DragEvent, type KeyboardEvent } from 'react'

import { getAllModuleDefinitions, type ModuleDefinition } from '@/components/widgets'

// =============================================================================
// Types
// =============================================================================

export interface ToolboxProps {
  /** Whether the toolbox is collapsed (icons only) */
  isCollapsed?: boolean
  /** Optional custom className */
  className?: string
  /** Callback when a module is clicked (click-to-add fallback) */
  onAddModule?: (moduleType: string) => void
}

// =============================================================================
// Module Icons
// =============================================================================

/**
 * Get icon for module type
 */
function getModuleIcon(type: string): ReactNode {
  switch (type) {
    case 'robot-status':
      return (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="11" width="18" height="10" rx="2" />
          <circle cx="8.5" cy="16" r="1.5" />
          <circle cx="15.5" cy="16" r="1.5" />
          <path d="M12 3v4M8 7h8" />
          <path d="M9 11V8a3 3 0 016 0v3" />
        </svg>
      )
    case 'ai-chat':
      return (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
        </svg>
      )
    case 'camera':
      return (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      )
    case 'map-3d':
      return (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      )
    case 'map-2d':
      return (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
      )
    case 'lidar':
      return (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="6" />
          <circle cx="12" cy="12" r="2" />
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
        </svg>
      )
    case 'controls':
      return (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <circle cx="8" cy="12" r="3" />
          <line x1="14" y1="8" x2="20" y2="8" />
          <line x1="14" y1="12" x2="20" y2="12" />
          <line x1="14" y1="16" x2="20" y2="16" />
        </svg>
      )
    default:
      return (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
      )
  }
}

// =============================================================================
// Component
// =============================================================================

export function Toolbox({
  isCollapsed = false,
  className = '',
  onAddModule,
}: ToolboxProps): ReactNode {
  const [draggingItem, setDraggingItem] = useState<string | null>(null)

  const modules = getAllModuleDefinitions()

  // Handle drag start
  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, module: ModuleDefinition) => {
    e.dataTransfer.setData('moduleType', module.type)
    e.dataTransfer.effectAllowed = 'copy'

    // Create custom drag image
    const dragImage = document.createElement('div')
    dragImage.className = 'toolbox-drag-ghost'
    dragImage.textContent = module.label
    dragImage.style.cssText = `
        position: absolute;
        top: -1000px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
      `
    document.body.appendChild(dragImage)
    e.dataTransfer.setDragImage(dragImage, 0, 0)
    setTimeout(() => document.body.removeChild(dragImage), 0)

    setDraggingItem(module.type)
  }, [])

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggingItem(null)
  }, [])

  // Handle keyboard activation (Enter/Space to start drag simulation)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>, _module: ModuleDefinition) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        // For keyboard users, we could trigger a modal or direct add
        // For now, we'll just focus the next item
        const target = e.currentTarget
        const nextSibling = target.nextElementSibling as HTMLElement
        if (nextSibling) {
          nextSibling.focus()
        }
      }
    },
    []
  )

  return (
    <div
      className={`toolbox ${isCollapsed ? 'collapsed' : ''} ${className}`}
      data-testid="toolbox"
      role="list"
      aria-label="Available widgets"
    >
      {/* Header */}
      <div className="toolbox-header px-3 py-2 border-b border-white/10">
        <span
          className={`text-xs text-white/60 uppercase tracking-wider font-semibold ${isCollapsed ? 'hidden' : ''}`}
        >
          Toolbox
        </span>
        {isCollapsed && (
          <svg
            className="w-4 h-4 text-white/60 mx-auto"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M9 21V9" />
          </svg>
        )}
      </div>

      {/* Module Items */}
      <div className="toolbox-items space-y-1 p-2">
        {modules.map((module) => (
          <div
            key={module.type}
            className={`
              toolbox-item flex items-center gap-3 p-2 rounded cursor-grab
              hover:bg-white/10 transition-colors
              ${draggingItem === module.type ? 'dragging opacity-50' : ''}
              ${isCollapsed ? 'justify-center' : ''}
            `}
            data-testid={`toolbox-item-${module.type}`}
            data-module-type={module.type}
            draggable="true"
            onDragStart={(e) => handleDragStart(e, module)}
            onDragEnd={handleDragEnd}
            onClick={() => onAddModule?.(module.type)}
            onKeyDown={(e) => handleKeyDown(e, module)}
            role="listitem"
            tabIndex={0}
            title={module.description}
            aria-grabbed={draggingItem === module.type}
          >
            {/* Icon */}
            <span className="toolbox-item-icon text-orange-400">{getModuleIcon(module.type)}</span>

            {/* Label (hidden when collapsed) */}
            {!isCollapsed && (
              <span className="toolbox-item-label text-sm text-white truncate">{module.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default Toolbox
