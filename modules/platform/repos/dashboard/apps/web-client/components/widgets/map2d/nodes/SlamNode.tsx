/**
 * SLAM Node Component
 *
 * Represents a pose in the SLAM graph.
 */

'use client'

import type { SlamNodeData } from '../types'

interface SlamNodeProps {
  data: SlamNodeData
}

export function SlamNodeComponent({ data }: SlamNodeProps) {
  return (
    <div
      className="w-3 h-3 rounded-full bg-[#ff6600] border border-[#ff9933] opacity-70"
      title={`SLAM Node ${data.nodeId}`}
    />
  )
}
