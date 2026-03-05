import { z } from 'zod'
import { RobotPositionSchema, RobotStatusSchema } from './websocket'

/**
 * Robot Entity Types
 * Full robot models for database/state management
 */

// =============================================================================
// Robot Configuration
// =============================================================================

export const RobotConfigSchema = z.object({
  maxSpeed: z.number().positive(),
  patrolRadius: z.number().positive(),
  batteryThreshold: z.number().min(0).max(100),
  alertDistance: z.number().positive(),
  homePosition: RobotPositionSchema,
})

export type RobotConfig = z.infer<typeof RobotConfigSchema>

// =============================================================================
// Robot Entity
// =============================================================================

export const RobotEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  model: z.string().optional(),
  serialNumber: z.string().optional(),
  position: RobotPositionSchema,
  status: RobotStatusSchema,
  battery: z.number().min(0).max(100),
  velocity: z.number().default(0),
  config: RobotConfigSchema.optional(),
  lastSeen: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export type RobotEntity = z.infer<typeof RobotEntitySchema>

// =============================================================================
// Robot Telemetry
// =============================================================================

export const RobotTelemetrySchema = z.object({
  robotId: z.string(),
  timestamp: z.number(),
  position: RobotPositionSchema,
  battery: z.number().min(0).max(100),
  velocity: z.number(),
  temperature: z.number().optional(),
  cpuUsage: z.number().min(0).max(100).optional(),
  memoryUsage: z.number().min(0).max(100).optional(),
  networkLatency: z.number().optional(),
})

export type RobotTelemetry = z.infer<typeof RobotTelemetrySchema>

// =============================================================================
// Patrol Route
// =============================================================================

export const PatrolWaypointSchema = z.object({
  id: z.string(),
  position: RobotPositionSchema,
  waitTime: z.number().min(0).default(0),
  order: z.number().int().min(0),
})

export const PatrolRouteSchema = z.object({
  id: z.string(),
  name: z.string(),
  waypoints: z.array(PatrolWaypointSchema),
  loop: z.boolean().default(true),
  active: z.boolean().default(false),
})

export type PatrolWaypoint = z.infer<typeof PatrolWaypointSchema>
export type PatrolRoute = z.infer<typeof PatrolRouteSchema>

// =============================================================================
// Robot Zone
// =============================================================================

export const ZoneTypeSchema = z.enum(['patrol', 'restricted', 'charging', 'alert'])

export const ZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ZoneTypeSchema,
  boundaries: z.array(z.object({ x: z.number(), y: z.number() })),
  color: z.string().optional(),
})

export type ZoneType = z.infer<typeof ZoneTypeSchema>
export type Zone = z.infer<typeof ZoneSchema>
