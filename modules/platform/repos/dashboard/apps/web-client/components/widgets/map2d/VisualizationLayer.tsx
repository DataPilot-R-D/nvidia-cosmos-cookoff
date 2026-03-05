/**
 * VisualizationLayer Component
 *
 * High-performance Canvas-based rendering for:
 * - Navigation paths (from Nav2 /plan topic)
 * - Robot trails (position history)
 * - Goal markers (with pulsating animations)
 * - LiDAR point clouds (supports 50k+ points at 60fps)
 *
 * Performance Optimizations:
 * - Single canvas element (no DOM node per point)
 * - requestAnimationFrame for smooth animations
 * - Viewport transforms synchronized with ReactFlow
 * - fillRect batch rendering for LiDAR (faster than arc for high point counts)
 * - Single fillStyle call before LiDAR loop (avoids per-point style changes)
 *
 * Visual Style (Cyberpunk/Neon Theme):
 * - Neon cyan gradient for trails (fades with age)
 * - Solid neon green for active navigation path
 * - Pulsating ring for goal markers
 * - Bright orange/red for LiDAR points with intensity-based transparency
 *
 * @see performance.md - "DO NOT render paths as thousands of HTML elements"
 * @see docs/optimizations-2026.md - Section 7: Vector Visualization Strategy
 */

'use client'

import { useRef, useEffect, useCallback } from 'react'
import { MAP_SCALE } from './types'
import type { PathPoint, GoalPose } from '@/lib/stores/path-store'

// =============================================================================
// Types
// =============================================================================

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface TrailPoint {
  x: number
  y: number
  timestamp: number
}

/**
 * LiDAR point structure for Canvas rendering
 * Coordinates are in map frame (meters), pre-transformed from robot frame
 */
export interface LidarCanvasPoint {
  /** X coordinate in map frame (meters) */
  x: number
  /** Y coordinate in map frame (meters) */
  y: number
  /** Optional intensity (0-255) for transparency/brightness */
  intensity?: number
}

export interface VisualizationLayerProps {
  /** ReactFlow viewport for synchronized zoom/pan */
  viewport: Viewport
  /** Navigation path points from Nav2 /plan topic */
  pathPoints: PathPoint[]
  /** Robot trail history (position over time) */
  trailPoints: TrailPoint[]
  /** Current confirmed goal pose */
  goalPose: GoalPose | null
  /** Pending goal position (before direction selection) */
  pendingGoalPosition: { x: number; y: number } | null
  /** LiDAR points in map frame (already transformed from robot frame) */
  lidarPoints: LidarCanvasPoint[]
  /** Visibility toggle for paths/trails/goals */
  visible: boolean
  /** Visibility toggle for LiDAR layer */
  showLidar: boolean
}

// Legacy export for backwards compatibility
export type PathOverlayCanvasProps = Omit<VisualizationLayerProps, 'lidarPoints' | 'showLidar'>

// =============================================================================
// Color Constants (Premium Minimal Theme)
// =============================================================================

const COLORS = {
  // Path styling - subtle teal gradient
  pathStroke: 'rgba(45, 212, 191, 0.85)', // Teal-400
  pathGlow: 'rgba(45, 212, 191, 0.4)',
  pathWidth: 2,
  pathGlowBlur: 6,

  // Trail styling - soft cyan, fading
  trailStroke: 'rgba(103, 232, 249, 0.6)', // Cyan-300
  trailGlow: 'rgba(103, 232, 249, 0.3)',
  trailWidth: 1.5,
  trailGlowBlur: 4,

  // Goal marker styling - minimal, elegant
  goalPending: 'rgba(255, 255, 255, 0.9)', // Clean white
  goalNavigating: 'rgba(45, 212, 191, 0.8)', // Soft teal
  goalReached: 'rgba(74, 222, 128, 0.8)', // Soft green
  goalFailed: 'rgba(248, 113, 113, 0.7)', // Muted red
  goalCanceled: 'rgba(115, 115, 115, 0.6)', // Neutral gray
  goalGlowBlur: 4, // Subtle glow (was 15)
  goalMarkerSize: 8, // Smaller marker (was 12)
  goalPulseSpeed: 0.002, // Slower, elegant pulse (was 0.005)

  // LiDAR styling - muted amber/orange
  lidarBase: 'rgba(251, 191, 36, 0.5)', // Amber-400
  lidarGlow: 'rgba(245, 158, 11, 0.3)',
  lidarPointSize: 2,
  lidarBaseAlpha: 0.45,
} as const

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get goal color based on status
 */
