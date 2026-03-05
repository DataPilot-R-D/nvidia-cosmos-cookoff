/**
 * AiChatModule Component
 *
 * Vision AI chat interface for robot camera analysis.
 * Integrates with ROS2 Vision LLM service via WebSocket.
 *
 * @see research-summary.md F6: Command & Control
 */

'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { useRobotStore } from '@/lib/stores/robot-store'
import { useCommandStore } from '@/lib/stores/command-store'
import { useVisionLlmStore, type VisionLlmMessage } from '@/lib/stores/vision-llm-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import { useWebSocket } from '@/lib/hooks/use-websocket'
import { VisionLlmPresets, type VisionLlmPreset } from '@workspace/shared-types'
import { getHostname } from '@/lib/utils/get-hostname'
import type { ModuleProps } from './ModuleRegistry'
import type { RobotStatus } from '@workspace/shared-types'

// =============================================================================
// Configuration
// =============================================================================

const QUICK_COMMANDS: Array<{ label: string; preset: VisionLlmPreset }> = [
  { label: 'Describe', preset: 'sceneDescription' },
  { label: 'Objects', preset: 'objectDetection' },
  { label: 'Threats', preset: 'threatAssessment' },
]

// =============================================================================
// Helpers
// =============================================================================

function getStatusColor(status: RobotStatus): string {
  switch (status) {
    case 'online':
      return '#00ff00'
    case 'offline':
      return '#666666'
    case 'patrol':
      return '#00ffff'
    case 'alert':
      return '#ff0000'
    case 'warning':
      return '#ffaa00'
    case 'idle':
      return '#888888'
    default:
      return '#666666'
  }
}

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Chat message component with optional image
 */
