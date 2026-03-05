'use client'

import { useEffect } from 'react'
import { useWebSocketStore } from '@/lib/stores'
import { useOfflineQueueStore } from '@/lib/stores/offline-queue-store'

/**
 * Side-effect component:
 * 1. Hydrates the offline queue from IndexedDB on mount.
 * 2. Wires sender functions from the WebSocket store.
 * 3. Flushes the queue when connection becomes 'connected'.
 */
export function OfflineQueueController() {
  const wsStatus = useWebSocketStore((s) => s.status)
  const sendTeleopCommand = useWebSocketStore((s) => s.sendTeleopCommand)
  const sendGoalPose = useWebSocketStore((s) => s.sendGoalPose)

  const hydrate = useOfflineQueueStore((s) => s.hydrate)
  const flush = useOfflineQueueStore((s) => s.flush)
  const setSenders = useOfflineQueueStore((s) => s.setSenders)

  // Hydrate queue from IDB on mount
  useEffect(() => {
    hydrate()
  }, [hydrate])

  // Wire sender functions
  useEffect(() => {
    setSenders({
      teleop: (p) => sendTeleopCommand(p.linear as number, p.angular as number),
      goal_pose: (p) =>
        sendGoalPose({
          x: p.x as number,
          y: p.y as number,
          theta: p.theta as number,
          frameId: p.frameId as string | undefined,
        }),
    })
  }, [setSenders, sendTeleopCommand, sendGoalPose])

  // Flush queue on reconnect
  useEffect(() => {
    if (wsStatus === 'connected') {
      flush()
    }
  }, [wsStatus, flush])

  return null
}
