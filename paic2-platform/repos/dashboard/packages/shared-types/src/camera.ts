/**
 * Camera Entity and Discovery Schemas
 *
 * Types for camera entities discovered from ROS 2 topics
 * and camera discovery/loss WebSocket messages.
 *
 * @see Auto-discovery via rclpy get_topic_names_and_types()
 */

import { z } from 'zod'
import { BaseMessageSchema } from './base'

// =============================================================================
// Camera Status Schema
// =============================================================================

/**
 * Camera connection/streaming status
 */
export const CameraStatusSchema = z.enum([
  'active', // Camera is streaming
  'inactive', // Camera exists but not streaming
  'error', // Camera has an error
  'connecting', // Camera is establishing connection
])

export type CameraStatus = z.infer<typeof CameraStatusSchema>

// =============================================================================
// Camera Capabilities Schema
// =============================================================================

/**
 * Camera streaming capabilities
 */
export const CameraCapabilitiesSchema = z.object({
  /** Supports low-latency WebRTC streaming */
  supportsWebRTC: z.boolean(),

  /** Supports HLS streaming (for multi-camera monitoring) */
  supportsHLS: z.boolean(),

  /** Supports Pan-Tilt-Zoom controls */
  supportsPTZ: z.boolean(),

  /** Maximum supported resolution */
  maxResolution: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),

  /** Maximum frames per second */
  maxFps: z.number().positive(),
})

export type CameraCapabilities = z.infer<typeof CameraCapabilitiesSchema>

// =============================================================================
// Camera Entity Schema
// =============================================================================

/**
 * Camera entity discovered from ROS 2
 */
export const CameraEntitySchema = z.object({
  /** Unique camera identifier */
  id: z.string().min(1),

  /** Robot that owns this camera */
  robotId: z.string().min(1),

  /** Human-readable camera name */
  name: z.string().min(1),

  /** ROS 2 topic path (e.g., /robot_001/camera_front/image_compressed) */
  topic: z.string().min(1),

  /** Current camera status */
  status: CameraStatusSchema,

  /** Camera streaming capabilities */
  capabilities: CameraCapabilitiesSchema,

  /** HLS manifest URL (when HLS streaming is active) */
  hlsUrl: z.string().url().optional(),

  /** Whether WebRTC is currently enabled for this camera */
  webrtcEnabled: z.boolean().default(false),
})

export type CameraEntity = z.infer<typeof CameraEntitySchema>

// =============================================================================
// Camera Discovery Messages
// =============================================================================

/**
 * Message sent when a new camera is discovered
 * (ROS bridge -> WebSocket server -> web clients)
 */
export const CameraDiscoveredMessageSchema = BaseMessageSchema.extend({
  type: z.literal('camera_discovered'),
  data: CameraEntitySchema,
})

export type CameraDiscoveredMessage = z.infer<typeof CameraDiscoveredMessageSchema>

/**
 * Message sent when a camera is no longer available
 * (ROS bridge -> WebSocket server -> web clients)
 */
export const CameraLostMessageSchema = BaseMessageSchema.extend({
  type: z.literal('camera_lost'),
  data: z.object({
    cameraId: z.string().min(1),
    robotId: z.string().min(1),
  }),
})

export type CameraLostMessage = z.infer<typeof CameraLostMessageSchema>

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a unique camera ID from robot ID and topic
 */
export function createCameraId(robotId: string, topic: string): string {
  // Extract camera name from topic (e.g., /robot_001/camera_front/image -> camera_front)
  const parts = topic.split('/')
  const cameraName = parts.find((p) => p.includes('camera')) || 'camera'
  return `${robotId}-${cameraName}`
}

/**
 * Extract camera name from ROS topic
 */
export function extractCameraName(topic: string): string {
  const parts = topic.split('/')
  const cameraSegment = parts.find((p) => p.includes('camera'))

  if (cameraSegment) {
    // Convert camera_front to "Front Camera"
    return (
      cameraSegment
        .replace('camera_', '')
        .replace('camera', 'Main')
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ') + ' Camera'
    )
  }

  return 'Camera'
}
