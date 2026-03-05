import { z } from 'zod'
import { BaseMessageSchema, type BaseMessage } from './base'

/**
 * WebSocket Message Types
 * All messages between web-client, websocket-server, and ros-bridge
 *
 * Message Categories:
 * - Robot State: robot_state
 * - Commands: command
 * - Connection: connection
 * - Alerts: alert
 * - Camera Discovery: camera_discovered, camera_lost
 * - Camera Streaming: camera_subscribe, camera_unsubscribe
 * - WebRTC Signaling: webrtc_offer, webrtc_answer, webrtc_ice
 */

// Re-export base message for backwards compatibility
export { BaseMessageSchema }
export type { BaseMessage }

// =============================================================================
// Robot State Messages (ros-bridge -> websocket-server -> web-client)
// =============================================================================

export const RobotPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  heading: z.number().min(0).max(360).optional(),
})

export const RobotStatusSchema = z.enum(['online', 'offline', 'warning', 'idle', 'patrol', 'alert'])

export const RobotStateMessageSchema = BaseMessageSchema.extend({
  type: z.literal('robot_state'),
  data: z.object({
    robotId: z.string(),
    name: z.string().optional(),
    position: RobotPositionSchema,
    battery: z.number().min(0).max(100),
    status: RobotStatusSchema,
    velocity: z.number().optional(),
    lastSeen: z.number(),
  }),
})

export type RobotPosition = z.infer<typeof RobotPositionSchema>
export type RobotStatus = z.infer<typeof RobotStatusSchema>
export type RobotStateMessage = z.infer<typeof RobotStateMessageSchema>

// =============================================================================
// Command Messages (web-client -> websocket-server -> ros-bridge)
// =============================================================================

export const CommandActionSchema = z.enum([
  'move',
  'stop',
  'patrol',
  'return_home',
  'rotate',
  'follow',
  'scan',
  'alert',
])

export const CommandMessageSchema = BaseMessageSchema.extend({
  type: z.literal('command'),
  data: z.object({
    robotId: z.string(),
    action: CommandActionSchema,
    params: z.record(z.unknown()).optional(),
    priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
  }),
})

export type CommandAction = z.infer<typeof CommandActionSchema>
export type CommandMessage = z.infer<typeof CommandMessageSchema>

// =============================================================================
// Connection Messages
// =============================================================================

export const ConnectionStatusSchema = z.enum([
  'connected',
  'connecting',
  'disconnected',
  'reconnecting',
  'error',
])

export const ConnectionMessageSchema = BaseMessageSchema.extend({
  type: z.literal('connection'),
  data: z.object({
    status: ConnectionStatusSchema,
    clientId: z.string().optional(),
    robotIds: z.array(z.string()).optional(),
  }),
})

export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>
export type ConnectionMessage = z.infer<typeof ConnectionMessageSchema>

// =============================================================================
// Alert Messages
// =============================================================================

export const AlertSeveritySchema = z.enum(['info', 'warning', 'error', 'critical'])

export const AlertMessageSchema = BaseMessageSchema.extend({
  type: z.literal('alert'),
  data: z.object({
    alertId: z.string(),
    robotId: z.string().optional(),
    severity: AlertSeveritySchema,
    title: z.string(),
    message: z.string(),
    acknowledged: z.boolean().default(false),
  }),
})

export type AlertSeverity = z.infer<typeof AlertSeveritySchema>
export type AlertMessage = z.infer<typeof AlertMessageSchema>

// =============================================================================
// Camera Discovery Messages (imported from camera.ts)
// =============================================================================

import { CameraDiscoveredMessageSchema, CameraLostMessageSchema } from './camera'

export { CameraDiscoveredMessageSchema, CameraLostMessageSchema }
export type { CameraDiscoveredMessage, CameraLostMessage } from './camera'

// =============================================================================
// Camera Streaming & WebRTC Messages (imported from video.ts)
// =============================================================================

import {
  CameraSubscribeMessageSchema,
  CameraUnsubscribeMessageSchema,
  WebRTCOfferMessageSchema,
  WebRTCAnswerMessageSchema,
  WebRTCIceCandidateMessageSchema,
  WebRTCRequestMessageSchema,
  WebRTCStatusMessageSchema,
} from './video'

// =============================================================================
// Vision LLM Messages (imported from vision-llm.ts)
// =============================================================================

import { VisionLlmRequestSchema, VisionLlmResponseSchema } from './vision-llm'

export { VisionLlmRequestSchema, VisionLlmResponseSchema }
export type { VisionLlmRequest, VisionLlmResponse } from './vision-llm'

// =============================================================================
// Machine Stats Messages (imported from machine-stats.ts)
// =============================================================================

import { MachineStatsMessageSchema } from './machine-stats'

export { MachineStatsMessageSchema }
export type { MachineStatsMessage } from './machine-stats'

export {
  CameraSubscribeMessageSchema,
  CameraUnsubscribeMessageSchema,
  WebRTCOfferMessageSchema,
  WebRTCAnswerMessageSchema,
  WebRTCIceCandidateMessageSchema,
  WebRTCRequestMessageSchema,
  WebRTCStatusMessageSchema,
}

export type {
  CameraSubscribeMessage,
  CameraUnsubscribeMessage,
  WebRTCOfferMessage,
  WebRTCAnswerMessage,
  WebRTCIceCandidateMessage,
  WebRTCRequestMessage,
  WebRTCStatusMessage,
} from './video'

// =============================================================================
// Union of All Messages
// =============================================================================

export const WebSocketMessageSchema = z.discriminatedUnion('type', [
  // Robot messages
  RobotStateMessageSchema,
  CommandMessageSchema,
  ConnectionMessageSchema,
  AlertMessageSchema,
  // Camera discovery
  CameraDiscoveredMessageSchema,
  CameraLostMessageSchema,
  // Camera streaming
  CameraSubscribeMessageSchema,
  CameraUnsubscribeMessageSchema,
  // WebRTC signaling
  WebRTCOfferMessageSchema,
  WebRTCAnswerMessageSchema,
  WebRTCIceCandidateMessageSchema,
  WebRTCRequestMessageSchema,
  WebRTCStatusMessageSchema,
  // Vision LLM
  VisionLlmRequestSchema,
  VisionLlmResponseSchema,
  // Machine Stats
  MachineStatsMessageSchema,
])

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>

// =============================================================================
// Helper Functions
// =============================================================================

export function parseWebSocketMessage(data: unknown): WebSocketMessage | null {
  const result = WebSocketMessageSchema.safeParse(data)
  return result.success ? result.data : null
}

export function createMessage<T extends WebSocketMessage['type']>(
  type: T,
  data: Extract<WebSocketMessage, { type: T }>['data']
): Extract<WebSocketMessage, { type: T }> {
  return {
    type,
    timestamp: Date.now(),
    messageId: crypto.randomUUID(),
    data,
  } as Extract<WebSocketMessage, { type: T }>
}
