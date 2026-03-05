/**
 * MachineUsageModule Component
 *
 * Server resource monitoring widget.
 * Displays CPU, Memory, GPU usage with threshold coloring.
 *
 * @see plan.md Checkpoint 3: UI Integration
 */

'use client'

import { useMemo } from 'react'
import { useMachineStatsStore } from '@/lib/stores/machine-stats-store'
import { formatBytes, getUsageThreshold } from '@workspace/shared-types'
import type { ModuleProps } from './ModuleRegistry'

// =============================================================================
// Constants
// =============================================================================

const THRESHOLD_COLORS = {
  normal: '#00ffff', // Cyan
  warning: '#ffaa00', // Amber
  danger: '#ff4444', // Red
} as const

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Usage bar with threshold coloring
 */
function UsageBar({
  label,
  usage,
  detail,
  secondaryDetail,
}: {
  label: string
  usage: number
  detail: string
  secondaryDetail?: string
}) {
  const threshold = getUsageThreshold(usage)
  const color = THRESHOLD_COLORS[threshold]

  return (
    <div className="flex flex-col gap-1">
      {/* Label Row */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#666666] uppercase tracking-wider font-medium">
          {label}
        </span>
        <span className="text-xs font-mono font-bold" style={{ color }}>
          {usage.toFixed(1)}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-[#1a1a1a] rounded-full overflow-hidden">
        <div
          data-testid={`usage-bar-${label.toLowerCase()}`}
          className="h-full transition-all duration-300 rounded-full"
          style={{
            width: `${Math.min(usage, 100)}%`,
            backgroundColor: color,
          }}
        />
      </div>

      {/* Details Row */}
      <div className="flex items-center justify-between text-[9px] text-[#555555] font-mono">
        <span>{detail}</span>
        {secondaryDetail && <span>{secondaryDetail}</span>}
      </div>
    </div>
  )
}

/**
 * Stat row for simple key-value display
 */
function StatRow({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-[#1a1a1a] last:border-0">
      <span className="text-[9px] text-[#555555] uppercase tracking-wider">
        {icon && <span className="mr-1">{icon}</span>}
        {label}
      </span>
      <span className="text-[10px] text-[#888888] font-mono">{value}</span>
    </div>
  )
}

/**
 * Connection status indicator
 */
function ConnectionStatus({ isReceiving }: { isReceiving: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-1.5 h-1.5 rounded-full ${isReceiving ? 'bg-[#00ff00] animate-pulse' : 'bg-[#666666]'}`}
      />
      <span className="text-[9px] text-[#555555] uppercase tracking-wider">
        {isReceiving ? 'LIVE' : 'OFFLINE'}
      </span>
    </div>
  )
}

/**
 * Server ID badge
 */
function ServerBadge({ serverId }: { serverId: string }) {
  return (
    <div className="px-1.5 py-0.5 bg-[#1a1a1a] rounded border border-[#333333]">
      <span className="text-[9px] text-[#00ffff] font-mono uppercase">{serverId}</span>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function MachineUsageModule({ windowId }: ModuleProps) {
  const { currentStats, isReceiving } = useMachineStatsStore()

  // Memoized computed values
  const cpuDetail = useMemo(() => {
    if (!currentStats) return ''
    const { cpu } = currentStats.data
    return `${cpu.cores} cores${cpu.model ? ` • ${cpu.model}` : ''}`
  }, [currentStats])

  const memoryDetail = useMemo(() => {
    if (!currentStats) return ''
    const { memory } = currentStats.data
    return `${formatBytes(memory.used)} / ${formatBytes(memory.total)}`
  }, [currentStats])

  const gpuDetail = useMemo(() => {
    if (!currentStats?.data.gpu) return null
    const { gpu } = currentStats.data
    return {
      usage: gpu.usage,
      memory: `${formatBytes(gpu.memoryUsed)} / ${formatBytes(gpu.memoryTotal)}`,
      name: gpu.name ?? 'GPU',
      temp: gpu.temperature ? `${gpu.temperature}°C` : undefined,
    }
  }, [currentStats])

  const diskDetail = useMemo(() => {
    if (!currentStats?.data.disk) return null
    const { disk } = currentStats.data
    return {
      usage: disk.percent,
      detail: `${formatBytes(disk.used)} / ${formatBytes(disk.total)}`,
      mount: disk.mount,
    }
  }, [currentStats])

  // Empty state
  if (!currentStats) {
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center bg-[#0a0a0a] p-3"
        data-testid={`module-machine-usage-${windowId}`}
      >
        <div className="w-8 h-8 rounded-full border border-[#333333] flex items-center justify-center mb-2">
          <span className="text-[#444444] text-xs">⏳</span>
        </div>
        <span className="text-[10px] text-[#555555] uppercase tracking-wider block">
          Waiting for server stats...
        </span>
      </div>
    )
  }

  const { cpu, memory } = currentStats.data

  return (
    <div
      className="h-full w-full flex flex-col bg-[#0a0a0a] p-3 overflow-auto"
      data-testid={`module-machine-usage-${windowId}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#222222]">
        <ConnectionStatus isReceiving={isReceiving} />
        <ServerBadge serverId={currentStats.data.serverId} />
      </div>

      {/* Usage Bars */}
      <div className="flex flex-col gap-4">
        {/* CPU */}
        <UsageBar
          label="CPU"
          usage={cpu.usage}
          detail={cpuDetail}
          secondaryDetail={cpu.temperature ? `${cpu.temperature}°C` : undefined}
        />

        {/* Memory */}
        <UsageBar label="RAM" usage={memory.percent} detail={memoryDetail} />

        {/* GPU (if available) */}
        {gpuDetail && (
          <UsageBar
            label="GPU"
            usage={gpuDetail.usage}
            detail={gpuDetail.name}
            secondaryDetail={gpuDetail.temp}
          />
        )}

        {/* Disk (if available) */}
        {diskDetail && (
          <UsageBar
            label="Disk"
            usage={diskDetail.usage}
            detail={diskDetail.detail}
            secondaryDetail={diskDetail.mount}
          />
        )}
      </div>

      {/* Additional Stats */}
      <div className="mt-4 pt-3 border-t border-[#222222]">
        {/* Network (if available) */}
        {currentStats.data.network && (
          <>
            <StatRow
              label="Network In"
              value={formatBytes(currentStats.data.network.bytesIn)}
              icon="↓"
            />
            <StatRow
              label="Network Out"
              value={formatBytes(currentStats.data.network.bytesOut)}
              icon="↑"
            />
            {currentStats.data.network.latency !== undefined && (
              <StatRow
                label="Latency"
                value={`${currentStats.data.network.latency.toFixed(0)}ms`}
                icon="⏱"
              />
            )}
          </>
        )}

        {/* Swap (if available) */}
        {memory.swap && memory.swap.total > 0 && (
          <StatRow
            label="Swap"
            value={`${formatBytes(memory.swap.used)} / ${formatBytes(memory.swap.total)}`}
          />
        )}
      </div>

      {/* Timestamp */}
      <div className="mt-auto pt-2 text-[8px] text-[#444444] font-mono text-right">
        Updated: {new Date(currentStats.timestamp).toLocaleTimeString()}
      </div>
    </div>
  )
}

export default MachineUsageModule
