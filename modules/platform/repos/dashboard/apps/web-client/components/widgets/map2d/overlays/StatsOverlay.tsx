/**
 * Stats Overlay Component
 *
 * Displays map statistics and layer toggle buttons.
 */

'use client'

export interface StatsOverlayProps {
  robotCount: number
  slamNodes: number
  slamEdges: number
  trailPoints: number
  lidarPoints: number
  pathPoints: number
  hasGoal: boolean
  showTrail: boolean
  showLidar: boolean
  showPath: boolean
  showMap: boolean
  showGlobalCostmap: boolean
  showLocalCostmap: boolean
  onToggleTrail: () => void
  onToggleLidar: () => void
  onTogglePath: () => void
  onToggleMap: () => void
  onToggleGlobalCostmap: () => void
  onToggleLocalCostmap: () => void
}

export function StatsOverlay({
  robotCount,
  slamNodes,
  slamEdges,
  trailPoints,
  lidarPoints,
  pathPoints,
  hasGoal,
  showTrail,
  showLidar,
  showPath,
  showMap,
  showGlobalCostmap,
  showLocalCostmap,
  onToggleTrail,
  onToggleLidar,
  onTogglePath,
  onToggleMap,
  onToggleGlobalCostmap,
  onToggleLocalCostmap,
}: StatsOverlayProps) {
  return (
    <div className="absolute top-2 left-2 glass-dark rounded px-2 py-1.5 text-[10px] font-mono z-10">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[#666666]">MAP</span>
        <span className="text-[#00ffff]">{robotCount}</span>
        <span className="text-[#666666]">robots</span>

        {/* Map layer toggle */}
        <button
          onClick={onToggleMap}
          className={`flex items-center gap-1 px-1 rounded transition-colors ${
            showMap ? 'bg-white/20 text-white' : 'text-[#666666] hover:text-[#888888]'
          }`}
          title="OccupancyGrid map overlay"
        >
          <span className="text-[#333333]">|</span>
          <span>map</span>
        </button>

        {/* Global costmap toggle */}
        <button
          onClick={onToggleGlobalCostmap}
          className={`flex items-center gap-1 px-1 rounded transition-colors ${
            showGlobalCostmap
              ? 'bg-blue-500/20 text-blue-400'
              : 'text-[#666666] hover:text-[#888888]'
          }`}
          title="Global costmap overlay"
        >
          <span>global</span>
        </button>

        {/* Local costmap toggle */}
        <button
          onClick={onToggleLocalCostmap}
          className={`flex items-center gap-1 px-1 rounded transition-colors ${
            showLocalCostmap
              ? 'bg-orange-500/20 text-orange-400'
              : 'text-[#666666] hover:text-[#888888]'
          }`}
          title="Local costmap overlay"
        >
          <span>local</span>
        </button>

        {/* Trail toggle */}
        <button
          onClick={onToggleTrail}
          className={`flex items-center gap-1 px-1 rounded transition-colors ${
            showTrail ? 'bg-[#00ffff]/20 text-[#00ffff]' : 'text-[#666666] hover:text-[#888888]'
          }`}
        >
          <span className="text-[#333333]">|</span>
          <span>{trailPoints}</span>
          <span>trail</span>
        </button>

        {/* LiDAR toggle */}
        <button
          onClick={onToggleLidar}
          className={`flex items-center gap-1 px-1 rounded transition-colors ${
            showLidar ? 'bg-[#00ff00]/20 text-[#00ff00]' : 'text-[#666666] hover:text-[#888888]'
          }`}
        >
          <span className="text-[#333333]">|</span>
          <span>{lidarPoints}</span>
          <span>lidar</span>
        </button>

        {/* Path toggle */}
        <button
          onClick={onTogglePath}
          className={`flex items-center gap-1 px-1 rounded transition-colors ${
            showPath ? 'bg-[#ff00ff]/20 text-[#ff00ff]' : 'text-[#666666] hover:text-[#888888]'
          }`}
        >
          <span className="text-[#333333]">|</span>
          <span>{pathPoints}</span>
          <span>path</span>
          {hasGoal && <span className="w-1.5 h-1.5 rounded-full bg-[#ff00ff] ml-1" />}
        </button>

        {/* SLAM stats (if available) */}
        {(slamNodes > 0 || slamEdges > 0) && (
          <>
            <span className="text-[#333333]">|</span>
            <span className="text-[#ff6600]">{slamNodes}</span>
            <span className="text-[#666666]">slam</span>
          </>
        )}
      </div>
    </div>
  )
}
