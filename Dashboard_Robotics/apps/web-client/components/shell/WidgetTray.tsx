/**
 * WidgetTray Component
 *
 * FAB button with draggable widget tray.
 * Users click FAB to open tray, then drag modules onto the grid.
 *
 * Features:
 * - FAB toggle opens/closes tray
 * - Draggable module items
 * - Glass styling
 * - Escape to close
 * - Accessible (ARIA attributes)
 *
 * @see Liquid Glass Design System
 */

'use client'

import { useState, useCallback, useEffect, useRef, type ReactNode, type DragEvent } from 'react'

import {
  getAllModuleDefinitions,
  isValidModuleType,
  type ModuleDefinition,
} from '@/components/widgets'
import { useTabStore } from '@/lib/stores'

// =============================================================================
// Types
// =============================================================================

export interface WidgetTrayProps {
  /** Optional custom className */
  className?: string
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

export function WidgetTray({ className = '' }: WidgetTrayProps): ReactNode {
  const [isOpen, setIsOpen] = useState(false)
  const [draggingItem, setDraggingItem] = useState<string | null>(null)
  const trayRef = useRef<HTMLDivElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)

  const modules = getAllModuleDefinitions()

  // Store selectors for click-to-add
  const activeTabId = useTabStore((state) => state.activeTabId)
  const addWidget = useTabStore((state) => state.addWidget)

  // Click-to-add handler
  const handleClickAdd = useCallback(
    (module: ModuleDefinition) => {
      if (!activeTabId || !isValidModuleType(module.type)) return
      const widgetId = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      addWidget(activeTabId, { id: widgetId, moduleType: module.type })
    },
    [activeTabId, addWidget]
  )

  // Toggle tray visibility
  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  // Close tray on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        trayRef.current &&
        !trayRef.current.contains(event.target as Node) &&
        fabRef.current &&
        !fabRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen])

  // Handle drag start
  const handleDragStart = useCallback((e: DragEvent<HTMLDivElement>, module: ModuleDefinition) => {
    e.dataTransfer.setData('moduleType', module.type)
    e.dataTransfer.effectAllowed = 'copy'

    // Create custom drag image
    const dragImage = document.createElement('div')
    dragImage.className = 'widget-tray-drag-ghost'
    dragImage.textContent = module.label
    dragImage.style.cssText = `
        position: absolute;
        top: -1000px;
        background: rgba(249, 115, 22, 0.9);
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 600;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
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

  return (
    <>
      {/* FAB Button */}
      <button
        ref={fabRef}
        className={`fab-add-panel bg-orange-500 fixed bottom-6 right-6 ${className}`}
        onClick={handleToggle}
        data-testid="fab-add-panel"
        aria-label="Add panel"
        aria-expanded={isOpen}
      >
        <svg
          className={`w-6 h-6 text-white transition-transform ${isOpen ? 'rotate-45' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {/* Widget Tray */}
      {isOpen && (
        <div
          ref={trayRef}
          className="fixed bottom-24 right-6 glass-dark border border-white/12 rounded-lg shadow-2xl z-50 overflow-hidden"
          data-testid="widget-tray"
          role="menu"
          aria-label="Widget tray"
        >
          {/* Tray Header */}
          <div className="px-4 py-3 border-b border-white/10">
            <span className="text-xs text-white/60 uppercase tracking-wider font-semibold">
              Drag to Add
            </span>
          </div>

          {/* Module Grid */}
          <div className="p-3 grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
            {modules.map((module) => (
              <div
                key={module.type}
                className={`
                  tray-item flex flex-col items-center gap-2 p-3 rounded-lg cursor-grab
                  bg-white/5 hover:bg-white/10 transition-colors
                  border border-transparent hover:border-white/20
                  ${draggingItem === module.type ? 'dragging opacity-50 scale-95' : ''}
                `}
                data-testid={`tray-item-${module.type}`}
                data-module-type={module.type}
                draggable="true"
                onClick={() => handleClickAdd(module)}
                onDragStart={(e) => handleDragStart(e, module)}
                onDragEnd={handleDragEnd}
                title={module.description}
                aria-label={`Click or drag ${module.label} widget`}
                role="menuitem"
              >
                {/* Icon */}
                <span className="text-orange-400">{getModuleIcon(module.type)}</span>

                {/* Label */}
                <span className="text-xs text-white/80 text-center truncate w-full">
                  {module.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export default WidgetTray
