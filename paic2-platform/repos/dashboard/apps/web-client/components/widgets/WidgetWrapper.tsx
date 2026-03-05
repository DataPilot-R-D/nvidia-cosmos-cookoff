/**
 * WidgetWrapper Component
 *
 * Container component for dashboard widgets that integrates with React Grid Layout.
 * Provides drag handle, resize handle, and Pencil Design System styling.
 *
 * Design References (Pencil):
 * - Title: 38GXX (Label/Large) - 9px Inter, 600 weight, tracking 1, uppercase
 * - Container: card-tactical - #2A2A2A bg, #555555 border, 2px radius
 *
 * @see plan.md Step 5: WidgetWrapper Component
 */

'use client'

import { forwardRef, type ReactNode, type CSSProperties, type HTMLAttributes } from 'react'

// =============================================================================
// Types
// =============================================================================

export interface WidgetWrapperProps extends HTMLAttributes<HTMLDivElement> {
  /** Widget title displayed in header */
  title: string
  /** Unique widget identifier for data-testid */
  widgetId?: string
  /** Widget content */
  children: ReactNode
  /** Additional className for grid layout integration */
  className?: string
  /** Style object for grid positioning (transform, width, height) */
  style?: CSSProperties
  /** Whether widget can be resized */
  resizable?: boolean
  /** Whether widget is currently locked */
  locked?: boolean
}

// =============================================================================
// Component
// =============================================================================

/**
 * WidgetWrapper - Grid-ready widget container
 *
 * Integrates with React Grid Layout by:
 * - Forwarding className and style props
 * - Providing drag handle with 'widget-drag-handle' class
 * - Providing resize handle when resizable
 * - Using forwardRef for grid item refs
 */
export const WidgetWrapper = forwardRef<HTMLDivElement, WidgetWrapperProps>(function WidgetWrapper(
  { title, widgetId, children, className = '', style, resizable = false, locked = false, ...props },
  ref
) {
  const testId = widgetId ? `widget-${widgetId}` : 'widget-wrapper'

  return (
    <div
      ref={ref}
      className={`card-tactical h-full w-full flex flex-col overflow-hidden ${className}`}
      style={style}
      data-testid={testId}
      role="region"
      aria-label={title}
      {...props}
    >
      {/* Drag Handle Header - Command Center Scale */}
      <div
        className="widget-drag-handle flex items-center justify-between px-4 py-3 border-b border-[#333333] cursor-move select-none"
        data-testid="widget-drag-handle"
      >
        <h2 className="text-tactical-label">{title}</h2>

        {/* Widget Controls */}
        <div className="flex items-center gap-2">
          {locked && (
            <span className="text-xs text-[#666666] tracking-wider uppercase" title="Widget locked">
              LOCKED
            </span>
          )}
        </div>
      </div>

      {/* Content Area - Fills remaining space */}
      <div className="flex-1 overflow-auto p-4" data-testid="widget-content">
        {children}
      </div>

      {/* Resize Handle - Bottom right corner */}
      {resizable && !locked && (
        <div
          className="react-resizable-handle react-resizable-handle-se absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
          data-testid="widget-resize-handle"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M0 10L10 0' stroke='%23555555' stroke-width='1'/%3E%3Cpath d='M4 10L10 4' stroke='%23555555' stroke-width='1'/%3E%3C/svg%3E")`,
            backgroundPosition: 'bottom right',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '10px 10px',
          }}
        />
      )}
    </div>
  )
})

// Re-export types
export type { WidgetWrapperProps as WidgetWrapperProperties }
