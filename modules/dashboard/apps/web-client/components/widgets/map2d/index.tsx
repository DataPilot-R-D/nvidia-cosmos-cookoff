/**
 * Map2dModule Component
 *
 * 2D floor plan visualization using React Flow.
 * Shows robots as interactive nodes with real-time position updates.
 * Includes SLAM graph visualization (nodes and edges from slam_toolbox).
 *
 * @see research-summary.md Section 1.2: React Flow
 */

'use client'

import { useCallback, useMemo, useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeTypes,
  type Viewport,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useRobotStore } from '@/lib/stores/robot-store'
import { useMapStore } from '@/lib/stores/map-store'
import { usePanelRoutingStore } from '@/lib/stores/panel-routing-store'
import { usePathStore } from '@/lib/stores/path-store'
import { sendGoalPoseQueued } from '@/lib/stores/websocket-store'
import { useCostmapStore } from '@/lib/stores/costmap-store'
import type { ModuleProps } from '../ModuleRegistry'

// Internal components
// NOTE: LidarPointNode, TrailPointNode, PathPointNode, GoalMarkerNode no longer used
// These are now rendered via VisualizationLayer (Canvas-based) for 1000x+ performance
import { RobotNode, WaypointNode, SlamNodeComponent } from './nodes'
import { StatsOverlay, NavigationStatusPanel, MapLibraryPanel } from './overlays'
import { OccupancyGridCanvas } from './OccupancyGridCanvas'
import { VisualizationLayer, type LidarCanvasPoint } from './VisualizationLayer'
import { GoalClickHandler } from './GoalClickHandler'
import { usePermission } from '@/lib/hooks/use-permission'
import { getStatusColor, robotToNode } from './helpers'
import {
  type SlamGraphData,
  type LidarData,
  type LidarPoint,
  type TrailPoint,
  type RobotNodeData,
  type WaypointNodeData,
  MAX_TRAIL_POINTS,
  MAP_SCALE,
} from './types'

// =============================================================================
// Node Types Registration
// =============================================================================

// Node types for React Flow
// NOTE: trail, lidar, pathPoint, goalMarker removed - now rendered via VisualizationLayer (Canvas)
const nodeTypes: NodeTypes = {
  robot: RobotNode,
  waypoint: WaypointNode,
  slam: SlamNodeComponent,
}

// =============================================================================
// Main Module Component
// =============================================================================

