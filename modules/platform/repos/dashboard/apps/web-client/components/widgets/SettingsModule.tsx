/**
 * SettingsModule — Dashboard settings panel with Connection, Display,
 * Notifications, and About sections. Persisted via localStorage.
 */
'use client'

import React, { useState, useCallback, useRef } from 'react'
import { useSettingsStore, type ThemeMode, type GridDensity } from '@/lib/stores/settings-store'
import { useTabStore } from '@/lib/stores/tab-store'

// =============================================================================
// Connection Test
// =============================================================================

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail'

function useConnectionTest() {
  const [wsStatus, setWsStatus] = useState<TestStatus>('idle')
  const [rosStatus, setRosStatus] = useState<TestStatus>('idle')

  const testWs = useCallback((url: string) => {
    setWsStatus('testing')
    // Convert ws:// to http:// for fetch ping
    const httpUrl = url.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://')
    fetch(httpUrl, { method: 'GET', signal: AbortSignal.timeout(5000) })
      .then((r) => setWsStatus(r.ok || r.status === 400 ? 'ok' : 'fail'))
      .catch(() => setWsStatus('fail'))
  }, [])

  const testRos = useCallback((url: string) => {
    setRosStatus('testing')
    try {
      const ws = new WebSocket(url)
      const timer = setTimeout(() => {
        ws.close()
        setRosStatus('fail')
      }, 5000)
      ws.onopen = () => {
        clearTimeout(timer)
        ws.close()
        setRosStatus('ok')
      }
      ws.onerror = () => {
        clearTimeout(timer)
        setRosStatus('fail')
      }
    } catch {
      setRosStatus('fail')
    }
  }, [])

  return { wsStatus, rosStatus, testWs, testRos }
}

function StatusDot({ status }: { status: TestStatus }) {
  const colors: Record<TestStatus, string> = {
    idle: 'bg-white/20',
    testing: 'bg-yellow-400 animate-pulse',
    ok: 'bg-green-400',
    fail: 'bg-red-400',
  }
  return <div className={`w-2 h-2 rounded-full ${colors[status]}`} />
}

