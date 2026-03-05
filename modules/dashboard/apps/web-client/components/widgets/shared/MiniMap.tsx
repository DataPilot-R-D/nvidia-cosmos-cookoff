/**
 * MiniMap — Lightweight interactive map panel for waypoints & zones.
 *
 * Renders a simple grid with coordinate system, click/drag for adding
 * waypoints or polygon vertices. No React Flow dependency — pure canvas.
 *
 * Props control the interaction mode (waypoint vs polygon).
 */
'use client'

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react'

// ── Types ────────────────────────────────────────────────

export interface MapPoint {
  x: number
  y: number
}

export interface MapZone {
  id: string
  name: string
  polygon: MapPoint[]
  color: string
}

export interface MiniMapProps {
  /** Interaction mode */
  mode: 'waypoint' | 'polygon' | 'view'
  /** Existing waypoints to display */
  waypoints?: MapPoint[]
  /** Callback when a waypoint is added (waypoint mode) */
  onWaypointAdd?: (point: MapPoint) => void
  /** Callback when a waypoint is removed (right-click) */
  onWaypointRemove?: (index: number) => void
  /** Current polygon vertices being drawn */
  drawingPolygon?: MapPoint[]
  /** Callback when polygon vertex added */
  onPolygonVertexAdd?: (point: MapPoint) => void
  /** Callback when polygon is closed (double-click) */
  onPolygonClose?: () => void
  /** Existing zones to display as overlays */
  zones?: MapZone[]
  /** Map dimensions in meters */
  mapSize?: number
  /** Optional className */
  className?: string
}

// ── Constants ────────────────────────────────────────────

const DEFAULT_MAP_SIZE = 20 // 20m x 20m
const GRID_COLOR = '#1a2a1a'
const AXIS_COLOR = '#333'
const WAYPOINT_RADIUS = 6
const VERTEX_RADIUS = 5

// ── Component ────────────────────────────────────────────

