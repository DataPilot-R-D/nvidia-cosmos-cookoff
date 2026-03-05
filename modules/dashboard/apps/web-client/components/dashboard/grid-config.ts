/**
 * Grid Configuration Constants and Types
 *
 * Shared configuration for React Grid Layout.
 * Extracted to avoid CSS import issues in tests.
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Resize handle direction
 * - s: South (bottom edge)
 * - w: West (left edge)
 * - e: East (right edge)
 * - n: North (top edge)
 * - sw: Southwest (bottom-left corner)
 * - nw: Northwest (top-left corner)
 * - se: Southeast (bottom-right corner)
 * - ne: Northeast (top-right corner)
 */
export type ResizeHandle = 's' | 'w' | 'e' | 'n' | 'sw' | 'nw' | 'se' | 'ne'

/**
 * Configuration for resize handles
 */
export interface ResizeHandlesConfig {
  /** Whether resizing is enabled */
  enabled: boolean
  /** Array of handle directions to enable */
  handles: ResizeHandle[]
}

/**
 * Grid breakpoint configuration
 */
export interface BreakpointsConfig {
  lg: number
  md: number
  sm: number
  xs: number
  xxs: number
}

/**
 * Columns per breakpoint
 */
export interface ColumnsConfig {
  lg: number
  md: number
  sm: number
  xs: number
  xxs: number
}

// =============================================================================
// Constants
// =============================================================================

/**
 * All 8 resize handles for OS-like window behavior
 */
export const RESIZE_HANDLES_ALL: ResizeHandle[] = ['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne']

/**
 * Only corner handles (simpler UX)
 */
export const RESIZE_HANDLES_CORNERS: ResizeHandle[] = ['sw', 'nw', 'se', 'ne']

/**
 * Only southeast handle (default/simple mode)
 */
export const RESIZE_HANDLES_SE: ResizeHandle[] = ['se']

/**
 * Default breakpoints for responsive grid
 */
export const DEFAULT_BREAKPOINTS: BreakpointsConfig = {
  lg: 1200,
  md: 996,
  sm: 768,
  xs: 480,
  xxs: 0,
}

/**
 * Default columns per breakpoint
 */
export const DEFAULT_COLS: ColumnsConfig = {
  lg: 12,
  md: 10,
  sm: 6,
  xs: 4,
  xxs: 2,
}

/**
 * Default row height in pixels
 */
export const DEFAULT_ROW_HEIGHT = 60

/**
 * Default margin between grid items [horizontal, vertical]
 */
export const DEFAULT_MARGIN: [number, number] = [8, 8]

/**
 * Default container padding [horizontal, vertical]
 */
export const DEFAULT_CONTAINER_PADDING: [number, number] = [0, 0]

/**
 * Default widget dimensions
 */
export const DEFAULT_WIDGET_SIZE = {
  w: 4, // 4 columns wide
  h: 4, // 4 rows tall
  minW: 2,
  minH: 2,
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate grid column from X coordinate
 */
export function calculateGridX(
  clientX: number,
  containerLeft: number,
  containerWidth: number,
  cols: number
): number {
  const relativeX = clientX - containerLeft
  const colWidth = containerWidth / cols
  return Math.floor(relativeX / colWidth)
}

/**
 * Calculate grid row from Y coordinate
 */
export function calculateGridY(clientY: number, containerTop: number, rowHeight: number): number {
  const relativeY = clientY - containerTop
  return Math.floor(relativeY / rowHeight)
}

/**
 * Clamp grid X position to valid range
 */
export function clampGridX(x: number, cols: number, widgetWidth: number): number {
  return Math.min(Math.max(0, x), cols - widgetWidth)
}

/**
 * Clamp grid Y position to positive values
 */
export function clampGridY(y: number): number {
  return Math.max(0, y)
}

/**
 * Create resize config with all handles enabled (OS-like behavior)
 */
export function createFullResizeConfig(): ResizeHandlesConfig {
  return {
    enabled: true,
    handles: RESIZE_HANDLES_ALL,
  }
}

/**
 * Create resize config with only corners enabled
 */
export function createCornerResizeConfig(): ResizeHandlesConfig {
  return {
    enabled: true,
    handles: RESIZE_HANDLES_CORNERS,
  }
}

/**
 * Create disabled resize config
 */
export function createDisabledResizeConfig(): ResizeHandlesConfig {
  return {
    enabled: false,
    handles: [],
  }
}
