/**
 * Video Streaming and WebRTC Signaling Schemas
 *
 * Types for video frame metadata, camera subscriptions,
 * and WebRTC signaling messages.
 *
 * @see Hybrid architecture: WebRTC (low-latency) + HLS (multi-camera)
 */

import { z } from 'zod'
import { BaseMessageSchema } from './base'

// =============================================================================
// Video Format Schema
// =============================================================================

/**
 * Supported video frame formats
 */
export const VideoFormatSchema = z.enum(['jpeg', 'webp', 'png'])

export type VideoFormat = z.infer<typeof VideoFormatSchema>

// =============================================================================
// Video Frame Metadata Schema
// =============================================================================

/**
 * Metadata for each video frame
 * Sent alongside binary frame data via Socket.IO
 */
export const VideoFrameMetadataSchema = z.object({
  /** Camera that produced this frame */
  cameraId: z.string().min(1),

  /** Robot that owns the camera */
  robotId: z.string().min(1),

  /** Frame encoding format */
  format: VideoFormatSchema,

  /** Frame width in pixels */
  width: z.number().int().positive(),

  /** Frame height in pixels */
  height: z.number().int().positive(),

  /** Sequential frame number */
  frameNumber: z.number().int().nonnegative(),

  /** Capture timestamp (ms since epoch) */
  timestamp: z.number(),

  /** JPEG quality (1-100), if applicable */
  quality: z.number().int().min(1).max(100).optional(),

  /** Current frames per second */
  fps: z.number().positive().optional(),
})

export type VideoFrameMetadata = z.infer<typeof VideoFrameMetadataSchema>

/**
 * Video frame payload structure
 * Metadata is sent as JSON, data as binary
 */
export interface VideoFramePayload {
  metadata: VideoFrameMetadata
  data: ArrayBuffer
}

// =============================================================================
// Camera Subscription Messages
// =============================================================================

/**
 * Subscribe to camera stream
 * (web client -> WebSocket server -> ROS bridge)
 */
export const CameraSubscribeMessageSchema = BaseMessageSchema.extend({
  type: z.literal('camera_subscribe'),
  data: z.object({
    cameraId: z.string().min(1),
    robotId: z.string().min(1),
    /** JPEG quality 1-100 */
    quality: z.number().int().min(1).max(100).default(75),
    /** Maximum FPS (capped at 30) */
    maxFps: z.number().positive().max(30).default(15),
  }),
})

export type CameraSubscribeMessage = z.infer<typeof CameraSubscribeMessageSchema>

/**
 * Unsubscribe from camera stream
 * (web client -> WebSocket server -> ROS bridge)
 */
export const CameraUnsubscribeMessageSchema = BaseMessageSchema.extend({
  type: z.literal('camera_unsubscribe'),
  data: z.object({
    cameraId: z.string().min(1),
  }),
})

export type CameraUnsubscribeMessage = z.infer<typeof CameraUnsubscribeMessageSchema>

// =============================================================================
// WebRTC Signaling Messages
// =============================================================================

/**
 * WebRTC SDP Offer
 * (web client -> WebSocket server -> ROS bridge)
 */
export const WebRTCOfferMessageSchema = BaseMessageSchema.extend({
  type: z.literal('webrtc_offer'),
  data: z.object({
    cameraId: z.string().min(1),
    clientId: z.string().min(1),
    sdp: z.string().min(1),
  }),
})

export type WebRTCOfferMessage = z.infer<typeof WebRTCOfferMessageSchema>

/**
 * WebRTC SDP Answer
 * (ROS bridge -> WebSocket server -> web client)
 */
export const WebRTCAnswerMessageSchema = BaseMessageSchema.extend({
  type: z.literal('webrtc_answer'),
  data: z.object({
    cameraId: z.string().min(1),
    clientId: z.string().min(1),
    sdp: z.string().min(1),
  }),
})

export type WebRTCAnswerMessage = z.infer<typeof WebRTCAnswerMessageSchema>

/**
 * WebRTC ICE Candidate
 * (bidirectional: web client <-> ROS bridge)
 */
export const WebRTCIceCandidateMessageSchema = BaseMessageSchema.extend({
  type: z.literal('webrtc_ice'),
  data: z.object({
    cameraId: z.string().min(1),
    clientId: z.string().min(1),
    /** ICE candidate string (null = end of candidates) */
    candidate: z.string().nullable(),
    /** SDP media stream identification tag */
    sdpMid: z.string().optional(),
    /** Index of the media description */
    sdpMLineIndex: z.number().int().nonnegative().optional(),
  }),
})

export type WebRTCIceCandidateMessage = z.infer<typeof WebRTCIceCandidateMessageSchema>

// =============================================================================
// WebRTC Session Request (go2rtc integration)
// =============================================================================

/**
 * WebRTC session request
 * (web client -> WebSocket server -> go2rtc)
 *
 * Client requests a WebRTC session for a camera.
 * Server contacts go2rtc and returns an SDP offer.
 */
export const WebRTCRequestMessageSchema = BaseMessageSchema.extend({
  type: z.literal('webrtc_request'),
  data: z.object({
    cameraId: z.string().min(1),
    clientId: z.string().min(1),
    /** Action to perform */
    action: z.enum(['start', 'stop']),
  }),
})

export type WebRTCRequestMessage = z.infer<typeof WebRTCRequestMessageSchema>

/**
 * WebRTC connection status
 * (WebSocket server -> web client)
 *
 * Notifies client of WebRTC connection status and fallback state.
 */
export const WebRTCStatusMessageSchema = BaseMessageSchema.extend({
  type: z.literal('webrtc_status'),
  data: z.object({
    cameraId: z.string().min(1),
    clientId: z.string().min(1),
    /** Current connection status */
    status: z.enum(['connecting', 'connected', 'failed', 'disconnected']),
    /** Whether fallback to WebSocket stream is active */
    fallbackActive: z.boolean(),
    /** Error message if status is 'failed' */
    error: z.string().optional(),
    /** go2rtc session ID (for debugging) */
    sessionId: z.string().optional(),
  }),
})

export type WebRTCStatusMessage = z.infer<typeof WebRTCStatusMessageSchema>

// =============================================================================
// Stream Status
// =============================================================================

/**
 * Stream connection status
 */
export const StreamStatusSchema = z.enum([
  'connecting',
  'live',
  'buffering',
  'paused',
  'error',
  'disconnected',
])

export type StreamStatus = z.infer<typeof StreamStatusSchema>

/**
 * Active stream information
 */
export const StreamInfoSchema = z.object({
  cameraId: z.string().min(1),
  mode: z.enum(['hls', 'webrtc']),
  status: StreamStatusSchema,
  fps: z.number().nonnegative().optional(),
  latency: z.number().nonnegative().optional(),
  bitrate: z.number().nonnegative().optional(),
  startedAt: z.number(),
})

export type StreamInfo = z.infer<typeof StreamInfoSchema>
