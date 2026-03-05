/**
 * TopBar Component
 *
 * Fixed top navigation bar with:
 * - Left: View name and Save button
 * - Center: Connection controls (WS Server + ROSBridge)
 * - Right: User profile section
 *
 * @see Liquid Glass Design System
 */

'use client'

import { useState, useCallback, useEffect, type ReactNode, type KeyboardEvent } from 'react'

import { useDashboardStore, useTabStore } from '@/lib/stores'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { RobotSelector } from './RobotSelector'

// =============================================================================
// Types
// =============================================================================

export interface TopBarProps {
  /** Optional custom className */
  className?: string
}

// =============================================================================
// Component
// =============================================================================

export function TopBar({ className = '' }: TopBarProps): ReactNode {
  // Hydration guard - prevent SSR/client mismatch
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Store selectors
  const saveLayout = useDashboardStore((state) => state.saveLayout)
  const activeTab = useTabStore((state) => state.getActiveTab())

  // WebSocket store
  const wsUrl = useWebSocketStore((state) => state.wsUrl)
  const isConnected = useWebSocketStore((state) => state.isConnected())
  const rosbridgeUrl = useWebSocketStore((state) => state.rosbridgeUrl)
  const rosbridgeConnected = useWebSocketStore((state) => state.rosbridgeConnected)
  const setWsUrl = useWebSocketStore((state) => state.setWsUrl)
  const changeRosbridgeUrl = useWebSocketStore((state) => state.changeRosbridgeUrl)

  // Local state for editable addresses
  const [serverInput, setServerInput] = useState(wsUrl)
  const [robotInput, setRobotInput] = useState(rosbridgeUrl)

  // Sync with store when URL changes externally
  useEffect(() => {
    setServerInput(wsUrl)
  }, [wsUrl])

  useEffect(() => {
    setRobotInput(rosbridgeUrl)
  }, [rosbridgeUrl])

  // Handle save layout
  const handleSave = useCallback(() => {
    saveLayout()
  }, [saveLayout])

  // Handle server URL change
  const handleServerChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setServerInput(e.target.value)
  }, [])

  // Handle robot URL change
  const handleRobotChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRobotInput(e.target.value)
  }, [])

  // Handle Enter key on server input
  const handleServerKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && serverInput.trim()) {
        setWsUrl(serverInput.trim())
      }
    },
    [serverInput, setWsUrl]
  )

  // Handle Enter key on robot input
  const handleRobotKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && robotInput.trim()) {
        changeRosbridgeUrl(robotInput.trim())
      }
    },
    [robotInput, changeRosbridgeUrl]
  )

  // Handle connect button - apply both URLs
  const handleConnect = useCallback(() => {
    if (serverInput.trim()) {
      setWsUrl(serverInput.trim())
    }
    // ROSBridge URL is sent after WS connection is established
    if (robotInput.trim()) {
      // Small delay to ensure WS is connected first
      setTimeout(() => {
        changeRosbridgeUrl(robotInput.trim())
      }, 500)
    }
  }, [serverInput, robotInput, setWsUrl, changeRosbridgeUrl])

  // Status info
  const getStatusInfo = () => {
    if (!isConnected) {
      return { color: 'bg-red-500', label: 'Server Disconnected', animate: false }
    }
    if (rosbridgeConnected) {
      return { color: 'bg-green-500', label: 'Robot Connected', animate: false }
    }
    return { color: 'bg-yellow-500', label: 'Robot Connecting...', animate: true }
  }
  const { color: statusColor, label: statusLabel, animate: statusAnimate } = getStatusInfo()

  // View name from active tab (use default until hydrated to avoid SSR mismatch)
  const viewName = mounted ? activeTab?.name || 'Dashboard' : 'Dashboard'

  return (
    <header
      className={`fixed top-0 left-0 right-0 h-14 z-50 glass-dark border-b border-white/10 flex items-center px-4 ${className}`}
      data-testid="top-bar"
      role="banner"
    >
      {/* Left Section - View Name & Save */}
      <div className="flex items-center gap-3 min-w-[160px]" data-testid="topbar-left">
        {/* Hamburger menu for mobile */}
        <button
          className="sm:hidden p-1 text-white/60 hover:text-white"
          onClick={() => useDashboardStore.getState().toggleSidebar()}
          aria-label="Toggle menu"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <span className="text-white font-semibold truncate">{viewName}</span>
        <button
          className="topbar-btn px-2 py-1 text-xs font-medium bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded transition-colors"
          onClick={handleSave}
          data-testid="topbar-save-btn"
          title="Save layout"
        >
          <svg
            className="w-4 h-4 inline mr-1"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
            <path d="M17 21v-8H7v8M7 3v5h8" />
          </svg>
          Save
        </button>
      </div>

      {/* Center Section - Connection Controls */}
      <div
        className="flex-1 hidden sm:flex items-center justify-center gap-4"
        data-testid="topbar-center"
      >
        {/* Status Indicator */}
        <div className="flex items-center gap-2" aria-label="connection status">
          <span
            className={`w-2.5 h-2.5 rounded-full ${statusColor} ${statusAnimate ? 'animate-pulse' : ''}`}
            data-testid="ws-status-indicator"
            title={statusLabel}
            aria-label={statusLabel}
          />
          <span className="text-xs text-white/60 hidden lg:inline">{statusLabel}</span>
        </div>

        {/* Server URL Input */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-white/40 uppercase tracking-wider hidden md:inline">
            Server
          </span>
          <input
            type="text"
            className={`bg-white/5 border rounded px-2 py-1 text-xs text-white placeholder-white/40 focus:outline-none w-40 font-mono ${
              isConnected ? 'border-green-500/50' : 'border-white/10 focus:border-cyan-500/50'
            }`}
            value={serverInput}
            onChange={handleServerChange}
            onKeyDown={handleServerKeyDown}
            placeholder="http://localhost:8080"
            data-testid="ws-server-input"
            aria-label="WebSocket server address"
          />
        </div>

        {/* Robot/ROSBridge URL Input */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-white/40 uppercase tracking-wider hidden md:inline">
            Robot
          </span>
          <input
            type="text"
            className={`bg-white/5 border rounded px-2 py-1 text-xs text-white placeholder-white/40 focus:outline-none w-48 font-mono ${
              rosbridgeConnected
                ? 'border-green-500/50'
                : 'border-white/10 focus:border-purple-500/50'
            }`}
            value={robotInput}
            onChange={handleRobotChange}
            onKeyDown={handleRobotKeyDown}
            placeholder="ws://192.168.1.100:9090"
            data-testid="ws-robot-input"
            aria-label="ROSBridge address"
          />
        </div>

        {/* Connect Button */}
        <button
          className={`topbar-btn px-3 py-1 text-xs font-medium rounded transition-colors ${
            isConnected && rosbridgeConnected
              ? 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
              : 'bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400'
          }`}
          onClick={handleConnect}
          data-testid="ws-connect-btn"
          title={isConnected ? 'Reconnect' : 'Connect'}
        >
          {isConnected && rosbridgeConnected ? 'Connected' : 'Connect'}
        </button>
      </div>

      {/* Right Section - User Profile */}
      <div className="flex items-center gap-3 min-w-[120px] justify-end" data-testid="topbar-right">
        {/* Robot Selector */}
        <RobotSelector />

        {/* Notification Bell */}
        <NotificationBell />

        {/* Settings Button */}
        <button
          className="topbar-btn p-2 text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
          data-testid="settings-btn"
          title="Settings"
          aria-label="Settings"
        >
          <svg
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>

        {/* User Avatar */}
        <div className="flex items-center gap-2" data-testid="topbar-user-profile">
          <div
            className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-sm font-semibold"
            data-testid="user-avatar"
            title="User"
          >
            U
          </div>
        </div>
      </div>
    </header>
  )
}

export default TopBar
