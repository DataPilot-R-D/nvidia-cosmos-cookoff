/**
 * LIDAR Types and Schemas
 *
 * Types and Zod schemas for LIDAR point cloud data.
 * Used for streaming LIDAR scans from ROS 2 to web dashboard.
 *
 * @see research-summary.md Section 2.2: Streaming LIDAR Point Cloud
 */

import { z } from 'zod'
import { BaseMessageSchema } from './base'

// =============================================================================
// Point Types
// =============================================================================

/**
 * Single LIDAR point with optional intensity and color
 */
export const LidarPointSchema = z.object({
  /** X coordinate in meters (robot frame) */
  x: z.number(),
  /** Y coordinate in meters (robot frame) */
  y: z.number(),
  /** Z coordinate in meters (robot frame) */
  z: z.number(),
  /** Intensity value (0-255, optional) */
  intensity: z.number().int().min(0).max(255).optional(),
  /** Red color component (0-255, optional) */
  r: z.number().int().min(0).max(255).optional(),
  /** Green color component (0-255, optional) */
  g: z.number().int().min(0).max(255).optional(),
  /** Blue color component (0-255, optional) */
  b: z.number().int().min(0).max(255).optional(),
})

export type LidarPoint = z.infer<typeof LidarPointSchema>

// =============================================================================
// Header Types
// =============================================================================

/**
 * LIDAR message header with metadata
 */
export const LidarHeaderSchema = z.object({
  /** Timestamp in milliseconds */
  timestamp: z.number(),
  /** ROS frame ID (e.g., 'lidar_link') */
  frameId: z.string(),
  /** Robot ID that owns this sensor */
  robotId: z.string(),
})

export type LidarHeader = z.infer<typeof LidarHeaderSchema>

// =============================================================================
// Scan Configuration
// =============================================================================

/**
 * LIDAR scan configuration (2D laser scan parameters)
 */
export const LidarScanConfigSchema = z.object({
  /** LIDAR header */
  header: LidarHeaderSchema,
  /** Number of points in this scan */
  pointCount: z.number().int().min(0),
  /** Minimum range in meters */
  rangeMin: z.number().min(0),
  /** Maximum range in meters */
  rangeMax: z.number().min(0),
  /** Start angle in radians */
  angleMin: z.number(),
  /** End angle in radians */
  angleMax: z.number(),
  /** Angle increment between points in radians */
  angleIncrement: z.number(),
})

export type LidarScanConfig = z.infer<typeof LidarScanConfigSchema>

// =============================================================================
// Message Types
// =============================================================================

/**
 * LIDAR scan message (metadata only, binary data follows)
 *
 * Used for WebSocket message containing scan metadata.
 * Binary point data is sent separately as ArrayBuffer.
 */
export const LidarScanMessageSchema = BaseMessageSchema.extend({
  type: z.literal('lidar_scan'),
  data: LidarScanConfigSchema,
})

export type LidarScanMessage = z.infer<typeof LidarScanMessageSchema>

/**
 * Data format for LIDAR stream
 */
export const LidarDataFormatSchema = z.enum([
  'xyz', // 12 bytes per point (3x float32)
  'xyz_intensity', // 16 bytes per point (3x float32 + uint32)
  'xyz_rgb', // 15 bytes per point (3x float32 + 3x uint8)
])

export type LidarDataFormat = z.infer<typeof LidarDataFormatSchema>

/**
 * Compression type for LIDAR data
 */
export const LidarCompressionTypeSchema = z.enum([
  'none', // No compression
  'gzip', // Gzip compression
  'delta', // Delta encoding (only changed points)
  'voxel', // Voxel grid downsampling
])

export type LidarCompressionType = z.infer<typeof LidarCompressionTypeSchema>

/**
 * LIDAR stream message (for continuous streaming)
 *
 * Contains metadata about the binary stream format.
 */
export const LidarStreamMessageSchema = BaseMessageSchema.extend({
  type: z.literal('lidar_stream'),
  data: z.object({
    /** Robot ID */
    robotId: z.string(),
    /** Frame ID */
    frameId: z.string(),
    /** Number of points in this frame */
    pointCount: z.number().int().min(0),
    /** Data format */
    format: LidarDataFormatSchema,
    /** Compression type */
    compressionType: LidarCompressionTypeSchema,
  }),
})

export type LidarStreamMessage = z.infer<typeof LidarStreamMessageSchema>

// =============================================================================
// Subscribe/Unsubscribe Messages
// =============================================================================

/**
 * Subscribe to LIDAR stream
 */
