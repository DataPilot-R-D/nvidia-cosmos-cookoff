/**
 * Navigation Status Panel Component
 *
 * Shows current navigation goal status and progress.
 */

'use client'

import { usePathStore } from '@/lib/stores/path-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'

interface StatusConfig {
  color: string
  label: string
  icon: string
}

const statusConfig: Record<string, StatusConfig> = {
  pending: { color: 'text-yellow-400', label: 'Oczekiwanie...', icon: '?' },
  navigating: { color: 'text-cyan-400', label: 'Nawigacja...', icon: '>' },
  reached: { color: 'text-green-400', label: 'Cel osiagniety!', icon: 'V' },
  failed: { color: 'text-red-400', label: 'Blad nawigacji', icon: 'X' },
  canceled: { color: 'text-gray-400', label: 'Anulowano', icon: 'O' },
}

export function NavigationStatusPanel() {
  const goalPose = usePathStore((state) => state.goalPose)
  const navigationProgress = usePathStore((state) => state.navigationProgress)
  const cancelNavigation = useWebSocketStore((state) => state.cancelNavigation)

  if (!goalPose) return null

  const config = statusConfig[goalPose.status] || statusConfig.pending
  const isActive = goalPose.status === 'navigating' || goalPose.status === 'pending'

  // Calculate progress percentage
  const progressPercent =
    navigationProgress?.distanceTotal && navigationProgress?.distanceRemaining !== null
      ? Math.max(
          0,
          100 - (navigationProgress.distanceRemaining / navigationProgress.distanceTotal) * 100
        )
      : null

  return (
    <div className="absolute bottom-4 left-4 z-20 bg-[#1a1a1a]/95 rounded-lg p-3 min-w-[200px] border border-[#333333] shadow-lg">
      {/* Status header */}
      <div className={`flex items-center gap-2 mb-2 ${config.color}`}>
        <span className="text-lg">{config.icon}</span>
        <span className="font-mono text-sm font-medium">{config.label}</span>
      </div>

      {/* Progress bar */}
      {isActive && progressPercent !== null && (
        <div className="mb-2">
          <div className="w-full h-2 bg-[#333333] rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="text-[10px] text-[#888888] mt-1 font-mono">
            {navigationProgress?.distanceRemaining?.toFixed(1)}m pozostalo
          </div>
        </div>
      )}

      {/* Recovery indicator */}
      {navigationProgress && navigationProgress.numberOfRecoveries > 0 && (
        <div className="text-yellow-400 text-[10px] mb-2 font-mono">
          ! Recoveries: {navigationProgress.numberOfRecoveries}
        </div>
      )}

      {/* Goal coordinates */}
      <div className="text-[10px] text-[#666666] font-mono mb-2">
        Cel: ({goalPose.x.toFixed(2)}, {goalPose.y.toFixed(2)})
      </div>

      {/* Cancel button */}
      {isActive && (
        <button
          onClick={() => cancelNavigation()}
          className="w-full px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-medium rounded transition-colors"
        >
          Anuluj nawigacje
        </button>
      )}
    </div>
  )
}
