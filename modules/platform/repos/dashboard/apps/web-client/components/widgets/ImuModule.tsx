/**
 * ImuModule Component
 *
 * Real-time IMU (Inertial Measurement Unit) visualization.
 * Features:
 * - 3D orientation cube using Three.js
 * - Real-time acceleration and angular velocity values
 * - Euler angles display
 */

'use client'

import { useRef, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Box } from '@react-three/drei'
import * as THREE from 'three'
import { useImuStore, radToDeg, type ImuData } from '@/lib/stores/imu-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import type { ModuleProps } from './ModuleRegistry'

// =============================================================================
// 3D Orientation Cube
// =============================================================================

interface OrientationCubeProps {
  imuData: ImuData | undefined
}

function OrientationCube({ imuData }: OrientationCubeProps) {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame(() => {
    if (!meshRef.current || !imuData?.orientation) return

    // Apply quaternion rotation
    const { x, y, z, w } = imuData.orientation
    meshRef.current.quaternion.set(x, y, z, w)
  })

  return (
    <group>
      {/* Main cube */}
      <Box ref={meshRef} args={[1.5, 0.3, 1]}>
        <meshStandardMaterial color="#00ffff" transparent opacity={0.8} />
      </Box>

      {/* Direction indicator (front) */}
      <mesh ref={meshRef} position={[0.9, 0, 0]}>
        <coneGeometry args={[0.15, 0.3, 8]} />
        <meshStandardMaterial color="#00ff00" />
      </mesh>

      {/* Axes helper */}
      <axesHelper args={[1.5]} />

      {/* Ground reference */}
      <gridHelper args={[4, 8, '#333333', '#222222']} position={[0, -1, 0]} />
    </group>
  )
}

// =============================================================================
// Scene
// =============================================================================

interface ImuSceneProps {
  imuData: ImuData | undefined
}

function ImuScene({ imuData }: ImuSceneProps) {
  return (
    <>
      {/* Camera */}
      <perspectiveCamera position={[3, 2, 3]} />

      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />

      {/* Orientation Cube */}
      <OrientationCube imuData={imuData} />
    </>
  )
}

// =============================================================================
// Data Display
// =============================================================================

interface DataPanelProps {
  imuData: ImuData | undefined
}

