/**
 * Trail Point Node Component
 *
 * Represents a point in the robot's path history.
 */

'use client'

import type { TrailPointData } from '../types'

interface TrailPointNodeProps {
  data: TrailPointData
}

export function TrailPointNode({ data }: TrailPointNodeProps) {
  // Older points are more transparent
  const opacity = Math.max(0.1, 1 - data.age * 0.01)
  return <div className="w-2 h-2 rounded-full bg-[#00ffff]" style={{ opacity }} />
}
