/**
 * LidarModule Component
 *
 * Real-time LIDAR point cloud visualization using Three.js.
 * Displays 3D point cloud from robot's laser scanner.
 *
 * @see research-summary.md Section 2.2: Streaming LIDAR Point Cloud
 * @see plan.md Phase 4: LIDAR Visualization
 */

'use client'

import { useRef, useEffect, useMemo, useState, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera, Grid } from '@react-three/drei'
import * as THREE from 'three'
import {
  useLidarStore,
  type LidarPointBuffer,
  readPositionsFromBuffer,
  readScanIndicesFromBuffer,
} from '@/lib/stores/lidar-store'
import { useRobotStore } from '@/lib/stores/robot-store'
import { useTopicStore, type RosTopic } from '@/lib/stores/topic-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import { useExplorationStore } from '@/lib/stores/exploration-store'
import { filterLidarTopics } from '@/lib/ros'
import type { ModuleProps } from './ModuleRegistry'

// =============================================================================
// Types
// =============================================================================

interface PointCloudProps {
  pointBuffer: LidarPointBuffer | null
  maxScanIndex: number
}

// =============================================================================
// Point Cloud Component (Three.js) - Premium Sci-Fi Visualization
// =============================================================================

// Maximum points to render (memory safety)
const MAX_RENDER_POINTS = 100_000

// Pre-allocated work buffers (module level, reused across renders)
// This avoids allocating new arrays on every frame
let workPositions: Float32Array | null = null
let workColors: Float32Array | null = null
let workScanIndices: Uint32Array | null = null

function ensureWorkBuffers(capacity: number): void {
  if (!workPositions || workPositions.length < capacity * 3) {
    workPositions = new Float32Array(capacity * 3)
    workColors = new Float32Array(capacity * 3)
    workScanIndices = new Uint32Array(capacity)
  }
}

/**
 * Viridis-inspired color palette for premium sci-fi look
 * Maps normalized value (0-1) to RGB
 * Creates: deep purple → teal → amber gradient
 */
function viridisColor(t: number, brightness: number = 1): [number, number, number] {
  // Clamp t to 0-1
  const v = Math.max(0, Math.min(1, t))

  // Viridis-inspired: purple (0) → teal (0.5) → golden (1)
  let r: number, g: number, b: number

  if (v < 0.33) {
    // Purple to teal transition
    const s = v / 0.33
    r = 0.15 + s * 0.05
    g = 0.05 + s * 0.35
    b = 0.35 - s * 0.1
  } else if (v < 0.66) {
    // Teal to cyan-green transition
    const s = (v - 0.33) / 0.33
    r = 0.2 - s * 0.05
    g = 0.4 + s * 0.3
    b = 0.25 + s * 0.15
  } else {
    // Cyan-green to amber transition
    const s = (v - 0.66) / 0.34
    r = 0.15 + s * 0.65
    g = 0.7 + s * 0.15
    b = 0.4 - s * 0.25
  }

  return [r * brightness, g * brightness, b * brightness]
}

/**
 * PointCloud component with proper geometry lifecycle management.
 *
 * PERFORMANCE FIX: Creates geometry ONCE on mount, disposes on unmount.
 * Updates are done via needsUpdate flag on existing buffer attributes.
 * This eliminates GPU memory leaks from creating new geometries every frame.
 *
 * Memory: Single ~2.4MB geometry vs unbounded leak (was ~2.4MB/frame)
 */
