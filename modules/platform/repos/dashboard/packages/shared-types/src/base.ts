/**
 * Base Message Schema
 *
 * Shared base schema for all WebSocket messages.
 * Extracted to prevent circular dependencies.
 */

import { z } from 'zod'

// =============================================================================
// Base Message Schema
// =============================================================================

/**
 * Base structure for all WebSocket messages
 */
export const BaseMessageSchema = z.object({
  type: z.string(),
  timestamp: z.number(),
  messageId: z.string().uuid().optional(),
})

export type BaseMessage = z.infer<typeof BaseMessageSchema>