function Message({
  message,
  isLoading,
  onImageClick,
}: {
  message: VisionLlmMessage
  isLoading?: boolean
  onImageClick?: (messageId: string) => void
}) {
  return (
    <div
      data-testid={`message-${message.id}`}
      className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div
        className={`
          max-w-[85%] px-3 py-2 rounded-lg text-xs
          ${
            message.role === 'user'
              ? 'bg-[#00ffff]/20 text-[#00ffff] rounded-br-none'
              : message.isError
                ? 'bg-[#ff4444]/20 text-[#ff4444] rounded-bl-none'
                : 'bg-[#333333] text-[#888888] rounded-bl-none'
          }
        `}
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="animate-pulse">Analyzing scene...</div>
            <div className="w-3 h-3 border-2 border-[#00ffff] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Image thumbnail for assistant messages */}
            {message.role === 'assistant' && message.frameData && (
              <div className="mb-2">
                <button
                  onClick={() => onImageClick?.(message.id)}
                  className="block w-full rounded overflow-hidden border border-[#444444] hover:border-[#00ffff]/50 transition-colors"
                >
                  <Image
                    src={`data:image/jpeg;base64,${message.frameData}`}
                    alt="Analyzed frame"
                    width={message.frameWidth ?? 320}
                    height={message.frameHeight ?? 180}
                    className="w-full h-auto max-h-32 object-cover"
                    unoptimized
                  />
                </button>
                <div className="text-[8px] text-[#555555] mt-1">
                  {message.frameWidth}x{message.frameHeight}
                </div>
              </div>
            )}
            {/* Message content */}
            <div className="font-mono whitespace-pre-wrap">{message.content}</div>
            {/* Footer with time and processing info */}
            <div className="text-[8px] opacity-50 mt-1 flex justify-between">
              <span>
                {message.processingTime && `${(message.processingTime / 1000).toFixed(1)}s`}
              </span>
              <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Quick command buttons using Vision LLM presets
 */
function QuickCommands({
  onCommand,
  disabled,
}: {
  onCommand: (preset: VisionLlmPreset) => void
  disabled: boolean
}) {
  return (
    <div className="flex gap-1 mb-2 flex-wrap">
      {QUICK_COMMANDS.map((cmd) => (
        <button
          key={cmd.preset}
          onClick={() => onCommand(cmd.preset)}
          disabled={disabled}
          className="px-2 py-1 rounded text-[9px] font-mono uppercase tracking-wider
                     bg-[#1a1a1a] text-[#666666] border border-[#333333]
                     hover:text-[#00ffff] hover:border-[#00ffff]/50 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {cmd.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Robot context indicator
 */
function RobotContext({
  robotName,
  robotStatus,
}: {
  robotName: string | null
  robotStatus: RobotStatus | null
}) {
  if (!robotName) {
    return <div className="text-[9px] text-[#555555] font-mono">No robot selected</div>
  }

  return (
    <div className="flex items-center gap-2 text-[9px] font-mono">
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{ backgroundColor: robotStatus ? getStatusColor(robotStatus) : '#666666' }}
      />
      <span className="text-[#888888]">{robotName}</span>
    </div>
  )
}

/**
 * Image lightbox modal
 */
function ImageLightbox({ imageData, onClose }: { imageData: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div className="relative max-w-[90vw] max-h-[90vh]">
        <Image
          src={`data:image/jpeg;base64,${imageData}`}
          alt="Analyzed frame - full size"
          width={1280}
          height={720}
          className="max-w-full max-h-[90vh] object-contain rounded"
          unoptimized
        />
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center
                     bg-black/50 text-white rounded-full hover:bg-black/70 transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

// =============================================================================
// Main Module Component
// =============================================================================

export function AiChatModule({ windowId }: ModuleProps) {
  const robots = useRobotStore((state) => state.robots)
  const selectedRobotId = useCommandStore((state) => state.selectedRobotId)
  const rosbridgeConnected = useWebSocketStore((state) => state.rosbridgeConnected)

  // Vision LLM store
  const messages = useVisionLlmStore((state) => state.messages)
  const status = useVisionLlmStore((state) => state.status)
  const expandedImageId = useVisionLlmStore((state) => state.expandedImageId)
  const setExpandedImage = useVisionLlmStore((state) => state.setExpandedImage)
  const clearHistory = useVisionLlmStore((state) => state.clearHistory)

  // WebSocket hook for sending requests
  const { sendVisionLlmRequest, isConnected } = useWebSocket(
    process.env.NEXT_PUBLIC_WS_URL || `http://${getHostname()}:8081`
  )

  const [inputValue, setInputValue] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Get selected robot details
  const selectedRobot = useMemo(() => {
    return selectedRobotId ? robots.get(selectedRobotId) : undefined
  }, [robots, selectedRobotId])

  // Get expanded image data
  const expandedImage = useMemo(() => {
    if (!expandedImageId) return null
    const message = messages.find((m) => m.id === expandedImageId)
    return message?.frameData || null
  }, [expandedImageId, messages])

  // Scroll to bottom when new messages
  useEffect(() => {
    if (typeof messagesEndRef.current?.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Check if we can send requests
  const canSend = isConnected && rosbridgeConnected && status !== 'analyzing'

  // Handle sending message
  const handleSend = useCallback(
    (prompt?: string) => {
      const text = prompt || inputValue.trim()
      if (!text || !canSend) return

      sendVisionLlmRequest(text, {
        robotId: selectedRobotId || undefined,
      })

      setInputValue('')
    },
    [inputValue, canSend, sendVisionLlmRequest, selectedRobotId]
  )

  // Handle quick command
  const handleQuickCommand = useCallback(
    (preset: VisionLlmPreset) => {
      if (!canSend) return
      const prompt = VisionLlmPresets[preset]
      handleSend(prompt)
    },
    [canSend, handleSend]
  )

  // Handle Enter key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  // Handle image click
  const handleImageClick = useCallback(
    (messageId: string) => {
      setExpandedImage(messageId)
    },
    [setExpandedImage]
  )

  // Close lightbox
  const handleCloseLightbox = useCallback(() => {
    setExpandedImage(null)
  }, [setExpandedImage])

  const isAnalyzing = status === 'analyzing'

  return (
    <div
      className="h-full w-full flex flex-col bg-[#0a0a0a] p-3"
      data-testid={`module-ai-chat-${windowId}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#222222]">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#666666] font-mono uppercase tracking-wider">
            VISION AI
          </span>
          {!rosbridgeConnected && (
            <span className="text-[8px] text-[#ff4444] font-mono px-1 py-0.5 bg-[#ff4444]/10 rounded">
              OFFLINE
            </span>
          )}
          {messages.length > 0 && (
            <button
              onClick={clearHistory}
              className="text-[8px] text-[#555555] font-mono hover:text-[#888888] transition-colors"
              title="Clear history"
            >
              [clear]
            </button>
          )}
        </div>
        <RobotContext
          robotName={selectedRobot?.name ?? null}
          robotStatus={selectedRobot?.status ?? null}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto mb-3 pr-1">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <div className="text-[#333333] text-xs font-mono uppercase tracking-wider mb-1">
                Vision Analysis
              </div>
              <div className="text-[#555555] text-[10px]">
                Ask AI to analyze the robot camera feed
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <Message key={msg.id} message={msg} onImageClick={handleImageClick} />
            ))}
            {isAnalyzing && (
              <Message
                message={{
                  id: 'loading',
                  role: 'assistant',
                  content: '',
                  timestamp: Date.now(),
                }}
                isLoading
              />
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Quick Commands */}
      <QuickCommands onCommand={handleQuickCommand} disabled={!canSend} />

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!canSend}
          placeholder={
            !isConnected
              ? 'Connecting...'
              : !rosbridgeConnected
                ? 'ROSBridge offline'
                : isAnalyzing
                  ? 'Analyzing...'
                  : 'Ask about the scene...'
          }
          className="flex-1 bg-[#1a1a1a] border border-[#333333] rounded px-3 py-2
                     text-xs text-[#888888] font-mono
                     focus:outline-none focus:border-[#00ffff]/50
                     placeholder:text-[#444444]
                     disabled:opacity-50"
        />
        <button
          onClick={() => handleSend()}
          disabled={!canSend || !inputValue.trim()}
          className="px-3 py-2 bg-[#00ffff]/20 text-[#00ffff] rounded
                     text-[10px] font-mono uppercase tracking-wider
                     hover:bg-[#00ffff]/30 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAnalyzing ? 'Wait' : 'Send'}
        </button>
      </div>

      {/* Image Lightbox */}
      {expandedImage && <ImageLightbox imageData={expandedImage} onClose={handleCloseLightbox} />}
    </div>
  )
}

export default AiChatModule
