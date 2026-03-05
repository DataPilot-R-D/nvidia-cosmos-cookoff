/**
 * Camera Source Registry Types
 *
 * Defines CameraSource — the frontend's unified model for all camera feeds
 * (Isaac Sim, CCTV, USB, etc.). Separate from shared-types CameraEntity
 * which is the ROS discovery wire format.
 *
 * @see T1.1 — Camera Source Registry
 */

import { z } from 'zod'

// =============================================================================
// Camera Source Kind
// =============================================================================

export const CameraSourceKindSchema = z.enum(['sim', 'cctv', 'usb'])
export type CameraSourceKind = z.infer<typeof CameraSourceKindSchema>

// =============================================================================
// Camera Source Status
// =============================================================================

export const CameraSourceStatusSchema = z.enum(['online', 'offline', 'unknown'])
export type CameraSourceStatus = z.infer<typeof CameraSourceStatusSchema>

// =============================================================================
// Camera Source
// =============================================================================

export const CameraSourceSchema = z.object({
  /** Unique identifier (e.g. "isaac-front-cam") */
  id: z.string().min(1),

  /** Human-readable name */
  name: z.string().min(1),

  /** Source type */
  kind: CameraSourceKindSchema,

  /** Stream URL or ROS topic name (depends on kind) */
  streamUrl: z.string().min(1),

  /** Whether this source supports WebRTC low-latency streaming */
  webrtcCapable: z.boolean(),

  /** Freeform tags for filtering/grouping */
  tags: z.array(z.string()),

  /** Current availability status */
  status: CameraSourceStatusSchema,
})

export type CameraSource = z.infer<typeof CameraSourceSchema>
