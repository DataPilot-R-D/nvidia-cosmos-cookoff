/**
 * NotificationBell — bell icon with unread badge + dropdown panel.
 */
'use client'

import React, { useCallback, useRef, useEffect } from 'react'
import {
  useNotificationStore,
  type Notification,
  type NotificationLevel,
} from '@/lib/stores/notification-store'

const LEVEL_ICON: Record<NotificationLevel, string> = {
  info: 'ℹ️',
  success: '✅',
  warning: '⚠️',
  error: '🚨',
}

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification
  onRead: (id: string) => void
}) {
  return (
    <button
      onClick={() => onRead(notification.id)}
      className={`w-full text-left px-3 py-2 hover:bg-white/5 transition-colors ${
        notification.read ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-xs flex-shrink-0">{LEVEL_ICON[notification.level]}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-white truncate">
              {notification.title}
            </span>
            <span className="text-[9px] text-white/30 flex-shrink-0 ml-2">
              {formatTimeAgo(notification.timestamp)}
            </span>
          </div>
          {notification.message && (
            <div className="text-[10px] text-white/40 truncate">{notification.message}</div>
          )}
        </div>
        {!notification.read && (
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0 mt-1" />
        )}
      </div>
    </button>
  )
}

export function NotificationBell() {
  const notifications = useNotificationStore((s) => s.notifications)
  const panelOpen = useNotificationStore((s) => s.panelOpen)
  const togglePanel = useNotificationStore((s) => s.togglePanel)
  const setPanel = useNotificationStore((s) => s.setPanel)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const clearAll = useNotificationStore((s) => s.clearAll)
  const panelRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  // Close on click outside
  useEffect(() => {
    if (!panelOpen) return
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanel(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [panelOpen, setPanel])

  const handleRead = useCallback(
    (id: string) => {
      markRead(id)
    },
    [markRead]
  )

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={togglePanel}
        className="relative p-1.5 rounded hover:bg-white/10 transition-colors"
        data-testid="notification-bell"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/60"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[9px] text-white font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panel dropdown */}
      {panelOpen && (
        <div className="absolute right-0 top-full mt-1 w-72 max-h-96 bg-[#111] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <span className="text-xs font-medium text-white">Notifications</span>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[9px] text-cyan-400 hover:text-cyan-300"
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button onClick={clearAll} className="text-[9px] text-white/30 hover:text-white/50">
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-80 divide-y divide-white/5">
            {notifications.length === 0 ? (
              <div className="px-3 py-6 text-center text-[10px] text-white/30">
                No notifications
              </div>
            ) : (
              notifications
                .slice(0, 20)
                .map((n) => <NotificationItem key={n.id} notification={n} onRead={handleRead} />)
            )}
          </div>
        </div>
      )}
    </div>
  )
}
