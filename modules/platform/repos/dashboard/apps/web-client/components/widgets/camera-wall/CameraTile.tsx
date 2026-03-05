'use client'

/**
 * CameraTile Component
 *
 * Individual camera tile for the Camera Wall grid.
 * Shows video feed with status overlay (name, LIVE/FALLBACK, latency, fps).
 * Supports connecting/retry/offline states.
 */

import { type ReactNode, useCallback } from 'react'
import { useCameraStream } from '@/lib/hooks/use-camera-stream'
import { VideoPlayer } from '../VideoPlayer'

// =============================================================================
// Types
// =============================================================================

export interface CameraSource {
  /** Unique ID for this source */
  id: string
  /** Display name */
  name: string
  /** Camera ID in the camera store */
  cameraId: string
  /** Source type: simulation or real CCTV */
  type: 'sim' | 'cctv'
}

export interface CameraTileProps {
  /** Camera source to display */
  source: CameraSource
  /** Whether this tile is focused (enlarged) */
  isFocused?: boolean
  /** Click handler for focus mode */
  onClick?: (sourceId: string) => void
  /** Whether streaming is enabled (max 4 concurrent guardrail) */
  enabled?: boolean
}

// =============================================================================
// Sub-Components
// =============================================================================

function StatusBadge({ status, isFallback }: { status: string; isFallback: boolean }): ReactNode {
  if (isFallback) {
    return (
      <span className="px-1.5 py-0.5 text-[8px] font-mono uppercase rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
        FALLBACK
      </span>
    )
  }

  const config = {
    live: {
      bg: 'bg-green-500/20',
      text: 'text-green-400',
      border: 'border-green-500/30',
      label: 'LIVE',
    },
    connecting: {
      bg: 'bg-yellow-500/20',
      text: 'text-yellow-400',
      border: 'border-yellow-500/30',
      label: 'CONNECTING',
    },
    error: {
      bg: 'bg-red-500/20',
      text: 'text-red-400',
      border: 'border-red-500/30',
      label: 'OFFLINE',
    },
    stopped: {
      bg: 'bg-gray-500/20',
      text: 'text-gray-400',
      border: 'border-gray-500/30',
      label: 'OFFLINE',
    },
  }[status] ?? {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    border: 'border-gray-500/30',
    label: 'UNKNOWN',
  }

  return (
    <span
      className={`px-1.5 py-0.5 text-[8px] font-mono uppercase rounded ${config.bg} ${config.text} border ${config.border}`}
    >
      {config.label}
    </span>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function CameraTile({
  source,
  isFocused,
  onClick,
  enabled = true,
}: CameraTileProps): ReactNode {
  const {
    activeMode,
    streamUrl,
    status,
    fps,
    latency,
    frameDataUrl,
    rawData,
    frameMetadata,
    mediaStream,
    isFallback,
    retryCount,
  } = useCameraStream(enabled ? source.cameraId : null, 'auto')

  const handleClick = useCallback(() => {
    onClick?.(source.id)
  }, [onClick, source.id])

  const sourceLabel = source.type === 'sim' ? 'SIM' : 'CCTV'

  return (
    <div
      className={`
        relative flex flex-col bg-[#0d0f11] border rounded overflow-hidden cursor-pointer
        transition-all duration-200
        ${
          isFocused
            ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/10'
            : 'border-[#222222] hover:border-[#444444]'
        }
      `}
      onClick={handleClick}
      data-testid={`camera-tile-${source.id}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick()
      }}
      aria-label={`Camera: ${source.name}`}
    >
      {/* Video area */}
      <div className="flex-1 min-h-0 relative">
        {enabled ? (
          <VideoPlayer
            streamUrl={streamUrl}
            frameDataUrl={frameDataUrl}
            rawData={rawData}
            frameMetadata={frameMetadata}
            status={status}
            activeMode={activeMode}
            mediaStream={mediaStream}
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-black">
            <span className="text-[9px] text-[#444444] font-mono uppercase">INACTIVE</span>
          </div>
        )}
      </div>

      {/* Overlay bar at bottom */}
      <div className="flex items-center justify-between px-2 py-1 bg-[#0a0c0e]/90 border-t border-[#1a1a1a]">
        <div className="flex items-center gap-2 min-w-0">
          {/* Source type badge */}
          <span
            className={`
            px-1 py-0.5 text-[7px] font-mono uppercase rounded
            ${
              source.type === 'sim'
                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            }
          `}
          >
            {sourceLabel}
          </span>
          {/* Camera name */}
          <span className="text-[9px] text-[#888888] font-mono truncate">{source.name}</span>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Metrics */}
          {fps !== null && (
            <span className="text-[8px] text-[#555555] font-mono">{fps.toFixed(0)}fps</span>
          )}
          {latency !== null && activeMode === 'webrtc' && (
            <span className="text-[8px] text-[#555555] font-mono">{latency}ms</span>
          )}
          {/* Status badge */}
          <StatusBadge status={status} isFallback={isFallback} />
        </div>
      </div>

      {/* Retry indicator */}
      {retryCount > 0 && status === 'connecting' && (
        <div className="absolute top-1 left-1">
          <span className="px-1 py-0.5 text-[7px] text-yellow-400 font-mono bg-black/70 rounded">
            retry {retryCount}/3
          </span>
        </div>
      )}
    </div>
  )
}

export default CameraTile
