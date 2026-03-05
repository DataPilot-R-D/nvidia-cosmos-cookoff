/**
 * useNotificationListeners — subscribes to socket events and creates
 * notifications for trust, incident, and mission events.
 */

import { useEffect } from 'react'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import { useNotificationStore, playNotificationSound } from '@/lib/stores/notification-store'
import { useSettingsStore } from '@/lib/stores/settings-store'

export function useNotificationListeners(): void {
  const socket = useWebSocketStore((s) => s.socket)
  const add = useNotificationStore((s) => s.add)
  const soundEnabled = useSettingsStore((s) => s.notifications.soundEnabled)
  const incidentsEnabled = useSettingsStore((s) => s.notifications.incidents)
  const missionsEnabled = useSettingsStore((s) => s.notifications.missions)
  const trustEnabled = useSettingsStore((s) => s.notifications.trust)

  useEffect(() => {
    if (!socket) return

    // Trust: handover needed
    const handleTrustUpdate = (data: {
      robotId?: string
      handoverStatus?: string
      riskLevel?: string
    }) => {
      if (!trustEnabled) return
      if (data.riskLevel === 'critical' || data.riskLevel === 'high') {
        add(
          'warning',
          'Trust Alert',
          `Robot ${data.robotId?.slice(0, 12) ?? 'unknown'}: ${data.riskLevel} risk`,
          'trust'
        )
        if (soundEnabled) playNotificationSound('warning')
      }
      if (data.handoverStatus === 'emergency_stop') {
        add('error', 'Emergency Stop', `Robot ${data.robotId?.slice(0, 12) ?? 'unknown'}`, 'trust')
        if (soundEnabled) playNotificationSound('error')
      }
    }

    // Incident created
    const handleIncident = (data: { id?: string; title?: string; severity?: string }) => {
      if (!incidentsEnabled) return
      const level = data.severity === 'critical' ? 'error' : 'warning'
      add(level, 'New Incident', data.title ?? 'Incident reported', 'incident')
      if (soundEnabled) playNotificationSound(level)
    }

    // Mission completed/failed
    const handleMissionComplete = (data: { id?: string; name?: string }) => {
      if (!missionsEnabled) return
      add('success', 'Mission Complete', data.name ?? 'Mission finished', 'mission')
    }

    const handleMissionFailed = (data: { id?: string; name?: string; error?: string }) => {
      if (!missionsEnabled) return
      add('error', 'Mission Failed', data.name ?? 'Mission error', 'mission')
      if (soundEnabled) playNotificationSound('error')
    }

    socket.on('trust:updated', handleTrustUpdate)
    socket.on('incident:created', handleIncident)
    socket.on('mission:completed', handleMissionComplete)
    socket.on('mission:failed', handleMissionFailed)

    return () => {
      socket.off('trust:updated', handleTrustUpdate)
      socket.off('incident:created', handleIncident)
      socket.off('mission:completed', handleMissionComplete)
      socket.off('mission:failed', handleMissionFailed)
    }
  }, [socket, add, soundEnabled, incidentsEnabled, missionsEnabled, trustEnabled])
}