function getGoalColor(status: GoalPose['status'] | 'pending-click'): string {
  switch (status) {
    case 'pending-click':
    case 'pending':
      return COLORS.goalPending
    case 'navigating':
      return COLORS.goalNavigating
    case 'reached':
      return COLORS.goalReached
    case 'failed':
      return COLORS.goalFailed
    case 'canceled':
      return COLORS.goalCanceled
    default:
      return COLORS.goalPending
  }
}

/**
 * Convert map coordinates to canvas coordinates
 * Applies MAP_SCALE and Y-axis inversion
 */
function mapToCanvas(x: number, y: number): { x: number; y: number } {
  return {
    x: x * MAP_SCALE,
    y: -y * MAP_SCALE, // Invert Y for screen coordinates
  }
}

// =============================================================================
// Main Component
// =============================================================================

export function VisualizationLayer({
  viewport,
  pathPoints,
  trailPoints,
  goalPose,
  pendingGoalPosition,
  lidarPoints,
  visible,
  showLidar,
}: VisualizationLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef<number>(0)

  // ==========================================================================
  // Drawing Functions
  // ==========================================================================

  /**
   * Draw LiDAR point cloud
   *
   * Performance optimizations for 50k+ points:
   * - Single fillStyle call before loop
   * - fillRect instead of arc (10x faster for simple points)
   * - No shadow/glow effects (too expensive for high point counts)
   * - Intensity-based alpha creates natural density visualization
   *
   * Visual style: Muted amber/gold - professional, non-distracting
   */
  const drawLidar = useCallback((ctx: CanvasRenderingContext2D, points: LidarCanvasPoint[]) => {
    if (points.length === 0) return

    ctx.save()

    // Disable shadows for performance (critical for 50k+ points)
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'

    // Using muted amber - overlapping points create subtle density
    ctx.fillStyle = COLORS.lidarBase

    const pointSize = COLORS.lidarPointSize

    // Fast path: No intensity data - draw all points with same style
    if (points.length > 0 && points[0].intensity === undefined) {
      for (let i = 0; i < points.length; i++) {
        const point = points[i]
        const pos = mapToCanvas(point.x, point.y)
        ctx.fillRect(pos.x - pointSize / 2, pos.y - pointSize / 2, pointSize, pointSize)
      }
    } else {
      // Intensity-based rendering: brighter points = higher intensity
      for (let i = 0; i < points.length; i++) {
        const point = points[i]
        const pos = mapToCanvas(point.x, point.y)

        // Calculate alpha based on intensity (0-255 → 0.15-0.65)
        const intensity = point.intensity ?? 128
        const alpha = 0.15 + (intensity / 255) * 0.5

        ctx.fillStyle = `rgba(251, 191, 36, ${alpha})`
        ctx.fillRect(pos.x - pointSize / 2, pos.y - pointSize / 2, pointSize, pointSize)
      }
    }

    ctx.restore()
  }, [])

  /**
   * Draw navigation path with subtle glow effect
   * Premium design: clean teal line, minimal markers
   */
  const drawPath = useCallback((ctx: CanvasRenderingContext2D, points: PathPoint[]) => {
    if (points.length < 2) return

    ctx.save()

    // Subtle glow
    ctx.shadowColor = COLORS.pathGlow
    ctx.shadowBlur = COLORS.pathGlowBlur
    ctx.strokeStyle = COLORS.pathStroke
    ctx.lineWidth = COLORS.pathWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.beginPath()
    const start = mapToCanvas(points[0].x, points[0].y)
    ctx.moveTo(start.x, start.y)

    for (let i = 1; i < points.length; i++) {
      const point = mapToCanvas(points[i].x, points[i].y)
      ctx.lineTo(point.x, point.y)
    }

    ctx.stroke()

    // Start marker - small subtle dot
    ctx.fillStyle = 'rgba(74, 222, 128, 0.8)' // Soft green
    ctx.shadowBlur = 2
    ctx.beginPath()
    ctx.arc(start.x, start.y, 3, 0, Math.PI * 2)
    ctx.fill()

    // End marker - slightly larger
    if (points.length > 1) {
      const end = mapToCanvas(points[points.length - 1].x, points[points.length - 1].y)
      ctx.fillStyle = COLORS.pathStroke
      ctx.beginPath()
      ctx.arc(end.x, end.y, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }

    ctx.restore()
  }, [])

  /**
   * Draw robot trail with elegant fading effect
   * Premium design: soft cyan, subtle fade over time
   */
  const drawTrail = useCallback((ctx: CanvasRenderingContext2D, points: TrailPoint[]) => {
    if (points.length < 2) return

    const now = Date.now()

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Draw trail segments with fading opacity based on age
    for (let i = 1; i < points.length; i++) {
      const prevPoint = points[i - 1]
      const currPoint = points[i]

      // Calculate age-based opacity (older = more transparent)
      const age = (now - currPoint.timestamp) / 1000 // seconds
      const opacity = Math.max(0.05, 0.6 - age * 0.015) // Softer fade over ~40 seconds

      const prev = mapToCanvas(prevPoint.x, prevPoint.y)
      const curr = mapToCanvas(currPoint.x, currPoint.y)

      // Subtle glow
      ctx.shadowColor = COLORS.trailGlow
      ctx.shadowBlur = COLORS.trailGlowBlur * opacity
      ctx.strokeStyle = `rgba(103, 232, 249, ${opacity})`
      ctx.lineWidth = COLORS.trailWidth

      ctx.beginPath()
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(curr.x, curr.y)
      ctx.stroke()
    }

    ctx.restore()
  }, [])

  /**
   * Draw crosshair marker (for pending-click state)
   */
  const drawCrosshair = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.lineCap = 'round'

      // Horizontal line
      ctx.beginPath()
      ctx.moveTo(x - size, y)
      ctx.lineTo(x + size, y)
      ctx.stroke()

      // Vertical line
      ctx.beginPath()
      ctx.moveTo(x, y - size)
      ctx.lineTo(x, y + size)
      ctx.stroke()

      // Small center dot
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fill()
    },
    []
  )

  /**
   * Draw ripple effect (for navigating state)
   */
  const drawRipple = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      innerRadius: number,
      outerRadius: number,
      color: string,
      alpha: number
    ) => {
      // Inner circle (solid, subtle)
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.7
      ctx.beginPath()
      ctx.arc(x, y, innerRadius, 0, Math.PI * 2)
      ctx.stroke()

      // Outer ripple (pulsating, fading)
      ctx.globalAlpha = alpha * 0.5
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(x, y, outerRadius, 0, Math.PI * 2)
      ctx.stroke()

      // Center dot
      ctx.globalAlpha = 0.9
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, 2.5, 0, Math.PI * 2)
      ctx.fill()
    },
    []
  )

  /**
   * Draw checkmark (for reached state)
   */
  const drawCheckmark = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      ctx.beginPath()
      ctx.moveTo(x - size * 0.5, y)
      ctx.lineTo(x - size * 0.1, y + size * 0.4)
      ctx.lineTo(x + size * 0.6, y - size * 0.4)
      ctx.stroke()
    },
    []
  )

  /**
   * Draw X mark (for failed/canceled state)
   */
  const drawXMark = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.lineCap = 'round'

      ctx.beginPath()
      ctx.moveTo(x - size * 0.5, y - size * 0.5)
      ctx.lineTo(x + size * 0.5, y + size * 0.5)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(x + size * 0.5, y - size * 0.5)
      ctx.lineTo(x - size * 0.5, y + size * 0.5)
      ctx.stroke()
    },
    []
  )

  /**
   * Draw goal marker with elegant, minimal animation
   * Premium design: subtle, clean, professional
   */
  const drawGoalMarker = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      status: GoalPose['status'] | 'pending-click',
      theta: number = 0,
      time: number
    ) => {
      const pos = mapToCanvas(x, y)
      const color = getGoalColor(status)
      const size = COLORS.goalMarkerSize

      ctx.save()

      // Subtle glow
      ctx.shadowColor = color
      ctx.shadowBlur = COLORS.goalGlowBlur

      // Draw based on status
      if (status === 'pending-click' || status === 'pending') {
        // Crosshair for pending
        drawCrosshair(ctx, pos.x, pos.y, size, color)
      } else if (status === 'navigating') {
        // Elegant ripple effect for navigating
        const pulse = Math.sin(time * COLORS.goalPulseSpeed) * 0.3 + 0.7
        const outerRadius = size * 1.5 * (0.8 + pulse * 0.4)
        drawRipple(ctx, pos.x, pos.y, size, outerRadius, color, pulse)
      } else if (status === 'reached') {
        // Checkmark for success
        drawCheckmark(ctx, pos.x, pos.y, size, color)
      } else {
        // X mark for failed/canceled
        drawXMark(ctx, pos.x, pos.y, size, color)
      }

      // Direction line (elegant thin line)
      if (status !== 'pending-click' && theta !== undefined && status === 'navigating') {
        const lineLength = 16
        const endX = pos.x + Math.cos(-theta) * lineLength
        const endY = pos.y + Math.sin(-theta) * lineLength

        ctx.globalAlpha = 0.7
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.lineCap = 'round'

        ctx.beginPath()
        ctx.moveTo(pos.x, pos.y)
        ctx.lineTo(endX, endY)
        ctx.stroke()

        // Small arrowhead
        const arrowSize = 4
        const angle = Math.atan2(endY - pos.y, endX - pos.x)
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(endX, endY)
        ctx.lineTo(
          endX - arrowSize * Math.cos(angle - Math.PI / 6),
          endY - arrowSize * Math.sin(angle - Math.PI / 6)
        )
        ctx.lineTo(
          endX - arrowSize * Math.cos(angle + Math.PI / 6),
          endY - arrowSize * Math.sin(angle + Math.PI / 6)
        )
        ctx.closePath()
        ctx.fill()
      }

      ctx.restore()
    },
    [drawCrosshair, drawRipple, drawCheckmark, drawXMark]
  )

  // ==========================================================================
  // Main Render Loop
  // ==========================================================================

  const render = useCallback(
    (time: number) => {
      const canvas = canvasRef.current
      if (!canvas) {
        animationRef.current = requestAnimationFrame(render)
        return
      }

      // Early exit if nothing to render
      const hasContent = visible || showLidar
      if (!hasContent) {
        animationRef.current = requestAnimationFrame(render)
        return
      }

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        animationRef.current = requestAnimationFrame(render)
        return
      }

      // Throttle to ~60fps (skip frames if too fast)
      const elapsed = time - lastFrameTimeRef.current
      if (elapsed < 16) {
        animationRef.current = requestAnimationFrame(render)
        return
      }
      lastFrameTimeRef.current = time

      // Get canvas size from CSS layout
      const rect = canvas.getBoundingClientRect()
      const canvasWidth = Math.floor(rect.width)
      const canvasHeight = Math.floor(rect.height)

      // Update canvas resolution if needed
      if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
        canvas.width = canvasWidth
        canvas.height = canvasHeight
      }

      // Bail if no size
      if (canvasWidth === 0 || canvasHeight === 0) {
        animationRef.current = requestAnimationFrame(render)
        return
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Apply viewport transform (sync with ReactFlow)
      ctx.save()
      ctx.translate(viewport.x, viewport.y)
      ctx.scale(viewport.zoom, viewport.zoom)

      // Draw layers (back to front)
      // 1. LiDAR point cloud (underneath everything - provides spatial context)
      if (showLidar && lidarPoints.length > 0) {
        drawLidar(ctx, lidarPoints)
      }

      // 2. Trail (robot history)
      if (visible && trailPoints.length > 0) {
        drawTrail(ctx, trailPoints)
      }

      // 3. Navigation path
      if (visible && pathPoints.length > 0) {
        drawPath(ctx, pathPoints)
      }

      // 4. Goal markers (on top)
      if (visible) {
        // Draw pending goal position (click before direction selection)
        if (pendingGoalPosition) {
          drawGoalMarker(
            ctx,
            pendingGoalPosition.x,
            pendingGoalPosition.y,
            'pending-click',
            0,
            time
          )
        }

        // Draw confirmed goal pose
        if (goalPose) {
          drawGoalMarker(ctx, goalPose.x, goalPose.y, goalPose.status, goalPose.theta, time)
        }
      }

      ctx.restore()

      // Continue animation loop
      animationRef.current = requestAnimationFrame(render)
    },
    [
      visible,
      showLidar,
      viewport,
      pathPoints,
      trailPoints,
      lidarPoints,
      goalPose,
      pendingGoalPosition,
      drawLidar,
      drawPath,
      drawTrail,
      drawGoalMarker,
    ]
  )

  // ==========================================================================
  // Effects
  // ==========================================================================

  // Start/stop animation loop
  useEffect(() => {
    animationRef.current = requestAnimationFrame(render)

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
    }
  }, [render])

  // ==========================================================================
  // Render
  // ==========================================================================

  // Always render canvas (even if not visible) to maintain RAF loop for smooth transitions
  if (!visible && !showLidar) return null

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        zIndex: 2, // Above OccupancyGridCanvas (z-index: 1), below ReactFlow nodes
      }}
    />
  )
}

// Legacy alias for backwards compatibility
export const PathOverlayCanvas = VisualizationLayer
