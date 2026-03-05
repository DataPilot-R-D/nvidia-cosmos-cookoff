/**
 * Vision LLM Handler
 *
 * Handles Vision LLM service calls to ROS2 via ROSBridge.
 * Service: /vision_llm/analyze (my_srvs/srv/VisionLLM)
 * Result Topic: /vision_llm/result (my_srvs/msg/VisionLLMResult)
 */

import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Logger } from 'pino'
import sharp from 'sharp'
import { z } from 'zod'

// =============================================================================
// Local Schema Definition (matches @workspace/shared-types/vision-llm)
// =============================================================================

const VisionLlmRequestDataSchema = z.object({
  requestId: z.string(),
  prompt: z.string().min(1).max(5000),
  temperature: z.number().min(0).max(1).default(0.1),
  maxOutputTokens: z.number().int().min(100).max(32000).default(4000),
  robotId: z.string().optional(),
})

const VisionLlmRequestSchema = z.object({
  type: z.literal('vision_llm_request'),
  timestamp: z.number(),
  messageId: z.string().uuid().optional(),
  data: VisionLlmRequestDataSchema,
})

// =============================================================================
// Types
// =============================================================================

interface PendingVisionLlmRequest {
  requestId: string
  socketId: string
  prompt: string
  startTime: number
  timeout: NodeJS.Timeout
}

// =============================================================================
// Module State
// =============================================================================

/** Map of pending requests (prompt -> request details) for correlation */
const pendingRequests = new Map<string, PendingVisionLlmRequest>()

/** Request timeout (120 seconds - LLM can take time) */
const REQUEST_TIMEOUT_MS = 120000

/** Reference to Socket.IO server for emitting responses */
let ioRef: SocketIOServer | null = null

/** Reference to logger */
let loggerRef: Logger | null = null

// =============================================================================
// Initialization
// =============================================================================

export function initVisionLlm(io: SocketIOServer, logger: Logger): void {
  ioRef = io
  loggerRef = logger
  logger.info('Vision LLM handler initialized')
}

// =============================================================================
// Socket Event Handlers
// =============================================================================

export function registerVisionLlmHandlers(
  io: SocketIOServer,
  socket: Socket,
  callService: (service: string, args: unknown, id: string) => void,
  subscribe: (topic: string, type?: string) => void,
  logger: Logger
): void {
  // Store references
  ioRef = io
  loggerRef = logger

  // Subscribe to Vision LLM result topic
  subscribe('/vision_llm/result', 'my_srvs/msg/VisionLLMResult')

  /**
   * Handle vision_llm_analyze request from web client
   */
  socket.on('vision_llm_analyze', (data: unknown) => {
    logger.info(
      { socketId: socket.id, dataKeys: data ? Object.keys(data as object) : null },
      '>>> vision_llm_analyze event received'
    )

    // Validate request with Zod
    const parsed = VisionLlmRequestSchema.safeParse(data)
    if (!parsed.success) {
      logger.warn({ error: parsed.error.flatten(), data }, 'Invalid vision_llm_analyze request')
      socket.emit('vision_llm_response', {
        type: 'vision_llm_response',
        timestamp: Date.now(),
        data: {
          requestId: (data as { data?: { requestId?: string } })?.data?.requestId || 'unknown',
          success: false,
          error: 'Invalid request format',
        },
      })
      return
    }

    const request = parsed.data
    const { requestId, prompt, temperature, maxOutputTokens } = request.data

    logger.info(
      { requestId, promptLength: prompt.length, temperature, maxOutputTokens },
      'Processing Vision LLM request'
    )

    // Set up timeout
    const timeout = setTimeout(() => {
      pendingRequests.delete(prompt)
      logger.error({ requestId, prompt: prompt.slice(0, 50) }, 'Vision LLM request timed out')
      socket.emit('vision_llm_response', {
        type: 'vision_llm_response',
        timestamp: Date.now(),
        data: {
          requestId,
          success: false,
          error: 'Request timed out after 120 seconds',
        },
      })
    }, REQUEST_TIMEOUT_MS)

    // Store pending request - use prompt for correlation since topic contains it
    pendingRequests.set(prompt, {
      requestId,
      socketId: socket.id,
      prompt,
      startTime: Date.now(),
      timeout,
    })

    logger.info(
      { requestId, promptKey: prompt.slice(0, 50), pendingCount: pendingRequests.size },
      '>>> Stored pending request'
    )

    // Call ROS2 service via ROSBridge
    const serviceArgs = {
      prompt,
      temperature,
      max_output_tokens: maxOutputTokens,
    }
    logger.info({ requestId, serviceArgs }, '>>> Calling ROS2 service')
    callService('/vision_llm/analyze', serviceArgs, `vision_llm_${requestId}`)

    logger.info({ requestId, service: '/vision_llm/analyze' }, 'Sent Vision LLM service call')
  })
}

