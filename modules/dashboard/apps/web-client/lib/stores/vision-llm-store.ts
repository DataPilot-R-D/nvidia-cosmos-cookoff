/**
 * Vision LLM Store
 *
 * Zustand store for Vision LLM state management.
 * Handles request tracking, responses, and chat history.
 *
 * @see plan.md - Vision LLM Integration
 */

import { create } from 'zustand'
import type { VisionLlmStatus, VisionLlmPreset } from '@workspace/shared-types'

// =============================================================================
// Types
// =============================================================================

export interface VisionLlmMessage {
  /** Unique message ID */
  id: string
  /** Message role: user or assistant */
  role: 'user' | 'assistant'
  /** Message content */
  content: string
  /** Timestamp in milliseconds */
  timestamp: number
  /** Processing time in ms (for assistant messages) */
  processingTime?: number
  /** Base64 encoded JPEG frame (for assistant messages) */
  frameData?: string
  /** Frame width */
  frameWidth?: number
  /** Frame height */
  frameHeight?: number
  /** Preset used (for user messages) */
  preset?: VisionLlmPreset
  /** Error flag for failed responses */
  isError?: boolean
}

export interface VisionLlmState {
  /** Current status */
  status: VisionLlmStatus
  /** Message history */
  messages: VisionLlmMessage[]
  /** Current pending request ID (for correlation) */
  pendingRequestId: string | null
  /** Last error message */
  error: string | null
  /** Selected temperature (0-1) */
  temperature: number
  /** Selected max tokens */
  maxOutputTokens: number
  /** Expanded image ID for lightbox */
  expandedImageId: string | null
}

export interface VisionLlmActions {
  /** Send analysis request - returns requestId */
  sendRequest: (prompt: string, preset?: VisionLlmPreset) => string
  /** Handle response from server */
  handleResponse: (response: {
    requestId: string
    success: boolean
    response?: string
    error?: string
    processingTime?: number
    frameData?: string
    frameWidth?: number
    frameHeight?: number
  }) => void
  /** Clear chat history */
  clearHistory: () => void
  /** Set temperature */
  setTemperature: (temp: number) => void
  /** Set max output tokens */
  setMaxOutputTokens: (tokens: number) => void
  /** Reset error state */
  clearError: () => void
  /** Set expanded image for lightbox */
  setExpandedImage: (messageId: string | null) => void
}

// =============================================================================
// Helpers
// =============================================================================

function generateId(): string {
  return `vlm-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// =============================================================================
// Store
// =============================================================================

export const useVisionLlmStore = create<VisionLlmState & VisionLlmActions>((set, get) => ({
  // Initial state
  status: 'idle',
  messages: [],
  pendingRequestId: null,
  error: null,
  temperature: 0.1,
  maxOutputTokens: 4000,
  expandedImageId: null,

  // Actions
  sendRequest: (prompt: string, preset?: VisionLlmPreset): string => {
    const requestId = generateId()
    const userMessage: VisionLlmMessage = {
      id: generateId(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
      preset,
    }

    set((state) => ({
      status: 'analyzing',
      pendingRequestId: requestId,
      error: null,
      messages: [...state.messages, userMessage],
    }))

    return requestId
  },

  handleResponse: (response) => {
    const { pendingRequestId, messages } = get()

    // Verify this response matches our pending request
    if (response.requestId !== pendingRequestId) {
      return // Stale response, ignore
    }

    const assistantMessage: VisionLlmMessage = {
      id: generateId(),
      role: 'assistant',
      content: response.success
        ? response.response || 'No response received'
        : response.error || 'Unknown error',
      timestamp: Date.now(),
      processingTime: response.processingTime,
      frameData: response.frameData,
      frameWidth: response.frameWidth,
      frameHeight: response.frameHeight,
      isError: !response.success,
    }

    set({
      status: response.success ? 'success' : 'error',
      pendingRequestId: null,
      error: response.success ? null : response.error || null,
      messages: [...messages, assistantMessage],
    })
  },

  clearHistory: () => {
    set({
      messages: [],
      status: 'idle',
      pendingRequestId: null,
      error: null,
      expandedImageId: null,
    })
  },

  setTemperature: (temp: number) => {
    set({ temperature: Math.max(0, Math.min(1, temp)) })
  },

  setMaxOutputTokens: (tokens: number) => {
    set({ maxOutputTokens: Math.max(100, Math.min(32000, tokens)) })
  },

  clearError: () => {
    set({ error: null, status: 'idle' })
  },

  setExpandedImage: (messageId: string | null) => {
    set({ expandedImageId: messageId })
  },
}))