export function MiniMap({
  mode,
  waypoints = [],
  onWaypointAdd,
  onWaypointRemove,
  drawingPolygon = [],
  onPolygonVertexAdd,
  onPolygonClose,
  zones = [],
  mapSize = DEFAULT_MAP_SIZE,
  className = '',
}: MiniMapProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ w: 300, h: 200 })
  const [hoverPos, setHoverPos] = useState<MapPoint | null>(null)

  // Scale: pixels per meter
  const scale = Math.min(canvasSize.w, canvasSize.h) / mapSize
  const offsetX = canvasSize.w / 2
  const offsetY = canvasSize.h / 2

  // Convert map coords to canvas pixels
  const toPixel = useCallback(
    (p: MapPoint) => ({
      x: offsetX + p.x * scale,
      y: offsetY - p.y * scale, // Y inverted
    }),
    [offsetX, offsetY, scale]
  )

  // Convert canvas pixels to map coords
  const toMap = useCallback(
    (px: number, py: number): MapPoint => ({
      x: Math.round(((px - offsetX) / scale) * 100) / 100,
      y: Math.round(((offsetY - py) / scale) * 100) / 100,
    }),
    [offsetX, offsetY, scale]
  )

  // Resize observer
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      if (width > 0 && height > 0) {
        setCanvasSize({ w: Math.floor(width), h: Math.floor(height) })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { w, h } = canvasSize
    canvas.width = w
    canvas.height = h

    // Clear
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, w, h)

    // Grid lines (every 2m)
    ctx.strokeStyle = GRID_COLOR
    ctx.lineWidth = 0.5
    const gridStep = 2
    for (let m = -mapSize / 2; m <= mapSize / 2; m += gridStep) {
      const px = offsetX + m * scale
      const py = offsetY - m * scale
      // Vertical
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, h)
      ctx.stroke()
      // Horizontal
      ctx.beginPath()
      ctx.moveTo(0, py)
      ctx.lineTo(w, py)
      ctx.stroke()
    }

    // Axes
    ctx.strokeStyle = AXIS_COLOR
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, offsetY)
    ctx.lineTo(w, offsetY)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(offsetX, 0)
    ctx.lineTo(offsetX, h)
    ctx.stroke()

    // Origin label
    ctx.fillStyle = '#555'
    ctx.font = '9px monospace'
    ctx.fillText('0,0', offsetX + 3, offsetY + 11)

    // Draw zones
    for (const zone of zones) {
      if (zone.polygon.length < 3) continue
      ctx.beginPath()
      const p0 = toPixel(zone.polygon[0])
      ctx.moveTo(p0.x, p0.y)
      for (let i = 1; i < zone.polygon.length; i++) {
        const p = toPixel(zone.polygon[i])
        ctx.lineTo(p.x, p.y)
      }
      ctx.closePath()
      ctx.fillStyle = zone.color + '30' // 30 = ~19% opacity
      ctx.fill()
      ctx.strokeStyle = zone.color
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Zone label
      const center = zone.polygon.reduce(
        (acc, p) => ({
          x: acc.x + p.x / zone.polygon.length,
          y: acc.y + p.y / zone.polygon.length,
        }),
        { x: 0, y: 0 }
      )
      const cp = toPixel(center)
      ctx.fillStyle = zone.color
      ctx.font = 'bold 9px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(zone.name, cp.x, cp.y + 3)
      ctx.textAlign = 'start'
    }

    // Draw waypoints
    waypoints.forEach((wp, i) => {
      const p = toPixel(wp)
      // Circle
      ctx.beginPath()
      ctx.arc(p.x, p.y, WAYPOINT_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = '#f59e0b'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
      // Number
      ctx.fillStyle = '#000'
      ctx.font = 'bold 8px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(String(i + 1), p.x, p.y + 3)
      ctx.textAlign = 'start'
      // Line to next
      if (i < waypoints.length - 1) {
        const next = toPixel(waypoints[i + 1])
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(next.x, next.y)
        ctx.strokeStyle = '#f59e0b80'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 3])
        ctx.stroke()
        ctx.setLineDash([])
      }
    })

    // Drawing polygon
    if (drawingPolygon.length > 0) {
      ctx.beginPath()
      const p0 = toPixel(drawingPolygon[0])
      ctx.moveTo(p0.x, p0.y)
      for (let i = 1; i < drawingPolygon.length; i++) {
        const p = toPixel(drawingPolygon[i])
        ctx.lineTo(p.x, p.y)
      }
      // Line to hover position
      if (hoverPos) {
        const hp = toPixel(hoverPos)
        ctx.lineTo(hp.x, hp.y)
      }
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.stroke()

      // Vertices
      drawingPolygon.forEach((v) => {
        const p = toPixel(v)
        ctx.beginPath()
        ctx.arc(p.x, p.y, VERTEX_RADIUS, 0, Math.PI * 2)
        ctx.fillStyle = '#3b82f6'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1
        ctx.stroke()
      })
    }

    // Hover crosshair
    if (hoverPos && mode !== 'view') {
      const hp = toPixel(hoverPos)
      ctx.strokeStyle = '#ffffff40'
      ctx.lineWidth = 0.5
      ctx.setLineDash([2, 2])
      ctx.beginPath()
      ctx.moveTo(hp.x, 0)
      ctx.lineTo(hp.x, h)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, hp.y)
      ctx.lineTo(w, hp.y)
      ctx.stroke()
      ctx.setLineDash([])

      // Coords tooltip
      ctx.fillStyle = '#fff'
      ctx.font = '9px monospace'
      ctx.fillText(`${hoverPos.x}, ${hoverPos.y}`, hp.x + 8, hp.y - 6)
    }
  }, [
    canvasSize,
    waypoints,
    zones,
    drawingPolygon,
    hoverPos,
    mode,
    mapSize,
    offsetX,
    offsetY,
    scale,
    toPixel,
  ])

  // Mouse handlers
  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const point = toMap(e.clientX - rect.left, e.clientY - rect.top)

      if (mode === 'waypoint') {
        onWaypointAdd?.(point)
      } else if (mode === 'polygon') {
        onPolygonVertexAdd?.(point)
      }
    },
    [mode, toMap, onWaypointAdd, onPolygonVertexAdd]
  )

  const handleDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      if (mode === 'polygon' && drawingPolygon.length >= 3) {
        onPolygonClose?.()
      }
    },
    [mode, drawingPolygon.length, onPolygonClose]
  )

  const handleContextMenu = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      e.preventDefault()
      if (mode !== 'waypoint' || waypoints.length === 0) return

      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top

      // Find closest waypoint
      let closestIdx = -1
      let closestDist = Infinity
      waypoints.forEach((wp, i) => {
        const p = toPixel(wp)
        const dist = Math.hypot(p.x - px, p.y - py)
        if (dist < closestDist) {
          closestDist = dist
          closestIdx = i
        }
      })

      if (closestIdx >= 0 && closestDist < 20) {
        onWaypointRemove?.(closestIdx)
      }
    },
    [mode, waypoints, toPixel, onWaypointRemove]
  )

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<HTMLCanvasElement>) => {
      if (mode === 'view') return
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      setHoverPos(toMap(e.clientX - rect.left, e.clientY - rect.top))
    },
    [mode, toMap]
  )

  const handleMouseLeave = useCallback(() => setHoverPos(null), [])

  const cursorStyle = mode === 'waypoint' ? 'crosshair' : mode === 'polygon' ? 'crosshair' : 'grab'

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full min-h-[120px] bg-[#0a0a0a] rounded overflow-hidden ${className}`}
      data-testid="mini-map"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ cursor: cursorStyle }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
      {/* Mode indicator */}
      <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[9px] text-gray-400">
        {mode === 'waypoint' && '🎯 Click to add waypoint · Right-click to remove'}
        {mode === 'polygon' && '✏️ Click to add vertex · Double-click to close'}
        {mode === 'view' && '👁 View only'}
      </div>
    </div>
  )
}
