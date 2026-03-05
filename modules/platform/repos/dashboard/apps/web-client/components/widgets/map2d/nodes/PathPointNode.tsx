/**
 * Path Point Node Component
 *
 * Represents a point in the navigation path.
 */

'use client'

import type { PathPointData } from '../types'

interface PathPointNodeProps {
  data: PathPointData
}

export function PathPointNode({ data }: PathPointNodeProps) {
  if (data.isLast) {
    // Goal point - larger and different color
    return (
      <div className="w-3 h-3 rounded-full bg-[#ff00ff] border-2 border-[#ff66ff] shadow-lg shadow-[#ff00ff]/50" />
    )
  }
  if (data.isFirst) {
    // Start point
    return <div className="w-2 h-2 rounded-full bg-[#00ff00] border border-[#66ff66]" />
  }
  // Intermediate points
  return <div className="w-1.5 h-1.5 rounded-full bg-[#ffff00] opacity-70" />
}
