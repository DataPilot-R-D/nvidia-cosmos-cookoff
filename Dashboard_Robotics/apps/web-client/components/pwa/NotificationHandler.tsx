'use client'

import { useEffect } from 'react'
import { useWebSocketStore } from '@/lib/stores/websocket-store'

export type AlertSeverity = 'info' | 'warning' | 'critical'

interface RobotAlert {
  severity: AlertSeverity
  title: string
  body: string
}

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨',
}

/**
 * Listens for robot alert events from the WebSocket server
 * and shows browser notifications (if permission granted).
 */
export function NotificationHandler() {
  const socket = useWebSocketStore((s) => s.socket)

  useEffect(() => {
    if (!socket) return

    const handleAlert = (data: RobotAlert) => {
      if (typeof window === 'undefined') return
      if (!('Notification' in window)) return
      if (Notification.permission !== 'granted') return

      const badge = SEVERITY_BADGE[data.severity] || ''
      new Notification(`${badge} ${data.title}`, {
        body: data.body,
        tag: `robot-alert-${Date.now()}`,
        requireInteraction: data.severity === 'critical',
      })
    }

    socket.on('robot_alert', handleAlert)
    return () => {
      socket.off('robot_alert', handleAlert)
    }
  }, [socket])

  return null
}
