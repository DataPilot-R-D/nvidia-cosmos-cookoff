/**
 * Settings Store — persisted in localStorage.
 * Manages connection URLs, display prefs, notification config.
 */

import { create } from 'zustand'

// =============================================================================
// Types
// =============================================================================

export type ThemeMode = 'dark' | 'light'
export type GridDensity = 'compact' | 'normal' | 'comfortable'

export interface ConnectionSettings {
  wsUrl: string
  rosUrl: string
}

export interface DisplaySettings {
  theme: ThemeMode
  gridDensity: GridDensity
}

export interface NotificationSettings {
  soundEnabled: boolean
  incidents: boolean
  missions: boolean
  trust: boolean
}

export interface SettingsState {
  connection: ConnectionSettings
  display: DisplaySettings
  notifications: NotificationSettings
  // Actions
  setConnection: (patch: Partial<ConnectionSettings>) => void
  setDisplay: (patch: Partial<DisplaySettings>) => void
  setNotifications: (patch: Partial<NotificationSettings>) => void
  reset: () => void
}

// =============================================================================
// Defaults
// =============================================================================

const STORAGE_KEY = 'dashboard-settings'

function getDefaults(): {
  connection: ConnectionSettings
  display: DisplaySettings
  notifications: NotificationSettings
} {
  return {
    connection: {
      wsUrl: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8081',
      rosUrl: process.env.NEXT_PUBLIC_ROSBRIDGE_URL || 'ws://localhost:9090',
    },
    display: {
      theme: 'dark',
      gridDensity: 'normal',
    },
    notifications: {
      soundEnabled: true,
      incidents: true,
      missions: true,
      trust: true,
    },
  }
}

function loadFromStorage(): Partial<ReturnType<typeof getDefaults>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function saveToStorage(state: ReturnType<typeof getDefaults>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage full or unavailable
  }
}

// =============================================================================
// Store
// =============================================================================

export const useSettingsStore = create<SettingsState>((set) => {
  const defaults = getDefaults()
  const saved = loadFromStorage()

  const initial = {
    connection: { ...defaults.connection, ...saved.connection },
    display: { ...defaults.display, ...saved.display },
    notifications: { ...defaults.notifications, ...saved.notifications },
  }

  return {
    ...initial,

    setConnection: (patch) => {
      set((s) => {
        const connection = { ...s.connection, ...patch }
        saveToStorage({ connection, display: s.display, notifications: s.notifications })
        return { connection }
      })
    },

    setDisplay: (patch) => {
      set((s) => {
        const display = { ...s.display, ...patch }
        saveToStorage({ connection: s.connection, display, notifications: s.notifications })
        return { display }
      })
    },

    setNotifications: (patch) => {
      set((s) => {
        const notifications = { ...s.notifications, ...patch }
        saveToStorage({ connection: s.connection, display: s.display, notifications })
        return { notifications }
      })
    },

    reset: () => {
      const defaults = getDefaults()
      saveToStorage(defaults)
      set(defaults)
    },
  }
})