function DataPanel({ imuData }: DataPanelProps) {
  const euler = imuData?.euler
  const accel = imuData?.linearAcceleration
  const angVel = imuData?.angularVelocity

  return (
    <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
      {/* Euler Angles */}
      <div className="bg-[#1a1a1a] rounded p-2">
        <div className="text-[#666666] uppercase tracking-wider mb-1">Orientation</div>
        <div className="space-y-0.5">
          <div className="flex justify-between">
            <span className="text-[#ff6666]">Roll</span>
            <span className="text-white">{euler ? radToDeg(euler.roll).toFixed(1) : '--'}°</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#66ff66]">Pitch</span>
            <span className="text-white">{euler ? radToDeg(euler.pitch).toFixed(1) : '--'}°</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6666ff]">Yaw</span>
            <span className="text-white">{euler ? radToDeg(euler.yaw).toFixed(1) : '--'}°</span>
          </div>
        </div>
      </div>

      {/* Linear Acceleration */}
      <div className="bg-[#1a1a1a] rounded p-2">
        <div className="text-[#666666] uppercase tracking-wider mb-1">Accel (m/s²)</div>
        <div className="space-y-0.5">
          <div className="flex justify-between">
            <span className="text-[#ff6666]">X</span>
            <span className="text-white">{accel ? accel.x.toFixed(2) : '--'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#66ff66]">Y</span>
            <span className="text-white">{accel ? accel.y.toFixed(2) : '--'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6666ff]">Z</span>
            <span className="text-white">{accel ? accel.z.toFixed(2) : '--'}</span>
          </div>
        </div>
      </div>

      {/* Angular Velocity */}
      <div className="bg-[#1a1a1a] rounded p-2">
        <div className="text-[#666666] uppercase tracking-wider mb-1">Gyro (rad/s)</div>
        <div className="space-y-0.5">
          <div className="flex justify-between">
            <span className="text-[#ff6666]">X</span>
            <span className="text-white">{angVel ? angVel.x.toFixed(3) : '--'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#66ff66]">Y</span>
            <span className="text-white">{angVel ? angVel.y.toFixed(3) : '--'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#6666ff]">Z</span>
            <span className="text-white">{angVel ? angVel.z.toFixed(3) : '--'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// Stats Overlay
// =============================================================================

interface StatsOverlayProps {
  imuData: ImuData | undefined
}

function StatsOverlay({ imuData }: StatsOverlayProps) {
  const hasData = !!imuData

  return (
    <div className="flex items-center gap-3 bg-[#1a1a1a]/90 rounded px-2 py-1 text-[10px] font-mono">
      <div className="flex items-center gap-2">
        <span className="text-[#666666]">IMU</span>
        <span className={`w-1.5 h-1.5 rounded-full ${hasData ? 'bg-[#00ff00]' : 'bg-[#ff0000]'}`} />
      </div>
      {hasData && (
        <div className="text-[#888888]">
          <span className="text-[#00ffff]">{imuData.frameId}</span>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Robot Selector
// =============================================================================

interface RobotSelectorProps {
  selectedRobotId: string
  onSelect: (robotId: string) => void
  availableRobots: string[]
}

function RobotSelector({ selectedRobotId, onSelect, availableRobots }: RobotSelectorProps) {
  if (availableRobots.length <= 1) {
    return <span className="text-[10px] text-[#888888] font-mono">{selectedRobotId}</span>
  }

  return (
    <select
      value={selectedRobotId}
      onChange={(e) => onSelect(e.target.value)}
      className="
        appearance-none bg-[#1a1a1a] border border-[#333333] rounded px-2 py-1
        text-xs text-[#888888] font-mono
        cursor-pointer hover:border-[#444444] focus:border-cyan-500 focus:outline-none
      "
    >
      {availableRobots.map((robotId) => (
        <option key={robotId} value={robotId}>
          {robotId}
        </option>
      ))}
    </select>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function ImuModule({ windowId }: ModuleProps) {
  const [selectedRobotId, setSelectedRobotId] = useState('robot0')

  // Store state
  const data = useImuStore((state) => state.data)
  const rosbridgeConnected = useWebSocketStore((state) => state.rosbridgeConnected)

  // Get available robots and selected IMU data
  const availableRobots = useMemo(() => Array.from(data.keys()), [data])
  const imuData = data.get(selectedRobotId)

  return (
    <div
      className="h-full w-full flex flex-col bg-[#0a0a0a]"
      data-testid={`module-imu-${windowId}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-2 border-b border-[#222222] gap-2">
        <RobotSelector
          selectedRobotId={selectedRobotId}
          onSelect={setSelectedRobotId}
          availableRobots={availableRobots.length > 0 ? availableRobots : ['robot0']}
        />
        <StatsOverlay imuData={imuData} />
      </div>

      {/* 3D View */}
      <div className="flex-1 relative min-h-0">
        <Canvas
          gl={{ antialias: true, alpha: false }}
          camera={{ position: [3, 2, 3], fov: 50 }}
          style={{ background: '#0a0a0a' }}
        >
          <ImuScene imuData={imuData} />
        </Canvas>

        {/* Empty State */}
        {!imuData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <div className="text-[#333333] text-4xl mb-2">*</div>
              <div className="text-[#333333] text-xs font-mono uppercase tracking-wider mb-1">
                IMU Visualization
              </div>
              <div className="text-[#555555] text-[10px]">
                {rosbridgeConnected ? 'Waiting for IMU data...' : 'Connect to ROSBridge'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Data Panel */}
      <div className="p-2 border-t border-[#222222]">
        <DataPanel imuData={imuData} />
      </div>
    </div>
  )
}

export default ImuModule
