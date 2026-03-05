'use client'

/**
 * CameraModule Component
 *
 * Video streaming widget with HLS/WebRTC mode switching.
 * Integrates with camera store and use-camera-stream hook.
 *
 * Features:
 * - Camera selection dropdown
 * - HLS/WebRTC mode toggle
 * - Video player with status overlay
 * - FPS and latency metrics
 */

import { type ReactNode, useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { useCameraStore } from '@/lib/stores/camera-store'
import { useCameraStream } from '@/lib/hooks/use-camera-stream'
import { usePanelRoutingStore } from '@/lib/stores/panel-routing-store'
import { useTopicStore, type RosTopic } from '@/lib/stores/topic-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import { filterCameraTopics } from '@/lib/ros'
import type { CameraEntity } from '@workspace/shared-types'
import type { ModuleProps } from './ModuleRegistry'
import { VideoPlayer } from './VideoPlayer'

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Camera Selector Dropdown
 */
interface CameraSelectorProps {
  cameras: CameraEntity[]
  selectedId: string | null
  onSelect: (cameraId: string) => void
}

function CameraSelector({ cameras, selectedId, onSelect }: CameraSelectorProps): ReactNode {
  return (
    <div className="relative" data-testid="camera-selector">
      <select
        value={selectedId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="
          appearance-none bg-[#1a1f23] border border-[#333333] rounded px-2 py-1
          text-xs text-[#888888] font-mono uppercase tracking-wider
          cursor-pointer hover:border-[#444444] focus:border-cyan-500 focus:outline-none
          pr-6
        "
        aria-label="Select camera"
      >
        <option value="" disabled>
          Select Camera
        </option>
        {cameras.map((camera) => (
          <option key={camera.id} value={camera.id}>
            {camera.name}
          </option>
        ))}
      </select>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg
          className="w-3 h-3 text-[#555555]"
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

/**
 * Convert topic name to camera ID (same logic as server)
 * e.g., /robot0/front_cam/rgb -> robot0-front_cam-rgb
 */
function topicToCameraId(topicName: string): string {
  return topicName.replace(/\//g, '-').slice(1)
}

/**
 * Topic Selector Dropdown for ROS camera topics
 */
interface TopicSelectorProps {
  topics: RosTopic[]
  selectedTopic: string | null
  hasSignal: boolean
  onSelect: (topicName: string) => void
}

function TopicSelector({
  topics,
  selectedTopic,
  hasSignal,
  onSelect,
}: TopicSelectorProps): ReactNode {
  if (topics.length === 0 && !selectedTopic && !hasSignal) {
    return (
      <div
        className="px-2 py-1 text-[10px] text-red-400 font-mono uppercase tracking-wider bg-red-500/10 border border-red-500/30 rounded"
        data-testid="no-signal-indicator"
      >
        No Signal
      </div>
    )
  }

  return (
    <div className="relative" data-testid="topic-selector">
      <select
        value={selectedTopic ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        className="
          appearance-none bg-[#1a1f23] border border-[#333333] rounded px-2 py-1
          text-xs text-[#888888] font-mono tracking-wider
          cursor-pointer hover:border-[#444444] focus:border-purple-500 focus:outline-none
          pr-6 max-w-[180px]
        "
        aria-label="Select ROS topic"
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
          className="w-3 h-3 text-[#555555]"
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

/**
 * Stream Mode Preference Type
 */
type StreamModePreference = 'auto' | 'webrtc' | 'websocket'

/**
 * Mode Toggle Button with Auto/WebRTC/WebSocket options
 */
interface ModeToggleProps {
  mode: StreamModePreference
  activeMode: 'webrtc' | 'websocket' | null
  onModeChange: (mode: StreamModePreference) => void
  isFallback: boolean
  onRetry?: () => void
}

function ModeToggle({
  mode,
  activeMode,
  onModeChange,
  isFallback,
  onRetry,
}: ModeToggleProps): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onModeChange('auto')}
          className={`
            px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors
            ${
              mode === 'auto'
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                : 'bg-[#1a1f23] text-[#666666] border border-[#333333] hover:border-[#444444]'
            }
          `}
          aria-pressed={mode === 'auto'}
          title="Auto-select best mode (WebRTC first, fallback to WebSocket)"
        >
          AUTO
        </button>
        <button
          type="button"
          onClick={() => onModeChange('webrtc')}
          className={`
            px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors
            ${
              mode === 'webrtc'
                ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                : 'bg-[#1a1f23] text-[#666666] border border-[#333333] hover:border-[#444444]'
            }
          `}
          aria-pressed={mode === 'webrtc'}
          title="Force WebRTC (low latency)"
        >
          WebRTC
        </button>
        <button
          type="button"
          onClick={() => onModeChange('websocket')}
          className={`
            px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded transition-colors
            ${
              mode === 'websocket'
                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                : 'bg-[#1a1f23] text-[#666666] border border-[#333333] hover:border-[#444444]'
            }
          `}
          aria-pressed={mode === 'websocket'}
          title="Force WebSocket (JPEG frames)"
        >
          WS
        </button>
      </div>

      {/* Fallback indicator with retry button */}
      {isFallback && (
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-yellow-400 font-mono">FALLBACK</span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-1.5 py-0.5 text-[9px] font-mono uppercase bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded hover:bg-yellow-500/30 transition-colors"
              title="Retry WebRTC connection"
            >
              RETRY
            </button>
          )}
        </div>
      )}

      {/* Active mode indicator */}
      {activeMode && !isFallback && (
        <span
          className={`
            px-1.5 py-0.5 text-[9px] font-mono uppercase rounded
            ${
              activeMode === 'webrtc'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
            }
          `}
        >
          {activeMode === 'webrtc' ? 'LIVE' : 'JPEG'}
        </span>
      )}
    </div>
  )
}

/**
 * Status Bar Component
 */
interface StatusBarProps {
  status: 'connecting' | 'live' | 'error' | 'stopped'
  fps: number | null
  latency: number | null
  activeMode: 'webrtc' | 'websocket' | null
  retryCount: number
  error: string | null
}

function StatusBar({
  status,
  fps,
  latency,
  activeMode,
  retryCount,
  error,
}: StatusBarProps): ReactNode {
  const statusColor = useMemo(() => {
    switch (status) {
      case 'live':
        return 'text-green-400'
      case 'connecting':
        return 'text-yellow-400'
      case 'error':
        return 'text-red-400'
      default:
        return 'text-[#555555]'
    }
  }, [status])

  return (
    <div
      className="flex items-center justify-between px-2 py-1 border-t border-[#222222]"
      data-testid="stream-status"
    >
      <div className="flex items-center gap-2">
        <div
          className={`w-2 h-2 rounded-full ${status === 'live' ? 'bg-green-400 animate-pulse' : 'bg-[#333333]'}`}
        />
        <span className={`text-[10px] font-mono uppercase tracking-wider ${statusColor}`}>
          {status}
        </span>
        {retryCount > 0 && status === 'connecting' && (
          <span className="text-[9px] text-yellow-400 font-mono">(retry {retryCount}/3)</span>
        )}
      </div>

      <div className="flex items-center gap-3 text-[10px] font-mono text-[#555555]">
        {fps !== null && <span>{fps.toFixed(0)} FPS</span>}
        {activeMode === 'webrtc' && latency !== null && <span>{latency}ms</span>}
        {error && (
          <span className="text-red-400 truncate max-w-[150px]" title={error}>
            {error.slice(0, 20)}...
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Empty State Placeholder
 */
function NoCamerasPlaceholder(): ReactNode {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2">
      <div className="text-4xl text-[#333333]">📷</div>
      <span className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">
        No Cameras
      </span>
      <span className="text-[9px] text-[#444444] text-center max-w-[200px]">
        Waiting for camera discovery from ROS bridge
      </span>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * CameraModule Component
 *
 * Main camera streaming widget for the dashboard.
 */
export function CameraModule({ windowId }: ModuleProps): ReactNode {
  // Get cameras map from store (stable reference)
  const camerasMap = useCameraStore((state) => state.cameras)
  const selectedCamera = useCameraStore((state) => state.selectedCamera)
  const selectCamera = useCameraStore((state) => state.selectCamera)

  // Get active topic from panel routing (dynamic routing)
  const activeTopic = usePanelRoutingStore((state) => state.panels['camera'])

  // Get ROS topics for camera streams
  const allTopics = useTopicStore((state) => state.topics)
  const subscriptions = useTopicStore((state) => state.subscriptions)
  const addSubscription = useTopicStore((state) => state.addSubscription)
  const socket = useWebSocketStore((state) => state.socket)

  // Filter camera topics (memoized) using TopicRegistry
  const cameraTopics = useMemo(() => filterCameraTopics(allTopics), [allTopics])

  // Selected ROS topic for camera stream
  const [selectedTopicName, setSelectedTopicName] = useState<string | null>(null)

  // If the topic list is temporarily empty but we already have a selected/active topic,
  // keep the selector usable (prevents false "No Signal" while frames are streaming).
  const selectedCameraTopic = selectedCamera
    ? (camerasMap.get(selectedCamera)?.topic ?? null)
    : null

  const effectiveSelectedTopicName =
    selectedTopicName ?? selectedCameraTopic ?? activeTopic?.topicName ?? null

  const effectiveCameraTopics: RosTopic[] = useMemo(() => {
    if (cameraTopics.length > 0) return cameraTopics
    if (!effectiveSelectedTopicName) return []

    // Type is unknown here (topic list not loaded); used only for display.
    return [{ name: effectiveSelectedTopicName, type: 'sensor_msgs/Image' }]
  }, [cameraTopics, effectiveSelectedTopicName])

  // Track if auto-detection has run
  const hasAutoDetected = useRef(false)

  // Convert map to array (memoized)
  const cameras = useMemo(() => Array.from(camerasMap.values()), [camerasMap])

  // Local state for this window's selected camera (allows different windows to show different cameras)
  const [localSelectedCamera, setLocalSelectedCamera] = useState<string | null>(null)

  // Auto-detect camera topic on first load
  // Uses memoized cameraTopics to avoid creating new arrays
  useEffect(() => {
    if (!hasAutoDetected.current && cameraTopics.length > 0 && !selectedTopicName) {
      // Auto-detect best camera topic using memoized cameraTopics
      // Priority: /camera/ > /image_raw > /video > /robot0 > first available
      const patterns = [/\/camera\//i, /\/image_raw/i, /\/video/i, /robot0/i]

      let detected: RosTopic | null = null
      for (const pattern of patterns) {
        const match = cameraTopics.find((topic) => pattern.test(topic.name))
        if (match) {
          detected = match
          break
        }
      }
      // Fallback to first available if no pattern matches
      if (!detected && cameraTopics.length > 0) {
        detected = cameraTopics[0]
      }

      if (detected) {
        hasAutoDetected.current = true // Set BEFORE state updates to prevent re-entry
        setSelectedTopicName(detected.name)
        // Subscribe to the topic if not already subscribed (get fresh subscription state)
        const currentSubscriptions = useTopicStore.getState().subscriptions
        if (!currentSubscriptions.has(detected.name) && socket) {
          socket.emit('ros_subscribe', { topic: detected.name, type: detected.type })
          addSubscription(detected.name)
        }

        // Create synthetic camera entity in store to enable WebRTC
        const cameraId = topicToCameraId(detected.name)
        const existingCamera = useCameraStore.getState().getCameraById(cameraId)
        if (!existingCamera) {
          useCameraStore.getState().addCamera({
            id: cameraId,
            robotId: 'robot0',
            name: detected.name.split('/').pop() || 'Camera',
            status: 'active',
            topic: detected.name,
            capabilities: {
              supportsWebRTC: true,
              supportsHLS: false,
              supportsPTZ: false,
              maxResolution: { width: 640, height: 480 },
              maxFps: 30,
            },
            webrtcEnabled: false,
          })
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraTopics, selectedTopicName, socket]) // Removed subscriptions - check inside effect instead

  // Auto-select first discovered camera when cameras arrive but nothing is selected
  // This handles the case where camera_discovered events arrive before topic list
  useEffect(() => {
    if (cameras.length > 0 && !localSelectedCamera && !selectedTopicName && !selectedCamera) {
      const firstCamera = cameras[0]
      setLocalSelectedCamera(firstCamera.id)
      selectCamera(firstCamera.id)
    }
  }, [cameras, localSelectedCamera, selectedTopicName, selectedCamera, selectCamera])

  // Get addCamera from store
  const addCamera = useCameraStore((state) => state.addCamera)

  // Handle topic selection
  const handleTopicSelect = useCallback(
    (topicName: string) => {
      setSelectedTopicName(topicName)
      // Subscribe to the topic if not already subscribed
      const topic = cameraTopics.find((t) => t.name === topicName)
      if (topic && !subscriptions.has(topicName) && socket) {
        socket.emit('ros_subscribe', { topic: topicName, type: topic.type })
        addSubscription(topicName)
      }

      // Create synthetic camera entity in store to enable WebRTC
      // This allows useCameraStream to start before camera_discovered arrives
      const cameraId = topicToCameraId(topicName)
      const existingCamera = useCameraStore.getState().getCameraById(cameraId)
      if (!existingCamera) {
        addCamera({
          id: cameraId,
          robotId: 'robot0',
          name: topicName.split('/').pop() || 'Camera',
          status: 'active',
          topic: topicName,
          capabilities: {
            supportsWebRTC: true,
            supportsHLS: false,
            supportsPTZ: false,
            maxResolution: { width: 640, height: 480 },
            maxFps: 30,
          },
          webrtcEnabled: false,
        })
      }
    },
    [cameraTopics, subscriptions, socket, addSubscription, addCamera]
  )

  // React to dynamic topic routing from TopicInspector
  useEffect(() => {
    if (activeTopic?.topicName) {
      // Update selected topic from panel routing
      setSelectedTopicName(activeTopic.topicName)

      // Also try to find matching camera
      if (cameras.length > 0) {
        const matchingCamera = cameras.find(
          (cam) => cam.topic === activeTopic.topicName || cam.name.includes(activeTopic.topicName)
        )
        if (matchingCamera) {
          setLocalSelectedCamera(matchingCamera.id)
        } else if (cameras.length > 0) {
          setLocalSelectedCamera(cameras[0].id)
        }
      }
    }
  }, [activeTopic, cameras])

  // Determine which camera to use
  // Priority: local selection > panel routing topic > store selection
  const topicBasedCameraId = selectedTopicName ? topicToCameraId(selectedTopicName) : null
  const activeCameraId = localSelectedCamera ?? topicBasedCameraId ?? selectedCamera

  // Get camera stream with WebRTC-first strategy
  const {
    camera,
    modePreference,
    setModePreference,
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
    error,
    retryWebRTC,
  } = useCameraStream(activeCameraId, 'auto')

  // Handle camera selection
  const handleSelectCamera = useCallback(
    (cameraId: string) => {
      setLocalSelectedCamera(cameraId)
      selectCamera(cameraId)
    },
    [selectCamera]
  )

  // Handle mode change
  const handleModeChange = useCallback(
    (newMode: StreamModePreference) => {
      setModePreference(newMode)
    },
    [setModePreference]
  )

  // Handle WebRTC retry
  const handleRetryWebRTC = useCallback(() => {
    retryWebRTC()
  }, [retryWebRTC])

  // No cameras AND no topics available - show placeholder
  if (cameras.length === 0 && cameraTopics.length === 0) {
    return (
      <div
        className="h-full flex flex-col bg-[#0d0f11]"
        data-testid={`module-camera-${windowId}`}
        aria-label="Camera module - no cameras available"
      >
        <NoCamerasPlaceholder />
      </div>
    )
  }

  return (
    <div
      className="h-full flex flex-col bg-[#0d0f11]"
      data-testid={`module-camera-${windowId}`}
      aria-label={`Camera module - ${camera?.name ?? 'Select camera'}`}
    >
      {/* Header - Topic selector + Camera selector + mode toggle */}
      <div className="flex items-center justify-between p-2 border-b border-[#222222] gap-2 relative z-30">
        <div className="flex items-center gap-2">
          {/* ROS Topic Selector (primary) */}
          <TopicSelector
            topics={effectiveCameraTopics}
            selectedTopic={effectiveSelectedTopicName}
            hasSignal={
              status === 'live' ||
              Boolean(mediaStream) ||
              Boolean(rawData) ||
              Boolean(frameDataUrl) ||
              Boolean(streamUrl)
            }
            onSelect={handleTopicSelect}
          />

          {/* Camera Selector (for discovered cameras - secondary) */}
          {cameras.length > 0 && (
            <CameraSelector
              cameras={cameras}
              selectedId={activeCameraId}
              onSelect={handleSelectCamera}
            />
          )}
        </div>

        {activeCameraId && (
          <ModeToggle
            mode={modePreference}
            activeMode={activeMode}
            onModeChange={handleModeChange}
            isFallback={isFallback}
            onRetry={handleRetryWebRTC}
          />
        )}
      </div>

      {/* Video area - lower z-index than header for dropdown visibility */}
      <div className="flex-1 p-2 min-h-0 relative z-10">
        {activeCameraId ? (
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
          <div className="h-full flex items-center justify-center">
            <span className="text-[10px] text-[#555555] uppercase tracking-wider">
              Select a camera
            </span>
          </div>
        )}
      </div>

      {/* Status bar */}
      {activeCameraId && (
        <StatusBar
          status={status}
          fps={fps}
          latency={latency}
          activeMode={activeMode}
          retryCount={retryCount}
          error={error}
        />
      )}
    </div>
  )
}

export default CameraModule