export function Map2dModule({ windowId }: ModuleProps) {
  const canSetGoal = usePermission('map:set-goal')
  const robots = useRobotStore((state) => state.robots)
  const selectedRobotId = useMapStore((state) => state.selectedRobotId)
  const selectRobot = useMapStore((state) => state.selectRobot)
  const showGrid = useMapStore((state) => state.showGrid)

  // Path and goal state from store
  const paths = usePathStore((state) => state.paths)
  const goalPose = usePathStore((state) => state.goalPose)
  const setGoalPose = usePathStore((state) => state.setGoalPose)

  // Goal pose — uses queued wrapper for offline support
  const sendGoalPose = sendGoalPoseQueued

  // SLAM graph state
  const [slamData, setSlamData] = useState<SlamGraphData | null>(null)

  // Robot trail state (history of positions)
  const [robotTrails, setRobotTrails] = useState<Map<string, TrailPoint[]>>(new Map())

  // LiDAR points state
  const [lidarPoints, setLidarPoints] = useState<LidarPoint[]>([])

  // Toggle states for visualization layers
  const [showTrail, setShowTrail] = useState(true)
  const [showLidar, setShowLidar] = useState(true)
  const [showPath, setShowPath] = useState(true)

  // Map layer toggles
  const [showMap, setShowMap] = useState(true)
  const [showGlobalCostmap, setShowGlobalCostmap] = useState(false)
  const [showLocalCostmap, setShowLocalCostmap] = useState(false)

  // Costmap data from store
  const mainMapData = useCostmapStore((state) => state.selectMainMap())
  const globalCostmapData = useCostmapStore((state) => state.grids.get('/global_costmap/costmap'))
  const localCostmapData = useCostmapStore((state) => state.grids.get('/local_costmap/costmap'))

  // Waypoint state from store
  const waypoints = usePathStore((state) => state.waypoints)
  const isWaypointMode = usePathStore((state) => state.isWaypointMode)
  const setWaypointMode = usePathStore((state) => state.setWaypointMode)
  const addWaypoint = usePathStore((state) => state.addWaypoint)
  const removeWaypoint = usePathStore((state) => state.removeWaypoint)
  const clearWaypoints = usePathStore((state) => state.clearWaypoints)

  // Goal setting mode
  const [goalSettingMode, setGoalSettingMode] = useState(false)
  const [pendingGoalPosition, setPendingGoalPosition] = useState<{ x: number; y: number } | null>(
    null
  )

  // Map library panel visibility
  const [showMapLibrary, setShowMapLibrary] = useState(false)

  // Viewport state for OccupancyGridCanvas (updated via onMove callback)
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })

  // Get active topic from panel routing (dynamic routing)
  const activeTopic = usePanelRoutingStore((state) => state.panels['map-2d'])

  // Listen for SLAM graph updates
  useEffect(() => {
    const handleSlamUpdate = (event: CustomEvent<SlamGraphData>) => {
      setSlamData(event.detail)
    }

    window.addEventListener('slam_graph_update', handleSlamUpdate as EventListener)
    return () => {
      window.removeEventListener('slam_graph_update', handleSlamUpdate as EventListener)
    }
  }, [])

  // Track robot positions for trail
  useEffect(() => {
    if (!showTrail) return

    setRobotTrails((prevTrails) => {
      const newTrails = new Map(prevTrails)
      const now = Date.now()

      robots.forEach((robot, robotId) => {
        const trail = newTrails.get(robotId) || []
        const lastPoint = trail[trail.length - 1]

        // Only add new point if robot moved significantly (> 0.1m)
        const moved =
          !lastPoint ||
          Math.abs(robot.position.x - lastPoint.x) > 0.1 ||
          Math.abs(robot.position.y - lastPoint.y) > 0.1

        if (moved) {
          const newTrail = [
            ...trail,
            { x: robot.position.x, y: robot.position.y, timestamp: now },
          ].slice(-MAX_TRAIL_POINTS)
          newTrails.set(robotId, newTrail)
        }
      })

      return newTrails
    })
  }, [robots, showTrail])

  // Listen for LiDAR scan updates
  // NOTE: Canvas rendering supports 50,000+ points at 60fps - no sampling needed
  useEffect(() => {
    if (!showLidar) return

    const handleLidarUpdate = (event: CustomEvent<LidarData>) => {
      const data = event.detail
      if (data && data.points) {
        // Pass all points directly - Canvas can handle 50k+ at 60fps
        setLidarPoints(data.points)
      }
    }

    window.addEventListener('lidar_scan_update', handleLidarUpdate as EventListener)
    return () => {
      window.removeEventListener('lidar_scan_update', handleLidarUpdate as EventListener)
    }
  }, [showLidar])

  // React to dynamic topic routing from TopicInspector
  useEffect(() => {
    if (activeTopic?.topicName) {
      const topicParts = activeTopic.topicName.split('/')
      if (topicParts.length > 2 && topicParts[1]) {
        const robotId = topicParts[1]
        if (robots.has(robotId)) {
          selectRobot(robotId)
        }
      }
    }
  }, [activeTopic, robots, selectRobot])

  // Convert robots to nodes
  const robotNodes = useMemo(() => {
    const nodes: Node<RobotNodeData>[] = []
    robots.forEach((robot) => {
      nodes.push(robotToNode(robot, robot.id === selectedRobotId))
    })
    return nodes
  }, [robots, selectedRobotId])

  // Convert SLAM graph to React Flow nodes and edges
  const { slamNodes, slamEdges } = useMemo(() => {
    if (!slamData || !slamData.nodes) {
      return { slamNodes: [], slamEdges: [] }
    }

    const nodes: Node[] = slamData.nodes.map((node) => ({
      id: `slam-${node.id}`,
      type: 'slam',
      position: { x: node.x * MAP_SCALE, y: -node.y * MAP_SCALE },
      data: { nodeId: node.id },
      draggable: false,
      selectable: false,
    }))

    const edges: Edge[] = []
    if (slamData.edges) {
      slamData.edges.forEach((edge, edgeIdx) => {
        if (edge.points && edge.points.length >= 2) {
          for (let i = 0; i < edge.points.length - 1; i++) {
            edges.push({
              id: `slam-edge-${edgeIdx}-${i}`,
              source: `slam-point-${edgeIdx}-${i}`,
              target: `slam-point-${edgeIdx}-${i + 1}`,
              type: 'straight',
              style: { stroke: '#ff6600', strokeWidth: 1, opacity: 0.5 },
            })
          }
        }
      })
    }

    for (let i = 1; i < nodes.length; i++) {
      edges.push({
        id: `slam-node-edge-${i}`,
        source: nodes[i - 1].id,
        target: nodes[i].id,
        type: 'straight',
        style: { stroke: '#ff6600', strokeWidth: 1, opacity: 0.3 },
      })
    }

    return { slamNodes: nodes, slamEdges: edges }
  }, [slamData])

  // ==========================================================================
  // CANVAS-BASED RENDERING (High Performance)
  // Trail points are now rendered via PathOverlayCanvas instead of DOM nodes
  // ==========================================================================

  // Flatten all robot trails into a single array for canvas rendering
  const flattenedTrailPoints = useMemo(() => {
    if (!showTrail) return []
    const allPoints: TrailPoint[] = []
    robotTrails.forEach((trail) => {
      allPoints.push(...trail)
    })
    // Sort by timestamp to ensure proper line connectivity
    return allPoints.sort((a, b) => a.timestamp - b.timestamp)
  }, [robotTrails, showTrail])

  // Extract path points for canvas rendering
  const flattenedPathPoints = useMemo(() => {
    if (!showPath || paths.size === 0) return []
    const pathData = paths.values().next().value
    return pathData?.points || []
  }, [paths, showPath])

  // ==========================================================================
  // LiDAR Canvas Rendering (High Performance - supports 50k+ points at 60fps)
  // Transforms LiDAR points from robot frame to map frame for Canvas rendering
  // ==========================================================================
  const lidarCanvasPoints = useMemo((): LidarCanvasPoint[] => {
    if (!showLidar || lidarPoints.length === 0) return []

    // Get robot position for frame transformation
    const selectedRobot = selectedRobotId
      ? robots.get(selectedRobotId)
      : robots.values().next().value
    const robotX = selectedRobot?.position.x || 0
    const robotY = selectedRobot?.position.y || 0

    // Transform from robot frame to map frame
    // Note: For full SLAM scan support, we now accept ALL points (no MAX_LIDAR_DISPLAY sampling)
    return lidarPoints.map((point) => ({
      x: robotX + point.x,
      y: robotY + point.y,
      intensity: point.intensity,
    }))
  }, [lidarPoints, showLidar, robots, selectedRobotId])

  // DEPRECATED: Trail nodes/edges now rendered via Canvas
  // Kept for reference but not used in allNodes
  /*
  const { trailNodes, trailEdges } = useMemo(() => {
    if (!showTrail) return { trailNodes: [], trailEdges: [] }

    const now = Date.now()
    const nodes: Node[] = []
    const edges: Edge[] = []

    robotTrails.forEach((trail, robotId) => {
      trail.forEach((point, idx) => {
        const age = (now - point.timestamp) / 1000
        nodes.push({
          id: `trail-${robotId}-${idx}`,
          type: 'trail',
          position: { x: point.x * MAP_SCALE, y: -point.y * MAP_SCALE },
          data: { age },
          draggable: false,
          selectable: false,
        })

        if (idx > 0) {
          edges.push({
            id: `trail-edge-${robotId}-${idx}`,
            source: `trail-${robotId}-${idx - 1}`,
            target: `trail-${robotId}-${idx}`,
            type: 'straight',
            style: { stroke: '#00ffff', strokeWidth: 1, opacity: Math.max(0.1, 1 - age * 0.01) },
          })
        }
      })
    })

    return { trailNodes: nodes, trailEdges: edges }
  }, [robotTrails, showTrail])
  */

  // ==========================================================================
  // DEPRECATED: LiDAR nodes now rendered via Canvas for 1000x+ performance gain
  // Canvas rendering supports 50,000+ points at 60fps vs DOM bottleneck at ~1000
  // See VisualizationLayer.tsx for high-performance LiDAR rendering
  // ==========================================================================
  /*
  const lidarNodes = useMemo(() => {
    if (!showLidar || lidarPoints.length === 0) return []

    const selectedRobot = selectedRobotId ? robots.get(selectedRobotId) : robots.values().next().value
    const robotX = selectedRobot?.position.x || 0
    const robotY = selectedRobot?.position.y || 0

    return lidarPoints.map((point, idx) => ({
      id: `lidar-${idx}`,
      type: 'lidar',
      position: { x: (robotX + point.x) * MAP_SCALE, y: -(robotY + point.y) * MAP_SCALE },
      data: {},
      draggable: false,
      selectable: false,
    }))
  }, [lidarPoints, showLidar, robots, selectedRobotId])
  */

  // ==========================================================================
  // DEPRECATED: Path nodes/edges now rendered via Canvas for 10-50x perf gain
  // See PathOverlayCanvas.tsx for high-performance vector rendering
  // ==========================================================================
  /*
  const { pathNodes, pathEdges } = useMemo(() => {
    if (!showPath || paths.size === 0) return { pathNodes: [], pathEdges: [] }

    const nodes: Node[] = []
    const edges: Edge[] = []

    const pathData = paths.values().next().value
    if (!pathData || !pathData.points || pathData.points.length === 0) {
      return { pathNodes: [], pathEdges: [] }
    }

    const points = pathData.points
    points.forEach((point: PathPoint, idx: number) => {
      nodes.push({
        id: `path-${idx}`,
        type: 'pathPoint',
        position: { x: point.x * MAP_SCALE, y: -point.y * MAP_SCALE },
        data: { isFirst: idx === 0, isLast: idx === points.length - 1 },
        draggable: false,
        selectable: false,
      })

      if (idx < points.length - 1) {
        edges.push({
          id: `path-edge-${idx}`,
          source: `path-${idx}`,
          target: `path-${idx + 1}`,
          type: 'straight',
          style: { stroke: '#ffff00', strokeWidth: 2, opacity: 0.7 },
        })
      }
    })

    return { pathNodes: nodes, pathEdges: edges }
  }, [paths, showPath])
  */

  // DEPRECATED: Goal marker now rendered via Canvas with pulsating animation
  /*
  const goalNode = useMemo(() => {
    if (!showPath || !goalPose) return null

    return {
      id: 'goal-marker',
      type: 'goalMarker',
      position: { x: goalPose.x * MAP_SCALE, y: -goalPose.y * MAP_SCALE },
      data: { status: goalPose.status, theta: goalPose.theta },
      draggable: false,
      selectable: false,
    }
  }, [goalPose, showPath])
  */

  // Convert waypoints to React Flow nodes
  const waypointNodes = useMemo(() => {
    if (!isWaypointMode || waypoints.length === 0) return []

    return waypoints.map((wp, idx) => ({
      id: `waypoint-${wp.id}`,
      type: 'waypoint',
      position: { x: wp.x * MAP_SCALE, y: -wp.y * MAP_SCALE },
      data: { index: idx, status: wp.status, id: wp.id } as WaypointNodeData,
      draggable: false,
      selectable: false,
    }))
  }, [waypoints, isWaypointMode])

  // Combine all nodes
  // NOTE: trailNodes, pathNodes, goalNode, lidarNodes removed - now rendered via VisualizationLayer
  const allNodes = useMemo(
    () => [
      // ...lidarNodes,  // DEPRECATED: Canvas-rendered (supports 50k+ points)
      ...slamNodes,
      // ...trailNodes,  // DEPRECATED: Canvas-rendered
      // ...pathNodes,   // DEPRECATED: Canvas-rendered
      ...waypointNodes,
      // ...(goalNode ? [goalNode] : []),  // DEPRECATED: Canvas-rendered
      ...robotNodes,
    ],
    [slamNodes, waypointNodes, robotNodes]
  )

  // Combine all edges
  // NOTE: trailEdges, pathEdges removed - now rendered via PathOverlayCanvas
  const allEdges = useMemo(
    () => [
      ...slamEdges,
      // ...trailEdges,  // DEPRECATED: Canvas-rendered
      // ...pathEdges,   // DEPRECATED: Canvas-rendered
    ],
    [slamEdges]
  )

  const [nodes, setNodes, onNodesChange] = useNodesState(allNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(allEdges)

  useEffect(() => {
    setNodes(allNodes)
  }, [allNodes, setNodes])

  useEffect(() => {
    setEdges(allEdges)
  }, [allEdges, setEdges])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'robot') {
        const robotId = node.id.replace('robot-', '')
        selectRobot(robotId === selectedRobotId ? null : robotId)
      }
    },
    [selectedRobotId, selectRobot]
  )

  const handleGoalPositionSelected = useCallback(
    (x: number, y: number) => {
      if (isWaypointMode) {
        addWaypoint({ x, y, theta: 0 })
      } else {
        setPendingGoalPosition({ x, y })
      }
    },
    [isWaypointMode, addWaypoint]
  )

  const handleSubmitGoal = useCallback(
    (theta: number) => {
      if (!pendingGoalPosition) return

      const goal = {
        x: pendingGoalPosition.x,
        y: pendingGoalPosition.y,
        theta,
        frameId: 'map',
      }

      if (sendGoalPose) {
        sendGoalPose(goal)
      }

      setGoalPose(goal)
      setPendingGoalPosition(null)
      setGoalSettingMode(false)
    },
    [pendingGoalPosition, sendGoalPose, setGoalPose]
  )

  const handleCancelGoal = useCallback(() => {
    setPendingGoalPosition(null)
    setGoalSettingMode(false)
  }, [])

  // Handle viewport changes (for OccupancyGridCanvas sync)
  const handleMove = useCallback((_: unknown, newViewport: Viewport) => {
    setViewport(newViewport)
  }, [])

  // Get initial viewport after fitView completes
  const handleInit = useCallback((reactFlowInstance: { getViewport: () => Viewport }) => {
    // Small delay to ensure fitView has completed
    setTimeout(() => {
      setViewport(reactFlowInstance.getViewport())
    }, 100)
  }, [])

  return (
    <div
      className="h-full w-full relative bg-[#0a0a0a] overflow-hidden"
      data-testid={`module-map-2d-${windowId}`}
    >
      {/* OccupancyGrid Overlays - OUTSIDE ReactFlow to avoid viewport DOM transforms */}
      {/* Canvas always fills 100% of container; zoom/pan applied via canvas ctx transforms */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        <OccupancyGridCanvas
          gridData={mainMapData}
          visible={showMap}
          opacity={0.6}
          colorScheme="map"
          viewport={viewport}
        />
        <OccupancyGridCanvas
          gridData={globalCostmapData}
          visible={showGlobalCostmap}
          opacity={0.4}
          colorScheme="costmap"
          viewport={viewport}
        />
        <OccupancyGridCanvas
          gridData={localCostmapData}
          visible={showLocalCostmap}
          opacity={0.6}
          colorScheme="costmap"
          viewport={viewport}
        />
      </div>

      {/* VisualizationLayer - High-performance Canvas rendering for paths, trails, goals, LiDAR */}
      {/* Supports 50,000+ LiDAR points at 60fps (vs DOM bottleneck at ~1000) */}
      {/* Renders above OccupancyGrid (z-index: 2), below ReactFlow nodes */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
        <VisualizationLayer
          viewport={viewport}
          pathPoints={flattenedPathPoints}
          trailPoints={flattenedTrailPoints}
          goalPose={goalPose}
          pendingGoalPosition={pendingGoalPosition}
          lidarPoints={lidarCanvasPoints}
          visible={showPath || showTrail}
          showLidar={showLidar}
        />
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onMove={handleMove}
        onInit={handleInit}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        style={{ background: '#0a0a0a' }}
      >
        {/* Goal Click Handler */}
        <GoalClickHandler
          enabled={goalSettingMode}
          onPositionSelected={handleGoalPositionSelected}
        />

        {/* Background */}
        {showGrid && (
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#333333" />
        )}

        {/* Controls */}
        <Controls
          className="!bg-[#1a1a1a] !border-[#333333] !shadow-none"
          showInteractive={false}
        />

        {/* MiniMap */}
        <MiniMap
          className="!bg-[#1a1a1a] !border-[#333333]"
          nodeColor={(node) => {
            if (node.type === 'robot') {
              const robot = (node.data as RobotNodeData).robot
              return getStatusColor(robot.status)
            }
            return '#666666'
          }}
          maskColor="#0a0a0a99"
        />
      </ReactFlow>

      {/* Overlays */}
      <StatsOverlay
        robotCount={robots.size}
        slamNodes={slamData?.nodes?.length || 0}
        slamEdges={slamData?.edges?.length || 0}
        trailPoints={Array.from(robotTrails.values()).reduce((sum, trail) => sum + trail.length, 0)}
        lidarPoints={lidarPoints.length}
        pathPoints={Array.from(paths.values()).reduce((sum, p) => sum + (p.points?.length || 0), 0)}
        hasGoal={!!goalPose}
        showTrail={showTrail}
        showLidar={showLidar}
        showPath={showPath}
        showMap={showMap}
        showGlobalCostmap={showGlobalCostmap}
        showLocalCostmap={showLocalCostmap}
        onToggleTrail={() => setShowTrail(!showTrail)}
        onToggleLidar={() => setShowLidar(!showLidar)}
        onTogglePath={() => setShowPath(!showPath)}
        onToggleMap={() => setShowMap(!showMap)}
        onToggleGlobalCostmap={() => setShowGlobalCostmap(!showGlobalCostmap)}
        onToggleLocalCostmap={() => setShowLocalCostmap(!showLocalCostmap)}
      />

      {/* Navigation Status Panel */}
      <NavigationStatusPanel />

      {/* Goal/Waypoint/Maps Setting Buttons - Premium minimal */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
        {canSetGoal && (
          <button
            onClick={() => {
              if (isWaypointMode) setWaypointMode(false)
              setGoalSettingMode(!goalSettingMode)
            }}
            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono tracking-wide transition-all ${
              goalSettingMode && !isWaypointMode
                ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                : 'bg-[#141414]/90 text-[#666666] hover:text-teal-400 hover:bg-[#1a1a1a] border border-transparent hover:border-teal-500/20'
            }`}
          >
            {goalSettingMode && !isWaypointMode ? 'Cancel' : 'Goal'}
          </button>
        )}

        <button
          onClick={() => {
            if (!isWaypointMode) {
              setWaypointMode(true)
              setGoalSettingMode(true)
            } else {
              setWaypointMode(false)
              setGoalSettingMode(false)
            }
          }}
          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono tracking-wide transition-all ${
            isWaypointMode
              ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30'
              : 'bg-[#141414]/90 text-[#666666] hover:text-violet-400 hover:bg-[#1a1a1a] border border-transparent hover:border-violet-500/20'
          }`}
        >
          {isWaypointMode ? 'Exit' : 'Patrol'}
        </button>

        <button
          onClick={() => setShowMapLibrary(!showMapLibrary)}
          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono tracking-wide transition-all ${
            showMapLibrary
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'bg-[#141414]/90 text-[#666666] hover:text-cyan-400 hover:bg-[#1a1a1a] border border-transparent hover:border-cyan-500/20'
          }`}
        >
          Maps
        </button>
      </div>

      {/* Map Library Panel */}
      {showMapLibrary && <MapLibraryPanel onClose={() => setShowMapLibrary(false)} />}

      {/* Waypoint Panel */}
      {isWaypointMode && (
        <div className="absolute top-14 right-2 z-10 bg-[#1a1a1a]/95 rounded-lg p-2 min-w-[160px] border border-[#333333]">
          <div className="text-[10px] text-purple-400 font-mono mb-2 uppercase">
            Waypoints ({waypoints.length})
          </div>

          {waypoints.length === 0 ? (
            <div className="text-[9px] text-[#666666] mb-2">Kliknij na mape aby dodac waypoint</div>
          ) : (
            <div className="space-y-1 mb-2 max-h-[150px] overflow-y-auto">
              {waypoints.map((wp, idx) => (
                <div
                  key={wp.id}
                  className="flex items-center justify-between text-[9px] font-mono bg-[#252525] rounded px-1.5 py-0.5"
                >
                  <span className="text-purple-400">{idx + 1}.</span>
                  <span className="text-[#888888]">
                    ({wp.x.toFixed(1)}, {wp.y.toFixed(1)})
                  </span>
                  <button
                    onClick={() => removeWaypoint(wp.id)}
                    className="text-red-400 hover:text-red-300 ml-1"
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-1">
            {waypoints.length > 0 && (
              <>
                <button
                  onClick={() => {
                    const firstWp = waypoints[0]
                    if (firstWp) {
                      const goal = {
                        x: firstWp.x,
                        y: firstWp.y,
                        theta: firstWp.theta,
                        frameId: 'map',
                      }
                      sendGoalPose?.(goal)
                      setGoalPose(goal)
                    }
                  }}
                  className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-[9px] rounded transition-colors"
                >
                  Start
                </button>
                <button
                  onClick={clearWaypoints}
                  className="px-2 py-1 bg-[#333333] hover:bg-[#444444] text-white text-[9px] rounded transition-colors"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Goal Direction Modal - Premium minimal design */}
      {pendingGoalPosition && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-20">
          <div className="bg-[#141414]/95 rounded-xl p-5 border border-[#2a2a2a] max-w-xs shadow-2xl">
            <div className="text-sm text-white/90 mb-2 font-medium">Set Direction</div>
            <div className="text-[10px] text-[#666666] mb-4 font-mono tracking-wide">
              ({pendingGoalPosition.x.toFixed(2)}, {pendingGoalPosition.y.toFixed(2)})
            </div>
            <div className="grid grid-cols-4 gap-1.5 mb-4">
              {[0, 90, 180, 270].map((deg) => (
                <button
                  key={deg}
                  onClick={() => handleSubmitGoal(deg * (Math.PI / 180))}
                  className="px-2 py-1.5 bg-[#1f1f1f] hover:bg-teal-500/20 text-[#888888] hover:text-teal-400 text-[10px] rounded-lg transition-all border border-transparent hover:border-teal-500/30"
                >
                  {deg}°
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleSubmitGoal(0)}
                className="flex-1 px-3 py-2 bg-teal-500/20 text-teal-400 text-xs rounded-lg hover:bg-teal-500/30 transition-all border border-teal-500/30 font-medium"
              >
                Navigate
              </button>
              <button
                onClick={handleCancelGoal}
                className="px-3 py-2 bg-[#1f1f1f] text-[#666666] text-xs rounded-lg hover:bg-[#252525] hover:text-[#888888] transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty State */}
      {robots.size === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <div className="text-[#333333] text-xs font-mono uppercase tracking-wider mb-1">
              2D Map View
            </div>
            <div className="text-[#555555] text-[10px]">No robots connected</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Map2dModule
