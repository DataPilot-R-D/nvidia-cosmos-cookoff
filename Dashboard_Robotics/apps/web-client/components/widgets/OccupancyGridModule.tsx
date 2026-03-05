/**
 * OccupancyGridModule Component
 *
 * Real-time OccupancyGrid (costmap/map) visualization using Canvas.
 * Displays 2D map from SLAM or navigation costmaps.
 *
 * Color scheme:
 * - Unknown (-1): Gray
 * - Free (0): Black/Dark
 * - Occupied (100): White/Bright
 */

'use client'

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useCostmapStore, type OccupancyGridData } from '@/lib/stores/costmap-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import type { ModuleProps } from './ModuleRegistry'

// =============================================================================
// Types
// =============================================================================

interface CanvasSize {
  width: number
  height: number
}

// =============================================================================
// Map Renderer
// =============================================================================

interface MapCanvasProps {
  grid: OccupancyGridData | undefined
  canvasSize: CanvasSize
}

function MapCanvas({ grid, canvasSize }: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const decodeGridData = useCostmapStore((state) => state.decodeGridData)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !grid) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Decode grid data
    const data = decodeGridData(grid.topic)
    if (!data) return

    // Create ImageData
    const imageData = ctx.createImageData(grid.width, grid.height)

    // Fill pixels
    for (let i = 0; i < data.length; i++) {
      const value = data[i]
      let r: number, g: number, b: number

      if (value === -1) {
        // Unknown - gray
        r = 128
        g = 128
        b = 128
      } else if (value === 0) {
        // Free - dark (navigable)
        r = 20
        g = 20
        b = 30
      } else if (value === 100) {
        // Occupied - bright (obstacle)
        r = 255
        g = 255
        b = 255
      } else {
        // Intermediate - gradient from dark to bright
        const normalized = value / 100
        r = Math.floor(20 + normalized * 235)
        g = Math.floor(20 + normalized * 235)
        b = Math.floor(30 + normalized * 225)
      }

      const pixelIndex = i * 4
      imageData.data[pixelIndex] = r
      imageData.data[pixelIndex + 1] = g
      imageData.data[pixelIndex + 2] = b
      imageData.data[pixelIndex + 3] = 255 // Alpha
    }

    // Draw to canvas
    // First draw to a temp canvas at original size
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = grid.width
    tempCanvas.height = grid.height
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) return

    tempCtx.putImageData(imageData, 0, 0)

    // Clear and scale to fit
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Calculate scale to fit while maintaining aspect ratio
    const scaleX = canvas.width / grid.width
    const scaleY = canvas.height / grid.height
    const scale = Math.min(scaleX, scaleY)

    const scaledWidth = grid.width * scale
    const scaledHeight = grid.height * scale
    const offsetX = (canvas.width - scaledWidth) / 2
    const offsetY = (canvas.height - scaledHeight) / 2

    // Disable smoothing for crisp pixels
    ctx.imageSmoothingEnabled = false

    // Draw scaled map
    ctx.drawImage(tempCanvas, offsetX, offsetY, scaledWidth, scaledHeight)

    // Draw origin marker
    const originX = offsetX + (-grid.origin.x / grid.resolution) * scale
    const originY = offsetY + (grid.height - -grid.origin.y / grid.resolution) * scale

    ctx.fillStyle = '#00ffff'
    ctx.beginPath()
    ctx.arc(originX, originY, 4, 0, Math.PI * 2)
    ctx.fill()
  }, [grid, canvasSize, decodeGridData])

  return (
    <canvas
      ref={canvasRef}
      width={canvasSize.width}
      height={canvasSize.height}
      className="w-full h-full"
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

// =============================================================================
// Stats Overlay
// =============================================================================

interface StatsOverlayProps {
  grid: OccupancyGridData | undefined
}

function StatsOverlay({ grid }: StatsOverlayProps) {
  if (!grid) {
    return (
      <div className="flex items-center gap-2 bg-[#1a1a1a]/90 rounded px-2 py-1 text-[10px] font-mono">
        <span className="text-red-400">No Map</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 bg-[#1a1a1a]/90 rounded px-2 py-1 text-[10px] font-mono">
      <div className="flex items-center gap-2">
        <span className="text-[#666666]">MAP</span>
        <span className="w-1.5 h-1.5 rounded-full bg-[#00ff00]" />
      </div>
      <div className="text-[#888888]">
        <span className="text-[#00ffff]">{grid.width}</span>x
        <span className="text-[#00ffff]">{grid.height}</span>
        <span className="mx-2">|</span>
        <span className="text-[#00ffff]">{grid.resolution.toFixed(3)}</span> m/cell
      </div>
    </div>
  )
}

// =============================================================================
// Topic Selector
// =============================================================================

interface TopicSelectorProps {
  topics: string[]
  activeTopic: string | null
  onSelect: (topic: string) => void
}

function TopicSelector({ topics, activeTopic, onSelect }: TopicSelectorProps) {
  if (topics.length === 0) {
    return <div className="px-2 py-1 text-[10px] text-yellow-400 font-mono">Waiting for map...</div>
  }

  return (
    <select
      value={activeTopic || ''}
      onChange={(e) => onSelect(e.target.value)}
      className="
        appearance-none bg-[#1a1a1a] border border-[#333333] rounded px-2 py-1
        text-xs text-[#888888] font-mono
        cursor-pointer hover:border-[#444444] focus:border-cyan-500 focus:outline-none
      "
    >
      {topics.map((topic) => (
        <option key={topic} value={topic}>
          {topic}
        </option>
      ))}
    </select>
  )
}

// =============================================================================
// Legend
// =============================================================================

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[9px] font-mono text-[#666666]">
      <div className="flex items-center gap-1">
        <span className="w-3 h-3 bg-gray-500 rounded-sm" />
        <span>Unknown</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-3 h-3 bg-[#141420] rounded-sm border border-[#333]" />
        <span>Free</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="w-3 h-3 bg-white rounded-sm" />
        <span>Obstacle</span>
      </div>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function OccupancyGridModule({ windowId }: ModuleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({ width: 400, height: 300 })

  // Store state
  const grids = useCostmapStore((state) => state.grids)
  const activeTopic = useCostmapStore((state) => state.activeTopic)
  const setActiveTopic = useCostmapStore((state) => state.setActiveTopic)
  const rosbridgeConnected = useWebSocketStore((state) => state.rosbridgeConnected)

  // Get available topics and active grid
  const topics = useMemo(() => Array.from(grids.keys()), [grids])
  const activeGrid = activeTopic ? grids.get(activeTopic) : undefined

  // Handle resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) })
      }
    })

    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  // Handle topic selection
  const handleTopicSelect = useCallback(
    (topic: string) => {
      setActiveTopic(topic)
    },
    [setActiveTopic]
  )

  return (
    <div
      className="h-full w-full flex flex-col bg-[#0a0a0a]"
      data-testid={`module-occupancy-grid-${windowId}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-[#222222] gap-2">
        <div className="flex items-center gap-2">
          <TopicSelector topics={topics} activeTopic={activeTopic} onSelect={handleTopicSelect} />
        </div>
        <StatsOverlay grid={activeGrid} />
      </div>

      {/* Map Canvas */}
      <div ref={containerRef} className="flex-1 relative min-h-0">
        <MapCanvas grid={activeGrid} canvasSize={canvasSize} />

        {/* Empty State */}
        {!activeGrid && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-[#333333] text-4xl mb-2">#</div>
              <div className="text-[#333333] text-xs font-mono uppercase tracking-wider mb-1">
                OccupancyGrid
              </div>
              <div className="text-[#555555] text-[10px]">
                {rosbridgeConnected ? 'Waiting for /map topic...' : 'Connect to ROSBridge'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer - Legend */}
      <div className="flex items-center justify-center p-1 border-t border-[#222222]">
        <Legend />
      </div>
    </div>
  )
}

export default OccupancyGridModule
