'use client'

/**
 * VideoPlayer Component
 *
 * Supports WebRTC MediaStream for low-latency video
 * Uses Canvas + putImageData for raw RGB rendering (CPU pixel conversion)
 * Falls back to img tag for JPEG data
 */

import { type ReactNode, useEffect, useRef } from 'react'

export interface VideoPlayerProps {
  streamUrl: string | null
  frameDataUrl: string | null
  rawData: Uint8Array | null
  frameMetadata: { width: number; height: number; format: string; encoding?: string } | null
  status: 'connecting' | 'live' | 'error' | 'stopped'
  activeMode: 'webrtc' | 'websocket' | null
  mediaStream: MediaStream | null
}

export function VideoPlayer({
  streamUrl,
  frameDataUrl,
  rawData,
  frameMetadata,
  status,
  activeMode,
  mediaStream,
}: VideoPlayerProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const rafRef = useRef<number>(0)

  // Handle WebRTC MediaStream attachment
  // Depends on both mediaStream AND activeMode because the <video> element
  // is conditionally mounted only when activeMode === 'webrtc'.
  // Without activeMode in deps, srcObject is never set when the video mounts
  // after the mediaStream was already available.
  useEffect(() => {
    const video = videoRef.current
    if (video && mediaStream) {
      video.srcObject = mediaStream
    }
    return () => {
      if (video) {
        video.srcObject = null
      }
    }
  }, [mediaStream, activeMode])

  // Render raw RGB data on Canvas (CPU pixel conversion via putImageData)
  useEffect(() => {
    if (!rawData || !frameMetadata || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    // Cancel any pending RAF
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }

    rafRef.current = requestAnimationFrame(() => {
      try {
        const { width, height } = frameMetadata
        const encoding = (frameMetadata as { encoding?: string }).encoding || 'rgb8'

        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width
          canvas.height = height
        }

        const imageData = ctx.createImageData(width, height)
        const pixels = imageData.data

        if (encoding === 'rgb8') {
          for (let i = 0, j = 0; i < rawData.length && j < pixels.length; i += 3, j += 4) {
            pixels[j] = rawData[i]
            pixels[j + 1] = rawData[i + 1]
            pixels[j + 2] = rawData[i + 2]
            pixels[j + 3] = 255
          }
        } else if (encoding === 'bgr8') {
          for (let i = 0, j = 0; i < rawData.length && j < pixels.length; i += 3, j += 4) {
            pixels[j] = rawData[i + 2]
            pixels[j + 1] = rawData[i + 1]
            pixels[j + 2] = rawData[i]
            pixels[j + 3] = 255
          }
        } else if (encoding === 'rgba8') {
          pixels.set(rawData.subarray(0, pixels.length))
        } else if (encoding === 'bgra8') {
          for (let i = 0; i < rawData.length && i < pixels.length; i += 4) {
            pixels[i] = rawData[i + 2]
            pixels[i + 1] = rawData[i + 1]
            pixels[i + 2] = rawData[i]
            pixels[i + 3] = rawData[i + 3]
          }
        }

        ctx.putImageData(imageData, 0, 0)
      } catch (err) {
        if (typeof window !== 'undefined' && 'console' in window) {
          window.console.debug('[VideoPlayer] Canvas rendering error:', err)
        }
      }
    })

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [rawData, frameMetadata])

  // For JPEG frames, update img src
  useEffect(() => {
    if (!frameDataUrl || !imgRef.current || rawData) return

    rafRef.current = requestAnimationFrame(() => {
      if (imgRef.current) {
        imgRef.current.src = frameDataUrl
      }
    })

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [frameDataUrl, rawData])

  // Determine what to show
  const hasWebRTCStream = mediaStream && activeMode === 'webrtc'
  const hasRawData = rawData && frameMetadata && !hasWebRTCStream
  const hasJpegData = frameDataUrl && !rawData && !hasWebRTCStream
  const showOverlay = status !== 'live' && !hasWebRTCStream && !hasRawData && !hasJpegData

  return (
    <div className="relative h-full bg-black rounded overflow-hidden">
      {hasWebRTCStream && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-contain"
          data-testid="webrtc-video"
          onError={() => {
            if (typeof window !== 'undefined' && 'console' in window) {
              window.console.debug('[VideoPlayer] WebRTC video playback error')
            }
          }}
        />
      )}

      {hasRawData && (
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain"
          data-testid="camera-canvas"
          style={{ imageRendering: 'auto' }}
        />
      )}

      {hasJpegData && (
        /* eslint-disable-next-line @next/next/no-img-element -- dynamic data-URL frames from WebSocket; next/image incompatible */
        <img
          ref={imgRef}
          alt="Camera feed"
          className="w-full h-full object-contain"
          data-testid="camera-frame"
        />
      )}

      {!hasWebRTCStream && !hasRawData && !hasJpegData && streamUrl && (
        <video
          src={streamUrl}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-contain"
          data-testid="video-player"
        />
      )}

      {!hasWebRTCStream && !hasRawData && !hasJpegData && !streamUrl && (
        <div className="w-full h-full flex items-center justify-center">
          <div className="text-[#333333] text-6xl">📷</div>
        </div>
      )}

      {/* Status overlay */}
      {showOverlay && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
          <div className="text-center">
            {status === 'connecting' && (
              <>
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <span className="text-[10px] text-[#888888] uppercase tracking-wider">
                  Connecting...
                </span>
              </>
            )}
            {status === 'error' && (
              <>
                <div className="text-red-500 text-2xl mb-2">⚠</div>
                <span className="text-[10px] text-red-400 uppercase tracking-wider">
                  Stream Error
                </span>
              </>
            )}
            {status === 'stopped' && (
              <span className="text-[10px] text-[#555555] uppercase tracking-wider">
                Stream Stopped
              </span>
            )}
          </div>
        </div>
      )}

      <div className="absolute top-2 right-2">
        <span
          className={`
            px-1.5 py-0.5 text-[9px] font-mono uppercase rounded
            ${
              hasWebRTCStream
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : hasRawData
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : hasJpegData
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
            }
          `}
        >
          {hasWebRTCStream ? 'WebRTC' : hasRawData ? 'RAW' : hasJpegData ? 'JPEG' : 'NONE'}
        </span>
      </div>
    </div>
  )
}
