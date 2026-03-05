import { z } from 'zod'
import { BaseMessageSchema } from './base'

/**
 * Machine Statistics Types
 *
 * Server-side system monitoring for CPU, Memory, GPU, Disk, and Network.
 * Used by the Machine Usage dashboard widget to display real-time
 * server resource utilization.
 *
 * Event: 'server:stats' (emitted every 5 seconds)
 */

// =============================================================================
// CPU Statistics
// =============================================================================

export const CpuStatsSchema = z.object({
  /** Current CPU usage percentage (0-100) */
  usage: z.number().min(0).max(100),
  /** Number of CPU cores */
  cores: z.number().int().positive(),
  /** CPU temperature in Celsius (may not be available on all systems) */
  temperature: z.number().optional(),
  /** CPU model name */
  model: z.string().optional(),
})

export type CpuStats = z.infer<typeof CpuStatsSchema>

// =============================================================================
// Memory Statistics
// =============================================================================

export const MemoryStatsSchema = z.object({
  /** Memory used in bytes */
  used: z.number().nonnegative(),
  /** Total memory in bytes */
  total: z.number().positive(),
  /** Memory usage percentage (0-100) */
  percent: z.number().min(0).max(100),
  /** Swap memory statistics (optional) */
  swap: z
    .object({
      used: z.number().nonnegative(),
      total: z.number().nonnegative(),
    })
    .optional(),
})

export type MemoryStats = z.infer<typeof MemoryStatsSchema>

// =============================================================================
// GPU Statistics (Optional - may not be available on all systems)
// =============================================================================

export const GpuStatsSchema = z
  .object({
    /** GPU usage percentage (0-100) */
    usage: z.number().min(0).max(100),
    /** GPU memory used in bytes */
    memoryUsed: z.number().nonnegative(),
    /** GPU total memory in bytes */
    memoryTotal: z.number().nonnegative(),
    /** GPU temperature in Celsius */
    temperature: z.number().optional(),
    /** GPU model name */
    name: z.string().optional(),
  })
  .optional()

export type GpuStats = z.infer<typeof GpuStatsSchema>

// =============================================================================
// Disk Statistics
// =============================================================================

export const DiskStatsSchema = z
  .object({
    /** Disk space used in bytes */
    used: z.number().nonnegative(),
    /** Total disk space in bytes */
    total: z.number().positive(),
    /** Disk usage percentage (0-100) */
    percent: z.number().min(0).max(100),
    /** Mount point */
    mount: z.string(),
  })
  .optional()

export type DiskStats = z.infer<typeof DiskStatsSchema>

// =============================================================================
// Network Statistics
// =============================================================================

export const NetworkStatsSchema = z
  .object({
    /** Bytes received */
    bytesIn: z.number().nonnegative(),
    /** Bytes sent */
    bytesOut: z.number().nonnegative(),
    /** Network latency in milliseconds */
    latency: z.number().nonnegative().optional(),
  })
  .optional()

export type NetworkStats = z.infer<typeof NetworkStatsSchema>

// =============================================================================
// Main Machine Stats Message
// =============================================================================

export const MachineStatsDataSchema = z.object({
  /** Server identifier (e.g., 'aws-ec2-main', 'local-dev') */
  serverId: z.string(),
  /** CPU statistics */
  cpu: CpuStatsSchema,
  /** Memory statistics */
  memory: MemoryStatsSchema,
  /** GPU statistics (optional) */
  gpu: GpuStatsSchema,
  /** Disk statistics (optional) */
  disk: DiskStatsSchema,
  /** Network statistics (optional) */
  network: NetworkStatsSchema,
})

export type MachineStatsData = z.infer<typeof MachineStatsDataSchema>

/**
 * WebSocket message for server statistics
 * Event: 'server:stats'
 */
export const MachineStatsMessageSchema = BaseMessageSchema.extend({
  type: z.literal('server:stats'),
  data: MachineStatsDataSchema,
})

export type MachineStatsMessage = z.infer<typeof MachineStatsMessageSchema>

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

/**
 * Get threshold color based on usage percentage
 * @returns 'normal' | 'warning' | 'danger'
 */
export function getUsageThreshold(percent: number): 'normal' | 'warning' | 'danger' {
  if (percent >= 85) return 'danger'
  if (percent >= 60) return 'warning'
  return 'normal'
}