export const LidarSubscribeMessageSchema = BaseMessageSchema.extend({
  type: z.literal('lidar_subscribe'),
  data: z.object({
    /** Robot ID to subscribe to */
    robotId: z.string(),
    /** Maximum frame rate (Hz) */
    maxFps: z.number().int().min(1).max(30).default(10),
    /** Desired format */
    format: LidarDataFormatSchema.default('xyz_intensity'),
    /** Voxel size for downsampling (meters, 0 = no downsampling) */
    voxelSize: z.number().min(0).default(0.05),
  }),
})

export type LidarSubscribeMessage = z.infer<typeof LidarSubscribeMessageSchema>

/**
 * Unsubscribe from LIDAR stream
 */
export const LidarUnsubscribeMessageSchema = BaseMessageSchema.extend({
  type: z.literal('lidar_unsubscribe'),
  data: z.object({
    /** Robot ID to unsubscribe from */
    robotId: z.string(),
  }),
})

export type LidarUnsubscribeMessage = z.infer<typeof LidarUnsubscribeMessageSchema>

// =============================================================================
// Binary Data Helpers
// =============================================================================

/**
 * Parse binary LIDAR data to points array
 *
 * @param buffer - ArrayBuffer containing packed point data
 * @param format - Data format
 * @returns Array of LidarPoint objects
 */
export function parseLidarBinaryData(buffer: ArrayBuffer, format: LidarDataFormat): LidarPoint[] {
  const points: LidarPoint[] = []
  const view = new DataView(buffer)

  let offset = 0
  const bytesPerPoint = format === 'xyz' ? 12 : format === 'xyz_intensity' ? 16 : 15

  while (offset + bytesPerPoint <= buffer.byteLength) {
    const point: LidarPoint = {
      x: view.getFloat32(offset, true),
      y: view.getFloat32(offset + 4, true),
      z: view.getFloat32(offset + 8, true),
    }

    if (format === 'xyz_intensity') {
      point.intensity = view.getUint8(offset + 12)
    } else if (format === 'xyz_rgb') {
      point.r = view.getUint8(offset + 12)
      point.g = view.getUint8(offset + 13)
      point.b = view.getUint8(offset + 14)
    }

    points.push(point)
    offset += bytesPerPoint
  }

  return points
}

/**
 * Convert LidarPoint array to Float32Array for Three.js BufferGeometry
 *
 * @param points - Array of LidarPoint objects
 * @returns Float32Array with [x1,y1,z1, x2,y2,z2, ...]
 */
export function lidarPointsToPositions(points: LidarPoint[]): Float32Array {
  const positions = new Float32Array(points.length * 3)
  for (let i = 0; i < points.length; i++) {
    positions[i * 3] = points[i].x
    positions[i * 3 + 1] = points[i].y
    positions[i * 3 + 2] = points[i].z
  }
  return positions
}

/**
 * Convert LidarPoint intensity to colors for Three.js BufferGeometry
 *
 * Uses height-based colorization with intensity overlay
 *
 * @param points - Array of LidarPoint objects
 * @param minZ - Minimum Z for color mapping
 * @param maxZ - Maximum Z for color mapping
 * @returns Float32Array with [r1,g1,b1, r2,g2,b2, ...] (0-1 range)
 */
export function lidarPointsToColors(
  points: LidarPoint[],
  minZ: number = -1,
  maxZ: number = 2
): Float32Array {
  const colors = new Float32Array(points.length * 3)
  const range = maxZ - minZ

  for (let i = 0; i < points.length; i++) {
    const point = points[i]

    // Height-based hue (0 = red/low, 0.66 = blue/high)
    const normalizedZ = Math.max(0, Math.min(1, (point.z - minZ) / range))
    const hue = normalizedZ * 0.66

    // Convert HSL to RGB (simplified)
    const h = hue * 6
    const x = 1 - Math.abs((h % 2) - 1)

    let r = 0,
      g = 0,
      b = 0
    if (h < 1) {
      r = 1
      g = x
      b = 0
    } else if (h < 2) {
      r = x
      g = 1
      b = 0
    } else if (h < 3) {
      r = 0
      g = 1
      b = x
    } else if (h < 4) {
      r = 0
      g = x
      b = 1
    } else if (h < 5) {
      r = x
      g = 0
      b = 1
    } else {
      r = 1
      g = 0
      b = x
    }

    // Apply intensity if available
    const intensity = point.intensity !== undefined ? point.intensity / 255 : 1

    colors[i * 3] = r * intensity
    colors[i * 3 + 1] = g * intensity
    colors[i * 3 + 2] = b * intensity
  }

  return colors
}
