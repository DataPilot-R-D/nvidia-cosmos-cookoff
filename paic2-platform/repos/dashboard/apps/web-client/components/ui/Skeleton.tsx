/**
 * Skeleton — shimmer loading placeholder.
 * Reusable across all modules for consistent loading states.
 */
'use client'

import React from 'react'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  className?: string
  /** Render as circle */
  circle?: boolean
  /** Number of lines to render */
  lines?: number
}

export function Skeleton({
  width = '100%',
  height = 16,
  className = '',
  circle = false,
  lines,
}: SkeletonProps) {
  if (lines) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="skeleton-shimmer rounded"
            style={{
              width: i === lines - 1 ? '60%' : '100%',
              height,
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={`skeleton-shimmer ${circle ? 'rounded-full' : 'rounded'} ${className}`}
      style={{
        width,
        height,
        ...(circle ? { borderRadius: '50%' } : {}),
      }}
    />
  )
}

/**
 * ModuleSkeleton — standard loading state for dashboard modules.
 */
export function ModuleSkeleton({ icon, label }: { icon?: string; label?: string }) {
  return (
    <div className="h-full flex flex-col p-3 gap-3 animate-pulse">
      {/* Header */}
      <div className="flex items-center gap-2">
        {icon && <span className="text-lg opacity-20">{icon}</span>}
        <Skeleton width={120} height={12} />
      </div>
      {/* Content */}
      <div className="flex-1 flex flex-col gap-2">
        <Skeleton height={24} />
        <Skeleton height={24} />
        <Skeleton width="75%" height={24} />
      </div>
      {label && <div className="text-center text-[10px] text-white/20">{label}</div>}
    </div>
  )
}

/**
 * MapSkeleton — loading state for map modules.
 */
export function MapSkeleton() {
  return (
    <div className="h-full flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        <div className="text-2xl opacity-20 mb-2">🗺️</div>
        <div className="text-[10px] text-white/20 animate-pulse">Loading map...</div>
      </div>
    </div>
  )
}

/**
 * CameraSkeleton — loading state for camera modules.
 */
export function CameraSkeleton() {
  return (
    <div className="h-full flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-center">
        <div className="text-2xl opacity-20 mb-2">📹</div>
        <div className="text-[10px] text-white/20 animate-pulse">Connecting camera...</div>
      </div>
    </div>
  )
}
