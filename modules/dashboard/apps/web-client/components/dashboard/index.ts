/**
 * Dashboard Components Index
 *
 * Central export point for dashboard layout components.
 */

export { DashboardGrid } from './DashboardGrid'
export type { DashboardGridProps, LayoutItem } from './DashboardGrid'

export { DropZone } from './DropZone'
export type { DropZoneProps, DropData } from './DropZone'

export {
  RESIZE_HANDLES_ALL,
  RESIZE_HANDLES_CORNERS,
  RESIZE_HANDLES_SE,
  DEFAULT_BREAKPOINTS,
  DEFAULT_COLS,
  DEFAULT_ROW_HEIGHT,
  DEFAULT_MARGIN,
  DEFAULT_CONTAINER_PADDING,
  DEFAULT_WIDGET_SIZE,
  calculateGridX,
  calculateGridY,
  clampGridX,
  clampGridY,
  createFullResizeConfig,
  createCornerResizeConfig,
  createDisabledResizeConfig,
} from './grid-config'

export type {
  ResizeHandle,
  ResizeHandlesConfig,
  BreakpointsConfig,
  ColumnsConfig,
} from './grid-config'
