/**
 * OccupancyGrid Canvas Component
 *
 * Renders ROS OccupancyGrid data on a canvas overlay.
 *
 * Performance Optimizations:
 * - Bulk bitmap rendering using ImageData (not fillRect loop)
 * - Pre-computed color lookup tables (no runtime color calculation)
 * - Zoom decoupling: bitmap rendered once, transformed on zoom
 *
 * Architecture:
 * - Canvas element ALWAYS fills 100% of container (never shrinks)
 * - Zoom/pan only affects content drawn INSIDE the canvas via ctx transforms
 * - Viewport state passed as prop (from ReactFlow onMove callback)
 */

'use client'

import { useRef, useEffect, useCallback } from 'react'
import { useCostmapStore, type OccupancyGridData } from '@/lib/stores/costmap-store'
import { MAP_SCALE } from './types'
import { getColorLUT } from './utils/color-lut'

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface OccupancyGridCanvasProps {
  gridData: OccupancyGridData | undefined
  visible: boolean
  opacity?: number
  colorScheme?: 'map' | 'costmap'
  viewport: Viewport
}

export function OccupancyGridCanvas({
  gridData,
  visible,
  opacity = 0.6,
  colorScheme = 'map',
  viewport,
}: OccupancyGridCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bitmapCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastDataKeyRef = useRef<string | null>(null)

  // ==========================================================================
  // Effect 1: Render grid data to bitmap (only when data changes)
  // This is the expensive operation - runs only when gridData changes
  // ==========================================================================
  useEffect(() => {
    if (!gridData) return

    // Check if data actually changed (compare topic + timestamp)
    const dataKey = `${gridData.topic}-${gridData.timestamp}`
    if (lastDataKeyRef.current === dataKey && bitmapCanvasRef.current) {
      return // Data hasn't changed, skip re-rendering
    }
    lastDataKeyRef.current = dataKey

    // Decode grid data
    const decoded = useCostmapStore.getState().decodeGridData(gridData.topic)
    if (!decoded) return

    const { width, height } = gridData

    // Performance measurement (dev only)
    const startTime = performance.now()

    // Create/reuse offscreen canvas for bitmap
    if (!bitmapCanvasRef.current) {
      bitmapCanvasRef.current = document.createElement('canvas')
    }
    const bitmapCanvas = bitmapCanvasRef.current
    bitmapCanvas.width = width
    bitmapCanvas.height = height

    const bitmapCtx = bitmapCanvas.getContext('2d')
    if (!bitmapCtx) return

    // Get pre-computed color lookup table
    const lut = getColorLUT(colorScheme)

    // Create ImageData for bulk pixel manipulation
    const imageData = bitmapCtx.createImageData(width, height)
    const data = imageData.data

    // Bulk render: single pass through all pixels using LUT
    // This replaces the nested fillRect loop (10x faster)
    for (let i = 0; i < decoded.length; i++) {
      const value = decoded[i]
      // Map value (-1 to 100) to LUT offset (0 to 101)
      // Clamp to valid range to prevent out-of-bounds access
      const clampedValue = Math.max(-1, Math.min(100, value))
      const lutOffset = (clampedValue + 1) * 4
      const pixelOffset = i * 4

      // Direct byte copy from LUT (no color computation)
      data[pixelOffset] = lut[lutOffset] // R
      data[pixelOffset + 1] = lut[lutOffset + 1] // G
      data[pixelOffset + 2] = lut[lutOffset + 2] // B
      data[pixelOffset + 3] = lut[lutOffset + 3] // A
    }

    // Single putImageData call (much faster than thousands of fillRect)
    bitmapCtx.putImageData(imageData, 0, 0)

    // Performance logging (dev only)
    if (process.env.NODE_ENV === 'development') {
      const renderTime = performance.now() - startTime
      // eslint-disable-next-line no-console
      console.log(
        `[OccupancyGrid] Bitmap render: ${renderTime.toFixed(1)}ms (${width}x${height} = ${width * height} cells)`
      )
    }
  }, [gridData, colorScheme])

  // ==========================================================================
  // Effect 2: Draw cached bitmap with viewport transform (fast)
  // This runs on every zoom/pan but only draws the cached bitmap
  // ==========================================================================
  const drawBitmap = useCallback(() => {
    if (!visible || !gridData || !canvasRef.current || !bitmapCanvasRef.current) {
      return
    }

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height, resolution, origin } = gridData

    // Get the actual rendered size of the canvas element (CSS size)
    // Use getBoundingClientRect for accurate size regardless of parent structure
    const rect = canvas.getBoundingClientRect()
    const canvasWidth = Math.floor(rect.width)
    const canvasHeight = Math.floor(rect.height)

    // Set canvas internal resolution to match displayed size
    // This ensures 1:1 pixel mapping and prevents scaling artifacts
    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth
      canvas.height = canvasHeight
    }

    // Bail out if canvas has no size (not yet rendered)
    if (canvasWidth === 0 || canvasHeight === 0) return

    // Clear and draw transformed bitmap
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.save()

    // Apply viewport transform to match ReactFlow's coordinate system
    // ReactFlow viewport: screenPos = worldPos * zoom + viewportOffset
    // The viewport offset is relative to top-left of container
    ctx.translate(viewport.x, viewport.y)
    ctx.scale(viewport.zoom, viewport.zoom)

    // Calculate world position and size
    const cellSize = resolution * MAP_SCALE
    const worldX = origin.x * MAP_SCALE
    const worldY = -(origin.y + height * resolution) * MAP_SCALE

    // Disable smoothing for crisp pixel rendering
    ctx.imageSmoothingEnabled = false

    // Draw cached bitmap scaled to world coordinates
    ctx.drawImage(bitmapCanvasRef.current, worldX, worldY, width * cellSize, height * cellSize)

    ctx.restore()
  }, [gridData, visible, viewport])

  // Trigger draw on visibility, data, or viewport changes
  useEffect(() => {
    drawBitmap()
  }, [drawBitmap])

  // Cleanup offscreen canvas on unmount
  useEffect(() => {
    return () => {
      bitmapCanvasRef.current = null
      lastDataKeyRef.current = null
    }
  }, [])

  if (!visible) return null

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{
        opacity,
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    />
  )
}
