'use client'

import { useCallback } from 'react'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import { useCommandStore } from '@/lib/stores/command-store'
import { usePermission } from '@/lib/hooks/use-permission'

/**
 * Full-screen emergency stop button for mobile/tablet field operators.
 * Large, red, always accessible. NEVER queued — requires live connection.
 */
export function EmergencyStopButton() {
  const canEstop = usePermission('estop')
  const wsStatus = useWebSocketStore((s) => s.status)
  const sendTeleopCommand = useWebSocketStore((s) => s.sendTeleopCommand)
  const setEmergencyStop = useCommandStore((s) => s.setEmergencyStop)

  const handleStop = useCallback(() => {
    if (wsStatus !== 'connected') {
      window.alert('NO CONNECTION - MANUAL INTERVENTION REQUIRED')
      return
    }
    sendTeleopCommand(0, 0)
    setEmergencyStop(true)
  }, [wsStatus, sendTeleopCommand, setEmergencyStop])

  if (!canEstop) return null

  return (
    <button
      data-testid="mobile-estop"
      onClick={handleStop}
      className="fixed bottom-20 right-4 z-40 flex h-20 w-20 items-center justify-center rounded-full bg-red-600 shadow-lg shadow-red-900/50 active:scale-95 active:bg-red-700 transition-transform md:hidden"
      aria-label="Emergency Stop"
    >
      <span className="text-xl font-black text-white leading-tight text-center">E-STOP</span>
    </button>
  )
}
