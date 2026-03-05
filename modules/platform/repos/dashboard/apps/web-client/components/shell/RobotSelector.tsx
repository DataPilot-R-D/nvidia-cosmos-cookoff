/**
 * RobotSelector — dropdown in TopBar for selecting active robot.
 * Shows online/offline status dots.
 */
'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useRobotStore } from '@/lib/stores/robot-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import type { RobotEntity } from '@workspace/shared-types'

const STATUS_COLORS: Record<string, string> = {
  online: 'bg-green-400',
  patrol: 'bg-blue-400',
  idle: 'bg-yellow-400',
  alert: 'bg-orange-400',
  offline: 'bg-red-400',
  error: 'bg-red-500',
}

export function RobotSelector() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const robotsMap = useRobotStore((s) => s.robots)
  const robots = useMemo(() => Array.from(robotsMap.values()), [robotsMap])
  const activeRobotId = useRobotStore((s) => s.activeRobotId)
  const setActiveRobot = useRobotStore((s) => s.setActiveRobot)
  const setRobot = useRobotStore((s) => s.setRobot)
  const socket = useWebSocketStore((s) => s.socket)

  // Fetch robot list on mount
  useEffect(() => {
    if (!socket) return

    socket.emit('robots:list', {}, (res: { robots?: RobotEntity[] }) => {
      if (res?.robots) {
        for (const r of res.robots) setRobot(r)
        // Auto-select first if none active
        if (!activeRobotId && res.robots.length > 0) {
          setActiveRobot(res.robots[0].id)
        }
      }
    })

    const handleStatus = (robot: RobotEntity) => setRobot(robot)
    socket.on('robot:status', handleStatus)
    return () => {
      socket.off('robot:status', handleStatus)
    }
  }, [socket, setRobot, activeRobotId, setActiveRobot])

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const activeRobot = robots.find((r) => r.id === activeRobotId)

  const handleSelect = useCallback(
    (id: string) => {
      setActiveRobot(id)
      setOpen(false)
    },
    [setActiveRobot]
  )

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/10 transition-colors text-xs"
        data-testid="robot-selector"
      >
        <div
          className={`w-2 h-2 rounded-full ${STATUS_COLORS[activeRobot?.status ?? 'offline']}`}
        />
        <span className="text-white/70 max-w-[100px] truncate">
          {activeRobot?.name ?? activeRobotId ?? 'No Robot'}
        </span>
        <svg className="w-3 h-3 text-white/30" viewBox="0 0 12 12" fill="currentColor">
          <path d="M3 5l3 3 3-3H3z" />
        </svg>
      </button>

      {open && robots.length > 0 && (
        <div className="absolute left-0 top-full mt-1 w-48 bg-[#111] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
          {robots.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r.id)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-white/5 transition-colors ${
                r.id === activeRobotId ? 'bg-cyan-500/10' : ''
              }`}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_COLORS[r.status]}`} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-white truncate">{r.name || r.id}</div>
                <div className="text-[9px] text-white/30 capitalize">{r.status}</div>
              </div>
              {r.id === activeRobotId && <span className="text-cyan-400 text-[9px]">●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