// =============================================================================
// Topic Message Handler
// =============================================================================

/**
 * Handle VisionLLMResult message from topic /vision_llm/result
 * Called from rosbridge client message handler
 */
export async function handleVisionLlmResult(msg: Record<string, unknown>): Promise<boolean> {
  if (!ioRef || !loggerRef) {
    console.log('>>> handleVisionLlmResult called but ioRef or loggerRef is null')
    return false
  }

  const logger = loggerRef
  const io = ioRef

  logger.info(
    { msgKeys: Object.keys(msg), pendingCount: pendingRequests.size },
    '>>> handleVisionLlmResult called'
  )

  // Extract fields from VisionLLMResult
  const prompt = msg.prompt as string
  const response = msg.response as string
  const image = msg.image as Record<string, unknown> | undefined

  logger.info(
    {
      hasPrompt: !!prompt,
      hasResponse: !!response,
      hasImage: !!image,
      promptPreview: prompt?.slice(0, 50),
    },
    '>>> VisionLLMResult fields'
  )

  if (!prompt) {
    logger.warn({ msgKeys: Object.keys(msg) }, 'VisionLLMResult missing prompt field')
    return false
  }

  // Find pending request by prompt
  const pending = pendingRequests.get(prompt)

  // Log all pending request keys for debugging
  const pendingKeys = Array.from(pendingRequests.keys()).map((k) => k.slice(0, 30))
  logger.info({ pendingKeys, searchingFor: prompt.slice(0, 30) }, '>>> Looking for pending request')

  if (!pending) {
    logger.warn(
      { prompt: prompt.slice(0, 50), pendingKeys },
      'Received Vision LLM result for unknown request'
    )
    return true // Still handled, just no matching request
  }

  logger.info(
    { requestId: pending.requestId, socketId: pending.socketId },
    '>>> Found pending request!'
  )

  // Clear timeout and remove from pending
  clearTimeout(pending.timeout)
  pendingRequests.delete(prompt)

  const processingTime = Date.now() - pending.startTime

  logger.info(
    { requestId: pending.requestId, processingTime, responseLength: response?.length },
    'Vision LLM response received'
  )

  // Convert image to base64 JPEG if present
  let frameData: string | undefined
  let frameWidth: number | undefined
  let frameHeight: number | undefined

  if (image) {
    try {
      const width = image.width as number
      const height = image.height as number
      const encoding = image.encoding as string
      const data = image.data as string // Base64 encoded raw pixel data

      frameWidth = width
      frameHeight = height

      // Decode base64 to raw buffer
      const rawBuffer = Buffer.from(data, 'base64')

      // Determine channels based on encoding
      let channels: 3 | 4 = 3
      if (encoding === 'rgba8' || encoding === 'bgra8') {
        channels = 4
      }

      // Convert to JPEG using Sharp
      const jpegBuffer = await sharp(rawBuffer, {
        raw: {
          width: width || 640,
          height: height || 480,
          channels,
        },
      })
        .jpeg({ quality: 85 })
        .toBuffer()

      frameData = jpegBuffer.toString('base64')

      logger.info(
        { requestId: pending.requestId, width, height, encoding, jpegSize: frameData.length },
        'Converted Vision LLM frame to JPEG'
      )
    } catch (err) {
      logger.error(
        { error: err, requestId: pending.requestId },
        'Failed to convert Vision LLM image'
      )
    }
  }

  // Send response to the requesting client
  io.to(pending.socketId).emit('vision_llm_response', {
    type: 'vision_llm_response',
    timestamp: Date.now(),
    data: {
      requestId: pending.requestId,
      success: true,
      response,
      processingTime,
      frameData,
      frameWidth,
      frameHeight,
    },
  })

  return true
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Cleanup pending requests on client disconnect
 */
export function cleanupVisionLlmRequests(socketId: string): void {
  for (const [prompt, pending] of pendingRequests) {
    if (pending.socketId === socketId) {
      clearTimeout(pending.timeout)
      pendingRequests.delete(prompt)
      loggerRef?.info(
        { requestId: pending.requestId, socketId },
        'Cleaned up Vision LLM request on disconnect'
      )
    }
  }
}

/**
 * Get count of pending requests (for debugging)
 */
export function getPendingRequestCount(): number {
  return pendingRequests.size
}