function PointCloud({ pointBuffer, maxScanIndex }: PointCloudProps) {
  const meshRef = useRef<THREE.Points>(null)
  const geometryRef = useRef<THREE.BufferGeometry | null>(null)
  const positionAttrRef = useRef<THREE.Float32BufferAttribute | null>(null)
  const colorAttrRef = useRef<THREE.Float32BufferAttribute | null>(null)

  // Create geometry ONCE on mount, dispose on unmount
  useEffect(() => {
    const geo = new THREE.BufferGeometry()

    // Pre-allocate buffer attributes at max capacity
    const positions = new Float32Array(MAX_RENDER_POINTS * 3)
    const colors = new Float32Array(MAX_RENDER_POINTS * 3)

    const posAttr = new THREE.Float32BufferAttribute(positions, 3)
    const colAttr = new THREE.Float32BufferAttribute(colors, 3)

    posAttr.setUsage(THREE.DynamicDrawUsage)
    colAttr.setUsage(THREE.DynamicDrawUsage)

    geo.setAttribute('position', posAttr)
    geo.setAttribute('color', colAttr)
    geo.setDrawRange(0, 0) // Initially render nothing

    geometryRef.current = geo
    positionAttrRef.current = posAttr
    colorAttrRef.current = colAttr

    // Ensure work buffers are allocated
    ensureWorkBuffers(MAX_RENDER_POINTS)

    // CRITICAL: Dispose geometry on unmount to free GPU memory
    return () => {
      geo.dispose()
      geometryRef.current = null
      positionAttrRef.current = null
      colorAttrRef.current = null
    }
  }, [])

  // Update buffer data when pointBuffer changes (no new geometry allocation!)
  useEffect(() => {
    const geo = geometryRef.current
    const posAttr = positionAttrRef.current
    const colAttr = colorAttrRef.current

    if (!geo || !posAttr || !colAttr) return

    // Handle empty state
    if (!pointBuffer || pointBuffer.count === 0) {
      geo.setDrawRange(0, 0)
      return
    }

    // Read positions from ring buffer into work buffer (handles wrap-around + coordinate transform)
    const pointCount = readPositionsFromBuffer(pointBuffer, workPositions!, MAX_RENDER_POINTS)
    readScanIndicesFromBuffer(pointBuffer, workScanIndices!, MAX_RENDER_POINTS)

    // Find Z range for height-based coloring (Z is at index 1 after transform to Three.js Y-up)
    let minZ = Infinity
    let maxZ = -Infinity
    for (let i = 0; i < pointCount; i++) {
      const z = workPositions![i * 3 + 1] // Y in Three.js = Z in ROS
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
    const zRange = maxZ - minZ || 1

    // Compute colors based on height and age
    for (let i = 0; i < pointCount; i++) {
      const z = workPositions![i * 3 + 1]
      const scanIndex = workScanIndices![i]

      // Age factor: 0 = oldest, 1 = newest
      const ageFactor = maxScanIndex > 0 ? scanIndex / maxScanIndex : 1

      // Height-based color (viridis gradient)
      const normalizedZ = (z - minZ) / zRange

      // Brightness based on age (newer = brighter)
      const brightness = 0.35 + ageFactor * 0.65

      const [r, g, b] = viridisColor(normalizedZ, brightness)

      workColors![i * 3] = r
      workColors![i * 3 + 1] = g
      workColors![i * 3 + 2] = b
    }

    // Copy work buffers to geometry attributes
    const posArray = posAttr.array as Float32Array
    const colArray = colAttr.array as Float32Array

    posArray.set(workPositions!.subarray(0, pointCount * 3))
    colArray.set(workColors!.subarray(0, pointCount * 3))

    // Mark attributes as needing update (no new allocation!)
    posAttr.needsUpdate = true
    colAttr.needsUpdate = true

    // Set draw range to actual point count
    geo.setDrawRange(0, pointCount)
    geo.computeBoundingSphere()
  }, [pointBuffer, pointBuffer?.version, maxScanIndex])

  // Subtle rotation when idle
  useFrame(() => {
    if (meshRef.current && (!pointBuffer || pointBuffer.count === 0)) {
      meshRef.current.rotation.y += 0.0005
    }
  })

  // Render nothing until geometry is ready
  if (!geometryRef.current) return null

  return (
    <points ref={meshRef} geometry={geometryRef.current}>
      <pointsMaterial
        size={0.018}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// =============================================================================
// Robot Marker Component - Premium Sci-Fi Design
// =============================================================================

function RobotMarker() {
  const markerRef = useRef<THREE.Group>(null)

  // Subtle pulsing animation
  useFrame(({ clock }) => {
    if (markerRef.current) {
      const pulse = Math.sin(clock.elapsedTime * 2) * 0.05 + 1
      markerRef.current.scale.setScalar(pulse)
    }
  })

  return (
    <group ref={markerRef} position={[0, 0.15, 0]}>
      {/* Robot body - sleek hexagonal shape */}
      <mesh rotation={[0, Math.PI / 6, 0]}>
        <cylinderGeometry args={[0.25, 0.2, 0.15, 6]} />
        <meshStandardMaterial
          color="#2dd4bf"
          transparent
          opacity={0.6}
          emissive="#2dd4bf"
          emissiveIntensity={0.3}
        />
      </mesh>
      {/* Direction indicator - subtle arrow */}
      <mesh position={[0.3, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.08, 0.15, 4]} />
        <meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={0.5} />
      </mesh>
      {/* Center glow ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <ringGeometry args={[0.15, 0.18, 32]} />
        <meshBasicMaterial color="#2dd4bf" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// =============================================================================
// Scene Component - Premium Sci-Fi Environment
// =============================================================================

interface LidarSceneProps {
  robotId: string | null
  isScanning?: boolean
}

function LidarScene({ robotId, isScanning = false }: LidarSceneProps) {
  const scan = useLidarStore((state) => (robotId ? state.scans.get(robotId) : undefined))
  // Use point buffer for map visualization (TypedArray ring buffer)
  const pointBuffer = scan?.pointBuffer ?? null
  const maxScanIndex = scan?.totalScanCount ?? 0

  return (
    <>
      {/* Fog for depth perception - subtle fade */}
      <fog attach="fog" args={['#0a0a0a', 8, 40]} />

      {/* Camera */}
      <PerspectiveCamera makeDefault position={[6, 4, 6]} fov={45} />
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={2}
        maxDistance={50}
        maxPolarAngle={Math.PI * 0.48}
        rotateSpeed={0.5}
      />

      {/* Ambient Lighting - low intensity for moody look */}
      <ambientLight intensity={0.15} color="#67e8f9" />

      {/* Key Light - teal tint from above */}
      <directionalLight position={[5, 10, 5]} intensity={0.4} color="#67e8f9" />

      {/* Fill Light - subtle purple from opposite side */}
      <directionalLight position={[-5, 5, -5]} intensity={0.2} color="#a78bfa" />

      {/* Ground spot light when scanning */}
      {isScanning && (
        <spotLight
          position={[0, 5, 0]}
          angle={0.5}
          penumbra={0.8}
          intensity={0.3}
          color="#2dd4bf"
          castShadow={false}
        />
      )}

      {/* Ground Grid - subtle, premium */}
      <Grid
        args={[50, 50]}
        cellSize={1}
        cellThickness={0.3}
        cellColor="#1a1a1a"
        sectionSize={5}
        sectionThickness={0.6}
        sectionColor="#2a2a2a"
        fadeDistance={40}
        fadeStrength={1.5}
        position={[0, 0, 0]}
      />

      {/* Robot Marker */}
      <RobotMarker />

      {/* Point Cloud */}
      {robotId && <PointCloud pointBuffer={pointBuffer} maxScanIndex={maxScanIndex} />}
    </>
  )
}

// =============================================================================
// Stats Overlay - Premium Minimal Design
// =============================================================================

interface StatsOverlayProps {
  robotId: string | null
  onClear: () => void
}

function StatsOverlay({ robotId, onClear }: StatsOverlayProps) {
  const scan = useLidarStore((state) => (robotId ? state.scans.get(robotId) : undefined))
  const isSubscribed = useLidarStore((state) =>
    robotId ? state.subscriptions.has(robotId) : false
  )

  // Use pointBuffer.count for accumulated points (efficient - no array conversion)
  const accumulatedCount = scan?.pointBuffer?.count ?? 0
  const currentCount = scan?.points?.length ?? 0

  // Format large numbers
  const formatNumber = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
    return n.toString()
  }

  return (
    <div className="flex items-center gap-3 bg-[#141414]/95 rounded-lg px-2.5 py-1.5 text-[10px] font-mono border border-[#1f1f1f]">
      <div className="flex items-center gap-2">
        <span className="text-[#555555] tracking-wider">LIDAR</span>
        <span
          className={`w-1.5 h-1.5 rounded-full transition-colors ${
            isSubscribed ? 'bg-teal-400 shadow-sm shadow-teal-400/50' : 'bg-red-400/60'
          }`}
        />
      </div>
      <div className="text-[#666666]">
        <span className="text-teal-400" title="Accumulated points">
          {formatNumber(accumulatedCount)}
        </span>
        <span className="text-[#333333] mx-0.5">/</span>
        <span className="text-cyan-400/70" title="Current scan">
          {currentCount}
        </span>
        <span className="text-[#444444] ml-1">pts</span>
        <span className="mx-2 text-[#252525]">|</span>
        <span className="text-amber-400/80">{scan?.fps ?? 0}</span>
        <span className="text-[#444444] ml-0.5">Hz</span>
      </div>
      {/* Clear button - subtle */}
      <button
        onClick={onClear}
        className="px-1.5 py-0.5 bg-[#1f1f1f] hover:bg-red-500/20 text-[#555555] hover:text-red-400 rounded text-[9px] uppercase tracking-wider transition-all border border-transparent hover:border-red-500/20"
        title="Clear accumulated map"
      >
        Clear
      </button>
    </div>
  )
}

// =============================================================================
// Topic Selector
// =============================================================================

interface TopicSelectorProps {
  topics: RosTopic[]
  selectedTopic: string | null
  hasSignal: boolean
  onSelect: (topicName: string) => void
}

function TopicSelector({ topics, selectedTopic, hasSignal, onSelect }: TopicSelectorProps) {
  if (topics.length === 0 && !selectedTopic && !hasSignal) {
    return (
      <div
        className="px-2.5 py-1.5 text-[10px] text-red-400/70 font-mono uppercase tracking-wider bg-red-500/10 border border-red-500/20 rounded-lg"
        data-testid="no-lidar-signal"
      >
        No Signal
      </div>
    )
  }

  return (
    <div className="relative" data-testid="lidar-topic-selector">
      <select
        value={selectedTopic ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="
          appearance-none bg-[#141414] border border-[#252525] rounded-lg px-2.5 py-1.5
          text-[10px] text-[#777777] font-mono tracking-wider
          cursor-pointer hover:border-[#333333] hover:text-[#999999] focus:border-teal-500/50 focus:outline-none
          pr-6 max-w-[180px] transition-all
        "
        aria-label="Select LIDAR topic"
      >
        <option value="" disabled>
          Select Topic
        </option>
        {topics.map((topic) => (
          <option key={topic.name} value={topic.name}>
            {topic.name}
          </option>
        ))}
      </select>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg
          className="w-3 h-3 text-[#444444]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  )
}

// =============================================================================
// Robot Selector
// =============================================================================

interface RobotSelectorProps {
  selectedRobotId: string | null
  onSelectRobot: (robotId: string | null) => void
}

function RobotSelector({ selectedRobotId, onSelectRobot }: RobotSelectorProps) {
  const robots = useRobotStore(useShallow((state) => Array.from(state.robots.values())))

  if (robots.length === 0) {
    return null
  }

  return (
    <div className="relative">
      <select
        value={selectedRobotId ?? ''}
        onChange={(e) => onSelectRobot(e.target.value || null)}
        className="
          appearance-none bg-[#141414] border border-[#252525] rounded-lg px-2.5 py-1.5
          text-[10px] text-[#777777] font-mono tracking-wider
          cursor-pointer hover:border-[#333333] hover:text-[#999999] focus:border-teal-500/50 focus:outline-none
          pr-6 transition-all
        "
      >
        <option value="">Robot</option>
        {robots.map((robot) => (
          <option key={robot.id} value={robot.id}>
            {robot.name ?? robot.id}
          </option>
        ))}
      </select>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg
          className="w-3 h-3 text-[#444444]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  )
}

// =============================================================================
// Exploration Controls Component
// =============================================================================

function ExplorationControls() {
  const socket = useWebSocketStore((state) => state.socket)

  // Map manager state from exploration store
  const mappingState = useExplorationStore(
    useShallow((state) => ({
      mapServerMode: state.mapServerMode,
      mapLoadingStatus: state.mapLoadingStatus,
      mapLoadingMessage: state.mapLoadingMessage,
      mapLoadingError: state.mapLoadingError,
      exploredPercent: state.exploredPercent,
    }))
  )

  const savedMaps = useExplorationStore((state) => state.savedMaps)
  const loadSavedMaps = useExplorationStore((state) => state.loadSavedMaps)
  const loadedMapId = useExplorationStore((state) => state.loadedMapId)

  const [showSaveModal, setShowSaveModal] = useState(false)
  const [mapName, setMapName] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Derived state
  const isSlamActive = mappingState.mapServerMode === 'slam'
  const isLoading = mappingState.mapLoadingStatus === 'loading'
  const hasError = mappingState.mapLoadingStatus === 'error'

  // Load saved maps on mount
  useEffect(() => {
    const load = async () => {
      try {
        await loadSavedMaps()
      } catch {
        // Silently ignore errors - maps may not be available
      }
    }
    load()
  }, [loadSavedMaps])

  // Handle start/stop SLAM
  const handleToggleSlam = useCallback(() => {
    if (!socket) return

    if (isSlamActive) {
      // Stop mapping (SLAM + Explore Lite)
      socket.emit('stop_mapping')
      useExplorationStore.getState().setMapServerMode('none')
    } else {
      // Start SLAM + Explore Lite
      socket.emit('start_slam')
      useExplorationStore.getState().startSlam()
    }
  }, [socket, isSlamActive])

  // Handle save map
  const handleSaveMap = useCallback(async () => {
    if (!mapName.trim()) return

    setIsSaving(true)
    try {
      const saveCurrentMap = useExplorationStore.getState().saveCurrentMap
      await saveCurrentMap(mapName.trim())
      setMapName('')
      setShowSaveModal(false)
    } finally {
      setIsSaving(false)
    }
  }, [mapName])

  // Handle load map
  const handleLoadMap = useCallback(async (mapId: string) => {
    if (!mapId) return
    const loadMap = useExplorationStore.getState().loadMap
    await loadMap(mapId)
  }, [])

  // Button states - synced with global map manager state
  const buttonLabel = isLoading ? 'Starting...' : isSlamActive ? 'Stop' : 'Scan'

  return (
    <div className="flex items-center gap-2">
      {/* Auto Scan Button - Premium design with scanning animation */}
      <button
        onClick={handleToggleSlam}
        disabled={isLoading}
        className={`
          relative px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider
          transition-all duration-300 disabled:opacity-50 disabled:cursor-wait
          border overflow-hidden
          ${
            isSlamActive
              ? 'bg-teal-500/15 text-teal-400 border-teal-500/30 hover:bg-red-500/20 hover:text-red-400 hover:border-red-500/30'
              : 'bg-[#141414] text-[#666666] border-[#252525] hover:text-teal-400 hover:border-teal-500/30 hover:bg-teal-500/10'
          }
        `}
        title={
          isSlamActive
            ? 'Stop autonomous mapping (SLAM + Explore)'
            : 'Start autonomous mapping (SLAM + Explore)'
        }
      >
        {/* Scanning animation - radar sweep */}
        {isSlamActive && (
          <span className="absolute inset-0 overflow-hidden rounded-lg">
            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-teal-400/20 to-transparent animate-[scan_2s_ease-in-out_infinite]" />
          </span>
        )}
        <span className="relative flex items-center gap-1.5">
          {isSlamActive && <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />}
          {buttonLabel}
        </span>
      </button>

      {/* Active mapping status - Premium badge */}
      {isSlamActive && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-teal-500/10 rounded-lg border border-teal-500/20">
          <span className="text-[10px] font-mono text-teal-400/80 tracking-wide">MAPPING</span>
          {mappingState.exploredPercent > 0 && (
            <span className="text-[10px] font-mono text-[#555555]">
              {mappingState.exploredPercent.toFixed(0)}%
            </span>
          )}
        </div>
      )}

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400/70">
          <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="2"
              strokeOpacity="0.3"
            />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>{mappingState.mapLoadingMessage || 'Loading...'}</span>
        </div>
      )}

      {/* Error indicator */}
      {hasError && (
        <div
          className="flex items-center gap-1 text-[10px] font-mono text-red-400/70 px-2 py-0.5 bg-red-500/10 rounded border border-red-500/20"
          title={mappingState.mapLoadingError || ''}
        >
          <span>⚠</span>
          <span>Error</span>
        </div>
      )}

      {/* Separator */}
      <div className="w-px h-4 bg-[#252525]" />

      {/* Save Map Button */}
      <button
        onClick={() => setShowSaveModal(true)}
        className="px-2 py-1 rounded-lg border border-[#252525] bg-[#141414] hover:bg-[#1a1a1a] text-[10px] font-mono uppercase tracking-wider text-[#555555] hover:text-[#888888] transition-all hover:border-[#333333]"
        title="Save current map"
      >
        Save
      </button>

      {/* Load Map Dropdown */}
      {savedMaps.length > 0 && (
        <select
          value={loadedMapId ?? ''}
          onChange={(e) => handleLoadMap(e.target.value)}
          className="
            appearance-none bg-[#141414] border border-[#252525] rounded-lg px-2 py-1
            text-[10px] text-[#555555] font-mono tracking-wider
            cursor-pointer hover:border-[#333333] hover:text-[#888888] focus:border-teal-500/50 focus:outline-none
            max-w-[100px] transition-all
          "
          title="Load saved map"
        >
          <option value="">Load</option>
          {savedMaps.map((map) => (
            <option key={map.id} value={map.id}>
              {map.name}
            </option>
          ))}
        </select>
      )}

      {/* Save Modal - Premium design */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#141414]/95 border border-[#2a2a2a] rounded-xl p-5 w-80 shadow-2xl">
            <h3 className="text-sm font-medium text-white/90 mb-4">Save Map</h3>
            <input
              type="text"
              value={mapName}
              onChange={(e) => setMapName(e.target.value)}
              placeholder="Enter map name..."
              className="w-full bg-[#0a0a0a] border border-[#252525] rounded-lg px-3 py-2.5 text-sm text-white font-mono focus:border-teal-500/50 focus:outline-none mb-4 placeholder:text-[#444444]"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowSaveModal(false)
                  setMapName('')
                }}
                className="px-3 py-2 rounded-lg bg-[#1f1f1f] text-xs font-mono text-[#666666] hover:bg-[#252525] hover:text-[#888888] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMap}
                disabled={!mapName.trim() || isSaving}
                className="px-3 py-2 rounded-lg border border-teal-500/30 bg-teal-500/20 text-xs font-mono text-teal-400 hover:bg-teal-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Main Module Component
// =============================================================================

/**
 * Extract robot ID from topic name
 * e.g., /robot0/scan -> robot0
 */
function extractRobotIdFromTopic(topicName: string): string {
  const match = topicName.match(/\/(robot\d+)\//)
  return match ? match[1] : 'robot0'
}

export function LidarModule({ windowId }: ModuleProps) {
  // Default to 'robot0' for Isaac Sim / Go2 Unitree
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>('robot0')

  // Get scanning state for visual effects
  const isSlamActive = useExplorationStore((state) => state.mapServerMode === 'slam')

  // Get ROS topics for LIDAR streams
  const allTopics = useTopicStore((state) => state.topics)
  const addTopicSubscription = useTopicStore((state) => state.addSubscription)
  const socket = useWebSocketStore((state) => state.socket)

  // Filter LIDAR topics (memoized) using TopicRegistry
  const lidarTopics = useMemo(() => filterLidarTopics(allTopics), [allTopics])

  // If topics list is temporarily empty but scan data is streaming, treat as signal.
  const signalRobotId = selectedRobotId || 'robot0'
  const scan = useLidarStore((state) => state.scans.get(signalRobotId))
  const hasLidarSignal = (scan?.pointBuffer?.count ?? 0) > 0 || (scan?.points?.length ?? 0) > 0

  // Track if auto-detection has run
  const hasAutoDetected = useRef(false)

  // Selected ROS topic for LIDAR stream
  const [selectedTopicName, setSelectedTopicName] = useState<string | null>(null)

  // Subscribe/unsubscribe to LIDAR stream (lidar-store for internal tracking)
  const addLidarSubscription = useLidarStore((state) => state.addSubscription)
  const removeLidarSubscription = useLidarStore((state) => state.removeSubscription)
  const clearAccumulated = useLidarStore((state) => state.clearAccumulated)

  // Handle clear map button
  const handleClearMap = useCallback(() => {
    const robotId = selectedRobotId || 'robot0'
    clearAccumulated(robotId)
  }, [selectedRobotId, clearAccumulated])

  // Auto-detect LIDAR topic on first load
  // Uses memoized lidarTopics to avoid creating new arrays
  useEffect(() => {
    if (!hasAutoDetected.current && lidarTopics.length > 0 && !selectedTopicName) {
      // Auto-detect best LIDAR topic using memoized lidarTopics
      // Priority: /scan > /robot0/lidar > /robot0/point_cloud > point_cloud2_L1 > lidar > first
      const patterns = [
        /\/scan$/i,
        /\/robot0\/.*lidar/i,
        /\/robot0\/.*point_cloud/i,
        /point_cloud2_L1/i,
        /lidar/i,
      ]

      let detected: RosTopic | null = null
      for (const pattern of patterns) {
        const match = lidarTopics.find((topic) => pattern.test(topic.name))
        if (match) {
          detected = match
          break
        }
      }
      // Fallback to first available if no pattern matches
      if (!detected && lidarTopics.length > 0) {
        detected = lidarTopics[0]
      }

      if (detected) {
        hasAutoDetected.current = true // Set BEFORE state updates to prevent re-entry
        setSelectedTopicName(detected.name)
        // Extract robot ID from topic name
        const robotId = extractRobotIdFromTopic(detected.name)
        setSelectedRobotId(robotId)
        // Subscribe to the topic if not already subscribed (get fresh subscription state)
        const currentSubscriptions = useTopicStore.getState().subscriptions
        if (!currentSubscriptions.has(detected.name) && socket) {
          socket.emit('ros_subscribe', { topic: detected.name, type: detected.type })
          addTopicSubscription(detected.name)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lidarTopics, selectedTopicName, socket]) // Removed subscriptions - check inside effect instead

  // Handle topic selection
  const handleTopicSelect = useCallback(
    (topicName: string) => {
      // 1. Unsubscribe from previous topic if different
      if (selectedTopicName && selectedTopicName !== topicName && socket) {
        socket.emit('ros_unsubscribe', { topic: selectedTopicName })
        // Clear accumulated data for previous robot
        const prevRobotId = extractRobotIdFromTopic(selectedTopicName)
        clearAccumulated(prevRobotId)
      }

      // 2. Update state
      setSelectedTopicName(topicName)
      const robotId = extractRobotIdFromTopic(topicName)
      setSelectedRobotId(robotId)

      // 3. Always subscribe to the new topic (even if seen before)
      const topic = lidarTopics.find((t) => t.name === topicName)
      if (topic && socket) {
        socket.emit('ros_subscribe', { topic: topicName, type: topic.type })
        addTopicSubscription(topicName)
      }
    },
    [selectedTopicName, lidarTopics, socket, addTopicSubscription, clearAccumulated]
  )

  // Track lidar subscriptions in lidar-store
  useEffect(() => {
    const robotId = selectedRobotId || 'robot0'
    addLidarSubscription(robotId)
    return () => {
      removeLidarSubscription(robotId)
    }
  }, [selectedRobotId, addLidarSubscription, removeLidarSubscription])

  return (
    <div
      className="h-full w-full flex flex-col bg-[#0a0a0a]"
      data-testid={`module-lidar-${windowId}`}
    >
      {/* CSS Animations for scanning effects */}
      <style jsx>{`
        @keyframes scan {
          0%,
          100% {
            transform: translateX(-100%);
          }
          50% {
            transform: translateX(100%);
          }
        }
        @keyframes scan-line {
          0%,
          100% {
            transform: translateY(0);
            opacity: 0;
          }
          50% {
            transform: translateY(100vh);
            opacity: 1;
          }
        }
      `}</style>

      {/* Header - Topic selector + Robot selector - Premium minimal */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a1a1a] gap-3 relative z-30 bg-[#0d0d0d]">
        <div className="flex items-center gap-2">
          {/* ROS Topic Selector (primary) */}
          <TopicSelector
            topics={lidarTopics}
            selectedTopic={selectedTopicName}
            hasSignal={hasLidarSignal}
            onSelect={handleTopicSelect}
          />

          {/* Robot Selector (secondary) */}
          <RobotSelector selectedRobotId={selectedRobotId} onSelectRobot={setSelectedRobotId} />
        </div>

        {/* Stats mini */}
        <StatsOverlay robotId={selectedRobotId} onClear={handleClearMap} />
      </div>

      {/* Exploration Controls Bar - Premium */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#141414] bg-[#0a0a0a]">
        <ExplorationControls />
      </div>

      {/* Three.js Canvas - Premium Sci-Fi Visualization */}
      <div className="flex-1 relative min-h-0">
        {/* Scanning border animation */}
        {isSlamActive && (
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute inset-0 border border-teal-500/20 rounded-sm animate-pulse" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-teal-400/50 to-transparent animate-[scan-line_3s_ease-in-out_infinite]" />
          </div>
        )}

        <Canvas
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.2,
          }}
          style={{ background: '#0a0a0a' }}
        >
          <LidarScene robotId={selectedRobotId} isScanning={isSlamActive} />
        </Canvas>

        {/* Empty State - Premium design */}
        {lidarTopics.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-[#252525] text-3xl mb-3">
                <svg
                  className="w-12 h-12 mx-auto"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div className="text-[#333333] text-xs font-mono uppercase tracking-wider mb-1">
                3D Point Cloud
              </div>
              <div className="text-[#444444] text-[10px]">Awaiting LIDAR data stream</div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default LidarModule
