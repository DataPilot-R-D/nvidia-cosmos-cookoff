/**
 * Vision LLM Types
 *
 * Schemas for ROS2 Vision LLM service communication.
 * Service: /vision_llm/analyze (my_srvs/srv/VisionLLM)
 * Result Topic: /vision_llm/result (my_srvs/msg/VisionLLMResult)
 *
 * @module @workspace/shared-types/vision-llm
 */

import { z } from 'zod'
import { BaseMessageSchema } from './base'

// =============================================================================
// Vision LLM Request (web-client -> websocket-server -> ROS2)
// =============================================================================

export const VisionLlmRequestDataSchema = z.object({
  /** Unique request ID for response correlation */
  requestId: z.string(),
  /** Analysis prompt (e.g., "Describe the scene. List objects and threats.") */
  prompt: z.string().min(1).max(5000),
  /** Temperature for LLM generation (0.0-1.0, lower = more deterministic) */
  temperature: z.number().min(0).max(1).default(0.1),
  /** Maximum output tokens for response (higher for models with reasoning) */
  maxOutputTokens: z.number().int().min(100).max(32000).default(4000),
  /** Robot ID providing the camera feed (optional) */
  robotId: z.string().optional(),
})

export const VisionLlmRequestSchema = BaseMessageSchema.extend({
  type: z.literal('vision_llm_request'),
  data: VisionLlmRequestDataSchema,
})

export type VisionLlmRequestData = z.infer<typeof VisionLlmRequestDataSchema>
export type VisionLlmRequest = z.infer<typeof VisionLlmRequestSchema>

// =============================================================================
// Vision LLM Response (ROS2 -> websocket-server -> web-client)
// =============================================================================

export const VisionLlmResponseDataSchema = z.object({
  /** Request ID this response corresponds to */
  requestId: z.string(),
  /** Whether the service call succeeded */
  success: z.boolean(),
  /** LLM analysis response text */
  response: z.string().optional(),
  /** Error message if success is false */
  error: z.string().optional(),
  /** Processing time in milliseconds */
  processingTime: z.number().optional(),
  /** Base64 encoded JPEG - the frame that was analyzed */
  frameData: z.string().optional(),
  /** Frame dimensions */
  frameWidth: z.number().int().positive().optional(),
  frameHeight: z.number().int().positive().optional(),
})

export const VisionLlmResponseSchema = BaseMessageSchema.extend({
  type: z.literal('vision_llm_response'),
  data: VisionLlmResponseDataSchema,
})

export type VisionLlmResponseData = z.infer<typeof VisionLlmResponseDataSchema>
export type VisionLlmResponse = z.infer<typeof VisionLlmResponseSchema>

// =============================================================================
// Vision LLM Status
// =============================================================================

export const VisionLlmStatusSchema = z.enum(['idle', 'analyzing', 'success', 'error'])

export type VisionLlmStatus = z.infer<typeof VisionLlmStatusSchema>

// =============================================================================
// Preset Prompts for Quick Commands
// =============================================================================

export const VisionLlmPresets = {
  sceneDescription: 'Opisz scenę. Wypisz obiekty i potencjalne zagrożenia.',
  objectDetection: 'Wykryj i wymień wszystkie obiekty widoczne na obrazie.',
  threatAssessment: 'Oceń potencjalne zagrożenia bezpieczeństwa na scenie.',
  pathAnalysis: 'Przeanalizuj możliwe trasy przejścia robota.',
  personDetection: 'Wykryj obecność osób i opisz ich lokalizację.',
} as const

export type VisionLlmPreset = keyof typeof VisionLlmPresets

// =============================================================================
// Helper Functions
// =============================================================================

export function createVisionLlmRequest(
  prompt: string,
  options?: {
    temperature?: number
    maxOutputTokens?: number
    robotId?: string
  }
): VisionLlmRequest {
  return {
    type: 'vision_llm_request',
    timestamp: Date.now(),
    messageId: crypto.randomUUID(),
    data: {
      requestId: crypto.randomUUID(),
      prompt,
      temperature: options?.temperature ?? 0.1,
      maxOutputTokens: options?.maxOutputTokens ?? 4000,
      robotId: options?.robotId,
    },
  }
}

export function validateVisionLlmRequest(data: unknown): VisionLlmRequest | null {
  const result = VisionLlmRequestSchema.safeParse(data)
  return result.success ? result.data : null
}

export function validateVisionLlmResponse(data: unknown): VisionLlmResponse | null {
  const result = VisionLlmResponseSchema.safeParse(data)
  return result.success ? result.data : null
}
