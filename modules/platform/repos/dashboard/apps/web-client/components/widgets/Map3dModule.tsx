/**
 * Map3dModule Component
 *
 * 3D map visualization using Three.js.
 * Shows robots on a 3D floor plan with orbit controls.
 *
 * @see research-summary.md F2: Real-time Robot Monitoring
 */

'use client'

import { useMemo, useRef, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, Text } from '@react-three/drei'
import { useRobotStore } from '@/lib/stores/robot-store'
import { useMapStore } from '@/lib/stores/map-store'
import type { ModuleProps } from './ModuleRegistry'
import type { RobotEntity, RobotStatus } from '@workspace/shared-types'
import * as THREE from 'three'

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get color for robot status
 */
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
// 3D Components
// =============================================================================

/**
 * Robot marker in 3D space
 */
function RobotMarker({
  robot,
  isSelected,
  onClick,
}: {
  robot: RobotEntity
  isSelected: boolean
  onClick: () => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const color = getStatusColor(robot.status)

  // Animate the robot marker
  useFrame((state) => {
    if (meshRef.current && isSelected) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.5
    }
  })

  return (
    <group position={[robot.position.x, robot.position.z, -robot.position.y]}>
      {/* Robot body */}
      <mesh ref={meshRef} onClick={onClick}>
        <cylinderGeometry args={[0.3, 0.3, 0.5, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Direction indicator */}
      <mesh position={[0.2, 0.3, 0]}>
        <coneGeometry args={[0.1, 0.2, 8]} />
        <meshStandardMaterial color="#00ff00" />
      </mesh>

      {/* Selection ring */}
      {isSelected && (
        <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.4, 0.5, 32]} />
          <meshBasicMaterial color="#00ffff" transparent opacity={0.7} />
        </mesh>
      )}

      {/* Label */}
      <Text position={[0, 0.6, 0]} fontSize={0.2} color="#ffffff" anchorX="center" anchorY="bottom">
        {robot.name}
      </Text>
    </group>
  )
}

/**
 * Floor grid
 */
function FloorGrid() {
  return (
    <Grid
      args={[20, 20]}
      cellSize={1}
      cellThickness={0.5}
      cellColor="#333333"
      sectionSize={5}
      sectionThickness={1}
      sectionColor="#555555"
      fadeDistance={30}
      fadeStrength={1}
      followCamera={false}
      infiniteGrid={false}
    />
  )
}

/**
 * Camera controller for preset views
 */
function CameraController({ viewRef }: { viewRef: React.MutableRefObject<string> }) {
  const { camera } = useThree()

  useFrame(() => {
    if (viewRef.current === 'top') {
      camera.position.lerp(new THREE.Vector3(0, 15, 0), 0.1)
      camera.lookAt(0, 0, 0)
      viewRef.current = ''
    } else if (viewRef.current === 'front') {
      camera.position.lerp(new THREE.Vector3(0, 5, 15), 0.1)
      camera.lookAt(0, 0, 0)
      viewRef.current = ''
    } else if (viewRef.current === 'reset') {
      camera.position.lerp(new THREE.Vector3(10, 10, 10), 0.1)
      camera.lookAt(0, 0, 0)
      viewRef.current = ''
    }
  })

  return null
}

/**
 * Main 3D scene
 */
function Map3dScene({
  robots,
  selectedRobotId,
  onSelectRobot,
  viewRef,
}: {
  robots: RobotEntity[]
  selectedRobotId: string | null
  onSelectRobot: (id: string | null) => void
  viewRef: React.MutableRefObject<string>
}) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <directionalLight position={[-10, -10, -5]} intensity={0.3} />

      {/* Floor */}
      <FloorGrid />

      {/* Robots */}
      {robots.map((robot) => (
        <RobotMarker
          key={robot.id}
          robot={robot}
          isSelected={robot.id === selectedRobotId}
          onClick={() => onSelectRobot(robot.id === selectedRobotId ? null : robot.id)}
        />
      ))}

      {/* Camera controls */}
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        minDistance={2}
        maxDistance={50}
        maxPolarAngle={Math.PI / 2}
      />

      <CameraController viewRef={viewRef} />
    </>
  )
}

// =============================================================================
// UI Components
// =============================================================================

/**
 * Stats overlay
 */
function StatsOverlay({ robotCount }: { robotCount: number }) {
  return (
    <div className="absolute top-2 left-2 bg-[#1a1a1a]/90 rounded px-2 py-1 text-[10px] font-mono z-10">
      <div className="flex items-center gap-2">
        <span className="text-[#666666]">3D MAP</span>
        <span className="text-[#00ffff]">{robotCount}</span>
        <span className="text-[#666666]">robots</span>
      </div>
    </div>
  )
}

/**
 * View control buttons
 */
function ViewControls({
  onTopView,
  onFrontView,
  onReset,
}: {
  onTopView: () => void
  onFrontView: () => void
  onReset: () => void
}) {
  return (
    <div className="absolute top-2 right-2 flex gap-1 z-10">
      <button
        onClick={onTopView}
        className="px-2 py-1 bg-[#1a1a1a]/90 rounded text-[9px] font-mono text-[#888888] hover:text-[#00ffff] transition-colors"
      >
        Top
      </button>
      <button
        onClick={onFrontView}
        className="px-2 py-1 bg-[#1a1a1a]/90 rounded text-[9px] font-mono text-[#888888] hover:text-[#00ffff] transition-colors"
      >
        Front
      </button>
      <button
        onClick={onReset}
        className="px-2 py-1 bg-[#1a1a1a]/90 rounded text-[9px] font-mono text-[#888888] hover:text-[#00ffff] transition-colors"
      >
        Reset
      </button>
    </div>
  )
}

// =============================================================================
// Main Module Component
// =============================================================================

export function Map3dModule({ windowId }: ModuleProps) {
  const robots = useRobotStore((state) => state.robots)
  const selectedRobotId = useMapStore((state) => state.selectedRobotId)
  const selectRobot = useMapStore((state) => state.selectRobot)
  const viewRef = useRef<string>('')

  // Convert Map to array
  const robotList = useMemo(() => Array.from(robots.values()), [robots])

  // View handlers
  const handleTopView = useCallback(() => {
    viewRef.current = 'top'
  }, [])

  const handleFrontView = useCallback(() => {
    viewRef.current = 'front'
  }, [])

  const handleReset = useCallback(() => {
    viewRef.current = 'reset'
  }, [])

  return (
    <div className="h-full w-full relative bg-[#0a0a0a]" data-testid={`module-map-3d-${windowId}`}>
      {/* 3D Canvas */}
      <Canvas camera={{ position: [10, 10, 10], fov: 50 }} style={{ background: '#0a0a0a' }}>
        <Map3dScene
          robots={robotList}
          selectedRobotId={selectedRobotId}
          onSelectRobot={selectRobot}
          viewRef={viewRef}
        />
      </Canvas>

      {/* Overlays */}
      <StatsOverlay robotCount={robotList.length} />
      <ViewControls onTopView={handleTopView} onFrontView={handleFrontView} onReset={handleReset} />

      {/* Empty State */}
      {robotList.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-[#333333] text-xs font-mono uppercase tracking-wider mb-1">
              3D Map View
            </div>
            <div className="text-[#555555] text-[10px]">No robots connected</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Map3dModule
