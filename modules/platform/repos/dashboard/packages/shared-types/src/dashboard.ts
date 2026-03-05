import { z } from 'zod'

/**
 * Dashboard Configuration Types
 * UI layout, widgets, and user preferences
 */

// =============================================================================
// Widget Types
// =============================================================================

export const WidgetTypeSchema = z.enum([
  'robot_map',
  'robot_list',
  'robot_detail',
  'alerts_panel',
  'telemetry_chart',
  'patrol_routes',
  'camera_feed',
  'status_overview',
  'command_panel',
  'zone_editor',
])

export type WidgetType = z.infer<typeof WidgetTypeSchema>

// =============================================================================
// Widget Configuration
// =============================================================================

export const WidgetPositionSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  w: z.number().int().min(1),
  h: z.number().int().min(1),
})

export const WidgetConfigSchema = z.object({
  id: z.string(),
  type: WidgetTypeSchema,
  title: z.string(),
  position: WidgetPositionSchema,
  settings: z.record(z.unknown()).optional(),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
})

export type WidgetPosition = z.infer<typeof WidgetPositionSchema>
export type WidgetConfig = z.infer<typeof WidgetConfigSchema>

// =============================================================================
// Dashboard Layout
// =============================================================================

export const DashboardLayoutSchema = z.object({
  id: z.string(),
  name: z.string(),
  widgets: z.array(WidgetConfigSchema),
  columns: z.number().int().min(1).default(12),
  rowHeight: z.number().int().min(1).default(60),
  isDefault: z.boolean().default(false),
})

export type DashboardLayout = z.infer<typeof DashboardLayoutSchema>

// =============================================================================
// User Preferences
// =============================================================================

export const ThemeSchema = z.enum(['dark', 'light', 'system'])

export const UserPreferencesSchema = z.object({
  theme: ThemeSchema.default('dark'),
  language: z.string().default('en'),
  defaultLayout: z.string().optional(),
  notifications: z.object({
    sound: z.boolean().default(true),
    desktop: z.boolean().default(true),
    criticalOnly: z.boolean().default(false),
  }),
  mapSettings: z.object({
    showGrid: z.boolean().default(true),
    showZones: z.boolean().default(true),
    showTrails: z.boolean().default(false),
    trailLength: z.number().int().min(0).max(1000).default(100),
  }),
})

export type Theme = z.infer<typeof ThemeSchema>
export type UserPreferences = z.infer<typeof UserPreferencesSchema>

// =============================================================================
// Dashboard State
// =============================================================================

export const DashboardStateSchema = z.object({
  activeLayout: z.string(),
  selectedRobotId: z.string().nullable(),
  filters: z.object({
    status: z.array(z.string()).default([]),
    search: z.string().default(''),
  }),
  sidebarOpen: z.boolean().default(true),
  commandPanelOpen: z.boolean().default(false),
})

export type DashboardState = z.infer<typeof DashboardStateSchema>
