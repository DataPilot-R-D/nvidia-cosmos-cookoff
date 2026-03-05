/**
 * ReplayReviewModule — timeline with visual incident markers,
 * playback controls (play/pause/speed/seek), keyboard shortcuts,
 * and thumbnail previews for evidence entries.
 */
'use client'

import React, { useEffect, useMemo, useCallback, useState, useRef } from 'react'
import { useEvidenceStore, type Evidence, type EvidenceType } from '@/lib/stores/evidence-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'

// =============================================================================
// Helpers
// =============================================================================

const TYPE_CONFIG: Record<EvidenceType, { label: string; color: string; icon: string }> = {
  video_clip: { label: 'Video', color: 'text-purple-400', icon: '🎬' },
  snapshot: { label: 'Snapshot', color: 'text-blue-400', icon: '📸' },
  sensor_log: { label: 'Sensor', color: 'text-green-400', icon: '📊' },
  audit_entry: { label: 'Audit', color: 'text-yellow-400', icon: '📋' },
  event: { label: 'Event', color: 'text-red-400', icon: '⚡' },
  note: { label: 'Note', color: 'text-gray-400', icon: '📝' },
}

const SPEED_OPTIONS = [1, 2, 4] as const

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return iso
  }
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// =============================================================================
// Timeline Bar — visual with incident markers
// =============================================================================

interface TimelineBarProps {
  entries: Evidence[]
  currentTime: number // 0..1 normalized
  duration: number // total seconds
  onSeek: (normalized: number) => void
}