// =============================================================================
// Section wrapper
// =============================================================================

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-medium text-white/60 uppercase tracking-wide mb-2 border-b border-white/10 pb-1">
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/70">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-8 h-4 rounded-full transition-colors ${
        checked ? 'bg-cyan-500' : 'bg-white/20'
      }`}
    >
      <div
        className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// =============================================================================
// Main component
// =============================================================================

// =============================================================================
// Presets
// =============================================================================

const PRESETS: Record<string, { name: string; widgets: Array<{ type: string }> }> = {
  monitoring: {
    name: 'Monitoring',
    widgets: [
      { type: 'robot-status' },
      { type: 'camera' },
      { type: 'map-2d' },
      { type: 'trust-dashboard' },
    ],
  },
  operations: {
    name: 'Operations',
    widgets: [
      { type: 'mission-planner' },
      { type: 'mission-dashboard' },
      { type: 'zone-editor' },
      { type: 'incident-list' },
    ],
  },
  debug: {
    name: 'Debug',
    widgets: [
      { type: 'topic-inspector' },
      { type: 'machine-usage' },
      { type: 'lidar' },
      { type: 'audit-log' },
    ],
  },
}

function LayoutSection() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  const handleExport = useCallback(() => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      tabs,
      activeTabId,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'dashboard-layout.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [tabs, activeTabId])

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (!data.tabs || !Array.isArray(data.tabs)) {
          setImportStatus('❌ Invalid format')
          return
        }
        // Clear and restore tabs
        const store = useTabStore.getState()
        // Remove existing tabs
        store.tabs.forEach((t) => store.deleteTab(t.id))
        // Add imported tabs
        for (const tab of data.tabs) {
          store.addTab(tab.name || 'Imported')
          const newTab = store.tabs[store.tabs.length - 1]
          if (newTab && tab.widgets) {
            for (const w of tab.widgets) {
              store.addWidget(newTab.id, {
                id: `${w.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                moduleType: w.type,
              })
            }
          }
        }
        setImportStatus('✅ Imported!')
        setTimeout(() => setImportStatus(null), 3000)
      } catch {
        setImportStatus('❌ Parse error')
      }
    }
    reader.readAsText(file)
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handlePreset = useCallback((presetKey: string) => {
    const preset = PRESETS[presetKey]
    if (!preset) return
    const store = useTabStore.getState()
    store.addTab(preset.name)
    const newTab = store.tabs[store.tabs.length - 1]
    if (newTab) {
      for (const w of preset.widgets) {
        store.addWidget(newTab.id, {
          id: `${w.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          moduleType: w.type,
        })
      }
      store.switchTab(newTab.id)
    }
  }, [])

  return (
    <Section title="📦 Layout">
      <div className="flex gap-1.5">
        <button
          onClick={handleExport}
          className="flex-1 px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 rounded text-[10px] font-medium transition-colors"
          data-testid="settings-export-btn"
        >
          ⬇ Export
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 rounded text-[10px] font-medium transition-colors"
          data-testid="settings-import-btn"
        >
          ⬆ Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImport}
          className="hidden"
        />
      </div>
      {importStatus && <div className="text-[10px] text-white/60">{importStatus}</div>}

      {/* Presets */}
      <div className="text-[10px] text-white/40 mt-1">Presets</div>
      <div className="flex gap-1">
        {Object.entries(PRESETS).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => handlePreset(key)}
            className="flex-1 px-2 py-1 bg-white/5 hover:bg-white/10 text-white/60 rounded text-[10px] transition-colors"
          >
            {preset.name}
          </button>
        ))}
      </div>
    </Section>
  )
}

// =============================================================================
// Main component
// =============================================================================

export function SettingsModule() {
  const connection = useSettingsStore((s) => s.connection)
  const display = useSettingsStore((s) => s.display)
  const notifications = useSettingsStore((s) => s.notifications)
  const setConnection = useSettingsStore((s) => s.setConnection)
  const setDisplay = useSettingsStore((s) => s.setDisplay)
  const setNotifications = useSettingsStore((s) => s.setNotifications)
  const reset = useSettingsStore((s) => s.reset)

  const { wsStatus, rosStatus, testWs, testRos } = useConnectionTest()

  const handleTestAll = useCallback(() => {
    testWs(connection.wsUrl)
    testRos(connection.rosUrl)
  }, [connection.wsUrl, connection.rosUrl, testWs, testRos])

  return (
    <div
      className="flex h-full flex-col p-3 text-white overflow-y-auto"
      data-testid="settings-module"
    >
      {/* ── Connection ── */}
      <Section title="🔌 Connection">
        <div className="space-y-1.5">
          <div>
            <label className="text-[10px] text-white/40 block mb-0.5">WebSocket Server URL</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={connection.wsUrl}
                onChange={(e) => setConnection({ wsUrl: e.target.value })}
                className="flex-1 px-2 py-1 bg-[#111] border border-[#333] rounded text-xs text-white font-mono"
                data-testid="settings-ws-url"
              />
              <StatusDot status={wsStatus} />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-white/40 block mb-0.5">ROSBridge URL</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={connection.rosUrl}
                onChange={(e) => setConnection({ rosUrl: e.target.value })}
                className="flex-1 px-2 py-1 bg-[#111] border border-[#333] rounded text-xs text-white font-mono"
                data-testid="settings-ros-url"
              />
              <StatusDot status={rosStatus} />
            </div>
          </div>
          <button
            onClick={handleTestAll}
            className="w-full px-2 py-1 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 rounded text-[10px] font-medium transition-colors"
            data-testid="settings-test-btn"
          >
            🔍 Test Connections
          </button>
        </div>
      </Section>

      {/* ── Display ── */}
      <Section title="🎨 Display">
        <SettingRow label="Theme">
          <div className="flex gap-0.5">
            {(['dark', 'light'] as ThemeMode[]).map((t) => (
              <button
                key={t}
                onClick={() => setDisplay({ theme: t })}
                className={`text-[10px] px-2 py-0.5 rounded capitalize transition-colors ${
                  display.theme === t
                    ? 'bg-cyan-500/30 text-cyan-300'
                    : 'bg-white/5 text-white/40 hover:bg-white/10'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow label="Grid Density">
          <div className="flex gap-0.5">
            {(['compact', 'normal', 'comfortable'] as GridDensity[]).map((d) => (
              <button
                key={d}
                onClick={() => setDisplay({ gridDensity: d })}
                className={`text-[10px] px-2 py-0.5 rounded capitalize transition-colors ${
                  display.gridDensity === d
                    ? 'bg-cyan-500/30 text-cyan-300'
                    : 'bg-white/5 text-white/40 hover:bg-white/10'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        </SettingRow>
      </Section>

      {/* ── Notifications ── */}
      <Section title="🔔 Notifications">
        <SettingRow label="Sound">
          <Toggle
            checked={notifications.soundEnabled}
            onChange={(v) => setNotifications({ soundEnabled: v })}
            label="Sound enabled"
          />
        </SettingRow>
        <SettingRow label="Incidents">
          <Toggle
            checked={notifications.incidents}
            onChange={(v) => setNotifications({ incidents: v })}
            label="Incident notifications"
          />
        </SettingRow>
        <SettingRow label="Missions">
          <Toggle
            checked={notifications.missions}
            onChange={(v) => setNotifications({ missions: v })}
            label="Mission notifications"
          />
        </SettingRow>
        <SettingRow label="Trust Alerts">
          <Toggle
            checked={notifications.trust}
            onChange={(v) => setNotifications({ trust: v })}
            label="Trust notifications"
          />
        </SettingRow>
      </Section>

      {/* ── About ── */}
      <Section title="ℹ️ About">
        <div className="space-y-1 text-[10px]">
          <div className="flex justify-between">
            <span className="text-white/40">Version</span>
            <span className="text-white/60 font-mono">0.1.0</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Build</span>
            <span className="text-white/60 font-mono">
              {process.env.NEXT_PUBLIC_BUILD_ID || 'dev'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/40">Environment</span>
            <span className="text-white/60 font-mono">{process.env.NODE_ENV}</span>
          </div>
        </div>
      </Section>

      {/* ── Layout Export/Import ── */}
      <LayoutSection />

      {/* Reset */}
      <button
        onClick={reset}
        className="w-full px-2 py-1 bg-red-600/10 hover:bg-red-600/20 text-red-400/60 hover:text-red-400 rounded text-[10px] transition-colors mt-auto"
      >
        Reset to Defaults
      </button>
    </div>
  )
}
