/**
 * Notification Store — toast notifications + bell panel.
 * Persists last 50 in localStorage. Auto-dismisses toasts.
 */

import { create } from 'zustand'

// =============================================================================
// Types
// =============================================================================

export type NotificationLevel = 'info' | 'warning' | 'error' | 'success'

export interface Notification {
  id: string
  level: NotificationLevel
  title: string
  message?: string
  timestamp: number
  read: boolean
  source?: string // e.g. 'trust', 'incident', 'mission'
}

export interface NotificationState {
  notifications: Notification[]
  toasts: Notification[] // visible toasts (auto-dismiss)
  panelOpen: boolean
  // Derived
  unreadCount: number
  // Actions
  add: (level: NotificationLevel, title: string, message?: string, source?: string) => void
  markRead: (id: string) => void
  markAllRead: () => void
  dismissToast: (id: string) => void
  clearAll: () => void
  togglePanel: () => void
  setPanel: (open: boolean) => void
}

// =============================================================================
// Persistence
// =============================================================================

const STORAGE_KEY = 'dashboard-notifications'
const MAX_STORED = 50
const TOAST_DURATION = 5000

function loadFromStorage(): Notification[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveToStorage(notifications: Notification[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, MAX_STORED)))
  } catch {
    // Storage full
  }
}

// =============================================================================
// Sound
// =============================================================================

let audioCtx: AudioContext | null = null

export function playNotificationSound(level: NotificationLevel): void {
  if (typeof window === 'undefined') return
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)

    // Different tones per level
    osc.frequency.value = level === 'error' ? 440 : level === 'warning' ? 520 : 660
    osc.type = level === 'error' ? 'square' : 'sine'
    gain.gain.value = 0.08

    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3)
    osc.stop(audioCtx.currentTime + 0.3)
  } catch {
    // Audio not available
  }
}

// =============================================================================
// Store
// =============================================================================

let idCounter = 0

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: loadFromStorage(),
  toasts: [],
  panelOpen: false,

  get unreadCount() {
    return get().notifications.filter((n) => !n.read).length
  },

  add: (level, title, message, source) => {
    const id = `notif-${Date.now()}-${++idCounter}`
    const notification: Notification = {
      id,
      level,
      title,
      message,
      timestamp: Date.now(),
      read: false,
      source,
    }

    set((s) => {
      const notifications = [notification, ...s.notifications].slice(0, MAX_STORED)
      saveToStorage(notifications)
      return {
        notifications,
        toasts: [...s.toasts, notification],
      }
    })

    // Auto-dismiss toast
    setTimeout(() => {
      get().dismissToast(id)
    }, TOAST_DURATION)
  },

  markRead: (id) => {
    set((s) => {
      const notifications = s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
      saveToStorage(notifications)
      return { notifications }
    })
  },

  markAllRead: () => {
    set((s) => {
      const notifications = s.notifications.map((n) => ({ ...n, read: true }))
      saveToStorage(notifications)
      return { notifications }
    })
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  clearAll: () => {
    saveToStorage([])
    set({ notifications: [], toasts: [] })
  },

  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
  setPanel: (open) => set({ panelOpen: open }),
}))