function TimelineBar({ entries, currentTime, duration, onSeek }: TimelineBarProps) {
  const barRef = useRef<HTMLDivElement>(null)

  const incidentMarkers = useMemo(() => {
    if (entries.length === 0 || duration <= 0) return []
    const minT = Math.min(...entries.map((e) => new Date(e.capturedAt).getTime()))
    const maxT = Math.max(...entries.map((e) => new Date(e.capturedAt).getTime()))
    const range = maxT - minT || 1
    return entries
      .filter((e) => e.type === 'audit_entry' || e.incidentId)
      .map((e) => ({
        id: e.id,
        position: (new Date(e.capturedAt).getTime() - minT) / range,
        title: e.title,
        hasIncident: !!e.incidentId,
      }))
  }, [entries, duration])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = barRef.current?.getBoundingClientRect()
      if (!rect) return
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      onSeek(x)
    },
    [onSeek]
  )

  return (
    <div
      ref={barRef}
      className="relative h-6 bg-white/5 rounded-full cursor-pointer group"
      onClick={handleClick}
      role="slider"
      aria-valuenow={Math.round(currentTime * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Timeline"
      tabIndex={0}
    >
      {/* Progress fill */}
      <div
        className="absolute inset-y-0 left-0 bg-cyan-500/30 rounded-full transition-all duration-100"
        style={{ width: `${currentTime * 100}%` }}
      />
      {/* Playhead */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-cyan-400 rounded-full shadow-lg shadow-cyan-400/30 transition-all duration-100"
        style={{ left: `calc(${currentTime * 100}% - 6px)` }}
      />
      {/* Incident markers */}
      {incidentMarkers.map((m) => (
        <div
          key={m.id}
          className="absolute top-0 bottom-0 w-1.5 -translate-x-1/2"
          style={{ left: `${m.position * 100}%` }}
          title={m.title}
        >
          <div
            className={`w-1.5 h-1.5 rounded-full absolute top-0.5 ${m.hasIncident ? 'bg-red-500' : 'bg-yellow-500'}`}
          />
        </div>
      ))}
      {/* Time labels */}
      <div className="absolute -bottom-4 left-0 text-[8px] text-white/30">0:00</div>
      <div className="absolute -bottom-4 right-0 text-[8px] text-white/30">
        {formatDuration(duration)}
      </div>
    </div>
  )
}

// =============================================================================
// Playback Controls
// =============================================================================

interface PlaybackControlsProps {
  isPlaying: boolean
  speed: number
  currentTime: number
  duration: number
  onTogglePlay: () => void
  onSpeedChange: (speed: number) => void
  onSeekDelta: (deltaSec: number) => void
}

function PlaybackControls({
  isPlaying,
  speed,
  currentTime,
  duration,
  onTogglePlay,
  onSpeedChange,
  onSeekDelta,
}: PlaybackControlsProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Rewind 5s */}
      <button
        onClick={() => onSeekDelta(-5)}
        className="text-[10px] text-white/40 hover:text-white/80 transition-colors"
        title="Rewind 5s (←)"
      >
        ⏪
      </button>

      {/* Play/Pause */}
      <button
        onClick={onTogglePlay}
        className="w-7 h-7 rounded-full bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 flex items-center justify-center transition-colors"
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      >
        <span className="text-xs">{isPlaying ? '⏸' : '▶'}</span>
      </button>

      {/* Forward 5s */}
      <button
        onClick={() => onSeekDelta(5)}
        className="text-[10px] text-white/40 hover:text-white/80 transition-colors"
        title="Forward 5s (→)"
      >
        ⏩
      </button>

      {/* Time display */}
      <span className="text-[10px] text-white/50 font-mono min-w-[60px]">
        {formatDuration(currentTime)} / {formatDuration(duration)}
      </span>

      {/* Speed */}
      <div className="flex gap-0.5 ml-auto">
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              speed === s
                ? 'bg-cyan-500/30 text-cyan-300'
                : 'bg-white/5 text-white/40 hover:bg-white/10'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}

// =============================================================================
// Evidence Card with thumbnail
// =============================================================================

interface EvidenceCardProps {
  evidence: Evidence
  isSelected: boolean
  isCurrent: boolean
  onSelect: (id: string) => void
}

function EvidenceCard({ evidence, isSelected, isCurrent, onSelect }: EvidenceCardProps) {
  const cfg = TYPE_CONFIG[evidence.type]

  return (
    <button
      onClick={() => onSelect(evidence.id)}
      className={`w-full text-left rounded border p-2 mb-1.5 transition-colors ${
        isSelected
          ? 'border-cyan-400/50 bg-cyan-400/10'
          : isCurrent
            ? 'border-yellow-400/30 bg-yellow-400/5'
            : 'border-white/10 bg-white/5 hover:bg-white/10'
      }`}
    >
      <div className="flex gap-2">
        {/* Thumbnail */}
        <div className="w-12 h-9 rounded bg-black/30 flex-shrink-0 flex items-center justify-center overflow-hidden">
          {evidence.mediaUrl ? (
            <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
              <span className="text-sm">{cfg.icon}</span>
            </div>
          ) : (
            <span className="text-sm opacity-40">{cfg.icon}</span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-xs font-medium text-white truncate max-w-[130px]">
              {evidence.title}
            </span>
            <span className={`text-[10px] ${cfg.color}`}>{cfg.label}</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-white/40">
            <span>{formatTime(evidence.capturedAt)}</span>
            <div className="flex items-center gap-1">
              {evidence.incidentId && <span className="text-red-400">●</span>}
              {evidence.robotId && <span>🤖 {evidence.robotId.slice(0, 8)}</span>}
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

// =============================================================================
// Detail panel
// =============================================================================

interface DetailPanelProps {
  evidence: Evidence
}

function DetailPanel({ evidence }: DetailPanelProps) {
  const cfg = TYPE_CONFIG[evidence.type]

  return (
    <div className="rounded border border-white/10 bg-white/5 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{cfg.icon}</span>
        <div>
          <div className="text-sm font-medium text-white">{evidence.title}</div>
          <div className={`text-[10px] ${cfg.color}`}>{cfg.label}</div>
        </div>
      </div>

      {evidence.description && <p className="text-xs text-white/60 mb-2">{evidence.description}</p>}

      {evidence.mediaUrl && (
        <div className="rounded bg-black/30 p-2 mb-2">
          <div className="text-[10px] text-white/40 mb-1">Media Source</div>
          <div className="text-xs text-cyan-300 break-all">{evidence.mediaUrl}</div>
          {(evidence.startOffset !== null || evidence.endOffset !== null) && (
            <div className="text-[10px] text-white/40 mt-1">
              {evidence.startOffset !== null && `Start: ${evidence.startOffset}s`}
              {evidence.startOffset !== null && evidence.endOffset !== null && ' — '}
              {evidence.endOffset !== null && `End: ${evidence.endOffset}s`}
            </div>
          )}
        </div>
      )}

      {evidence.metadata && (
        <div className="rounded bg-black/30 p-2 mb-2">
          <div className="text-[10px] text-white/40 mb-1">Metadata</div>
          <pre className="text-[10px] text-white/60 overflow-x-auto">
            {JSON.stringify(JSON.parse(evidence.metadata), null, 2)}
          </pre>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 text-[10px] text-white/40">
        {evidence.incidentId && <span>📋 Incident: {evidence.incidentId.slice(0, 8)}</span>}
        {evidence.missionId && <span>🎯 Mission: {evidence.missionId.slice(0, 8)}</span>}
        {evidence.robotId && <span>🤖 Robot: {evidence.robotId.slice(0, 8)}</span>}
        {evidence.cameraSourceId && <span>📹 Camera: {evidence.cameraSourceId.slice(0, 8)}</span>}
      </div>
    </div>
  )
}

// =============================================================================
// Filter bar
// =============================================================================

const TYPE_FILTER_OPTIONS: Array<{ key: EvidenceType | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'video_clip', label: '🎬' },
  { key: 'snapshot', label: '📸' },
  { key: 'sensor_log', label: '📊' },
  { key: 'audit_entry', label: '📋' },
  { key: 'note', label: '📝' },
]

// =============================================================================
// Main component
// =============================================================================

export function ReplayReviewModule() {
  const entriesMap = useEvidenceStore((s) => s.entries)
  const selectedId = useEvidenceStore((s) => s.selectedId)
  const filters = useEvidenceStore((s) => s.filters)
  const setFilter = useEvidenceStore((s) => s.setFilter)
  const setSelected = useEvidenceStore((s) => s.setSelected)
  const setEntries = useEvidenceStore((s) => s.setEntries)
  const upsertEntry = useEvidenceStore((s) => s.upsertEntry)
  const socket = useWebSocketStore((s) => s.socket)

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(1)
  const [currentTime, setCurrentTime] = useState(0) // seconds
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const allEntries = useMemo(() => Array.from(entriesMap.values()), [entriesMap])

  const filteredEntries = useMemo(() => {
    let list = allEntries
    if (filters.type) list = list.filter((e) => e.type === filters.type)
    if (filters.incidentId) list = list.filter((e) => e.incidentId === filters.incidentId)
    if (filters.missionId) list = list.filter((e) => e.missionId === filters.missionId)
    if (filters.robotId) list = list.filter((e) => e.robotId === filters.robotId)
    return list.sort((a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime())
  }, [allEntries, filters])

  // Compute timeline duration from entries
  const duration = useMemo(() => {
    if (filteredEntries.length < 2) return 60 // default 1 min
    const times = filteredEntries.map((e) => new Date(e.capturedAt).getTime())
    return Math.max(60, (Math.max(...times) - Math.min(...times)) / 1000)
  }, [filteredEntries])

  // Current entry (closest to playback position)
  const currentEntryId = useMemo(() => {
    if (filteredEntries.length === 0) return null
    const minT = Math.min(...filteredEntries.map((e) => new Date(e.capturedAt).getTime()))
    const targetT = minT + currentTime * 1000
    let closest = filteredEntries[0]
    let closestDist = Infinity
    for (const e of filteredEntries) {
      const dist = Math.abs(new Date(e.capturedAt).getTime() - targetT)
      if (dist < closestDist) {
        closestDist = dist
        closest = e
      }
    }
    return closest.id
  }, [filteredEntries, currentTime])

  const selectedEvidence = useMemo(
    () => (selectedId ? (entriesMap.get(selectedId) ?? null) : null),
    [selectedId, entriesMap]
  )

  const [bundleSummary, setBundleSummary] = useState<{
    total: number
    byType: Record<string, number>
    timeRange: { earliest: string; latest: string } | null
    cameras: string[]
  } | null>(null)

  // Fetch bundle from API when incidentId filter is set
  useEffect(() => {
    if (!filters.incidentId) {
      setBundleSummary(null)
      return
    }

    const controller = new AbortController()
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:8081'
    const baseUrl = wsUrl.replace(/^ws/, 'http')

    fetch(`${baseUrl}/api/evidence/bundle/${filters.incidentId}`, {
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.items) {
          setEntries(data.items as Evidence[])
          setBundleSummary(data.summary ?? null)
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
      })

    return () => controller.abort()
  }, [filters.incidentId, setEntries])

  // Video seek handler — click event on timeline seeks to that timestamp
  const handleEventSeek = useCallback(
    (evidence: Evidence) => {
      if (filteredEntries.length === 0) return
      const minT = Math.min(...filteredEntries.map((e) => new Date(e.capturedAt).getTime()))
      const eventT = new Date(evidence.capturedAt).getTime()
      const seekTime = Math.max(0, (eventT - minT) / 1000)
      setCurrentTime(seekTime)
      setSelected(evidence.id)
    },
    [filteredEntries, setSelected]
  )

  // Playback timer
  useEffect(() => {
    if (!isPlaying) {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current)
        playIntervalRef.current = null
      }
      return
    }

    playIntervalRef.current = setInterval(() => {
      setCurrentTime((t) => {
        const next = t + 0.1 * speed
        if (next >= duration) {
          setIsPlaying(false)
          return duration
        }
        return next
      })
    }, 100)

    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current)
    }
  }, [isPlaying, speed, duration])

  // Keyboard shortcuts
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          setIsPlaying((p) => !p)
          break
        case 'ArrowLeft':
          e.preventDefault()
          setCurrentTime((t) => Math.max(0, t - 5))
          break
        case 'ArrowRight':
          e.preventDefault()
          setCurrentTime((t) => Math.min(duration, t + 5))
          break
      }
    }

    el.addEventListener('keydown', handleKey)
    return () => el.removeEventListener('keydown', handleKey)
  }, [duration])

  // Fetch evidence on mount
  useEffect(() => {
    const ws = socket
    if (!ws) return

    ws.emit('evidence:list', {}, (res: { entries?: Evidence[] }) => {
      if (res?.entries) {
        setEntries(res.entries)
      }
    })

    const handleUpdate = (entry: Evidence) => upsertEntry(entry)
    ws.on('evidence:created', handleUpdate)
    ws.on('evidence:updated', handleUpdate)

    return () => {
      ws.off('evidence:created', handleUpdate)
      ws.off('evidence:updated', handleUpdate)
    }
  }, [socket, setEntries, upsertEntry])

  const handleSelect = useCallback(
    (id: string) => {
      if (selectedId === id) {
        setSelected(null)
        return
      }
      const evidence = entriesMap.get(id)
      if (evidence) {
        handleEventSeek(evidence)
      } else {
        setSelected(id)
      }
    },
    [selectedId, setSelected, entriesMap, handleEventSeek]
  )

  const handleSeek = useCallback(
    (normalized: number) => {
      setCurrentTime(normalized * duration)
    },
    [duration]
  )

  const handleSeekDelta = useCallback(
    (deltaSec: number) => {
      setCurrentTime((t) => Math.max(0, Math.min(duration, t + deltaSec)))
    },
    [duration]
  )

  const activeTypeFilter = filters.type ?? 'all'

  return (
    <div
      ref={containerRef}
      className="flex h-full flex-col p-3 text-white"
      tabIndex={-1}
      data-testid="replay-review-module"
    >
      {/* Header + type filters */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-white/70">
          {filteredEntries.length} event{filteredEntries.length !== 1 ? 's' : ''}
        </span>
        <div className="flex gap-0.5">
          {TYPE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter({ type: opt.key === 'all' ? undefined : opt.key })}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                activeTypeFilter === opt.key
                  ? 'bg-cyan-500/30 text-cyan-300'
                  : 'bg-white/5 text-white/40 hover:bg-white/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bundle summary */}
      {bundleSummary && (
        <div
          className="mb-2 px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-mono text-cyan-300"
          data-testid="bundle-summary"
        >
          <span className="font-semibold">Bundle:</span> {bundleSummary.total} items
          {bundleSummary.cameras.length > 0 &&
            ` · ${bundleSummary.cameras.length} cam${bundleSummary.cameras.length > 1 ? 's' : ''}`}
          {bundleSummary.timeRange && (
            <span className="text-cyan-400/60">
              {' '}
              · {formatTime(bundleSummary.timeRange.earliest)} –{' '}
              {formatTime(bundleSummary.timeRange.latest)}
            </span>
          )}
        </div>
      )}

      {/* Timeline bar */}
      <div className="mb-6">
        <TimelineBar
          entries={filteredEntries}
          currentTime={duration > 0 ? currentTime / duration : 0}
          duration={duration}
          onSeek={handleSeek}
        />
      </div>

      {/* Playback controls */}
      <div className="mb-3">
        <PlaybackControls
          isPlaying={isPlaying}
          speed={speed}
          currentTime={currentTime}
          duration={duration}
          onTogglePlay={() => setIsPlaying((p) => !p)}
          onSpeedChange={setSpeed}
          onSeekDelta={handleSeekDelta}
        />
      </div>

      {/* Content: evidence list + detail */}
      <div className="flex flex-1 gap-2 min-h-0">
        {/* Evidence list with thumbnails */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {filteredEntries.length === 0 ? (
            <div className="flex items-center justify-center h-full text-white/30 text-xs">
              No evidence entries
            </div>
          ) : (
            filteredEntries.map((e) => (
              <EvidenceCard
                key={e.id}
                evidence={e}
                isSelected={e.id === selectedId}
                isCurrent={e.id === currentEntryId}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>

        {/* Detail panel */}
        {selectedEvidence && (
          <div className="w-[45%] overflow-y-auto min-h-0">
            <DetailPanel evidence={selectedEvidence} />
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      <div className="text-[8px] text-white/20 mt-1 text-center">Space: play/pause · ←/→: ±5s</div>
    </div>
  )
}
