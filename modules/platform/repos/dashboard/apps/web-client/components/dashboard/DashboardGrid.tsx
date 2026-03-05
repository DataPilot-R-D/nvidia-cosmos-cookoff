/**
 * DashboardGrid Component
 *
 * Responsive grid layout for dashboard widgets using React Grid Layout v2.
 * Supports drag & drop, resize, and responsive breakpoints.
 *
 * @see plan.md Step 6: Static Widget Grid
 * @see research-summary.md Section 1.3: React Grid Layout
 */

'use client'

import { useMemo, useCallback, type ReactNode } from 'react'
import {
  Responsive,
  useContainerWidth,
  verticalCompactor,
  type Layout,
  type ResponsiveLayouts,
} from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import { RESIZE_HANDLES_ALL } from './grid-config'

// =============================================================================
// Types
// =============================================================================

export interface LayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  minH?: number
  maxW?: number
  maxH?: number
  static?: boolean
}

export interface DashboardGridProps {
  /** Layout configuration for each breakpoint */
  layouts?: ResponsiveLayouts
  /** Initial layout (used if layouts not provided) */
  initialLayout?: LayoutItem[]
  /** Callback when layout changes */
  onLayoutChange?: (layout: Layout, allLayouts: ResponsiveLayouts) => void
  /** Row height in pixels */
  rowHeight?: number
  /** Number of columns at each breakpoint */
  cols?: { [breakpoint: string]: number }
  /** Breakpoints in pixels */
  breakpoints?: { [breakpoint: string]: number }
  /** Margin between grid items [horizontal, vertical] */
  margin?: readonly [number, number]
  /** Container padding [horizontal, vertical] */
  containerPadding?: readonly [number, number]
  /** Whether widgets are draggable */
  isDraggable?: boolean
  /** Whether widgets are resizable */
  isResizable?: boolean
  /** Drag handle class selector */
  draggableHandle?: string
  /** Children to render in grid */
  children: ReactNode
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_BREAKPOINTS = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 480,
  xxs: 0,
}

const DEFAULT_COLS = {
  lg: 12,
  md: 10,
  sm: 6,
  xs: 4,
  xxs: 2,
}

const DEFAULT_MARGIN: readonly [number, number] = [12, 12]
const DEFAULT_CONTAINER_PADDING: readonly [number, number] = [16, 16]
const DEFAULT_ROW_HEIGHT = 60

// =============================================================================
// Component
// =============================================================================

/**
 * DashboardGrid - Responsive widget grid layout
 *
 * Features:
 * - Responsive breakpoints (lg, md, sm, xs, xxs)
 * - Drag & drop repositioning (via widget-drag-handle class)
 * - Widget resizing with min/max constraints
 * - CSS transform positioning for performance
 * - Compact algorithm to fill gaps
 */
export function DashboardGrid({
  layouts,
  initialLayout = [],
  onLayoutChange,
  rowHeight = DEFAULT_ROW_HEIGHT,
  cols = DEFAULT_COLS,
  breakpoints = DEFAULT_BREAKPOINTS,
  margin = DEFAULT_MARGIN,
  containerPadding = DEFAULT_CONTAINER_PADDING,
  isDraggable = true,
  isResizable = true,
  draggableHandle = '.widget-drag-handle',
  children,
}: DashboardGridProps) {
  // Use container width hook for responsive layout
  const { width, mounted } = useContainerWidth({
    measureBeforeMount: true,
    initialWidth: 1280,
  })

  // Generate layouts for all breakpoints from initial layout
  const responsiveLayouts = useMemo(() => {
    if (layouts) return layouts

    // Create layouts for each breakpoint based on initial layout
    return {
      lg: initialLayout,
      md: initialLayout.map((item) => ({
        ...item,
        w: Math.min(item.w, DEFAULT_COLS.md),
      })),
      sm: initialLayout.map((item) => ({
        ...item,
        w: Math.min(item.w, DEFAULT_COLS.sm),
        x: 0,
      })),
      xs: initialLayout.map((item) => ({
        ...item,
        w: DEFAULT_COLS.xs,
        x: 0,
      })),
      xxs: initialLayout.map((item) => ({
        ...item,
        w: DEFAULT_COLS.xxs,
        x: 0,
      })),
    }
  }, [layouts, initialLayout])

  // Handle layout changes
  const handleLayoutChange = useCallback(
    (currentLayout: Layout, allLayouts: ResponsiveLayouts) => {
      onLayoutChange?.(currentLayout, allLayouts)
    },
    [onLayoutChange]
  )

  if (!mounted) {
    return null
  }

  return (
    <Responsive
      className="layout"
      width={width}
      layouts={responsiveLayouts}
      breakpoints={breakpoints}
      cols={cols}
      rowHeight={rowHeight}
      margin={margin}
      containerPadding={containerPadding}
      dragConfig={{ enabled: isDraggable, handle: draggableHandle }}
      resizeConfig={{ enabled: isResizable, handles: RESIZE_HANDLES_ALL }}
      onLayoutChange={handleLayoutChange}
      compactor={verticalCompactor}
    >
      {children}
    </Responsive>
  )
}

// =============================================================================
// Default Export
// =============================================================================

export default DashboardGrid
