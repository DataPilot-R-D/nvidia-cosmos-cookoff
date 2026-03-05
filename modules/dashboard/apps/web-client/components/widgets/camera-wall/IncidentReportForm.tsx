'use client'

/**
 * IncidentReportForm Component
 *
 * Inline form for creating incidents from a camera tile.
 * Auto-attaches camera ID and timestamp.
 *
 * @see Issue #25 — T1.14 Create incident from camera tile
 */

import { type ReactNode, useState, useCallback } from 'react'
import { useIncidentStore, type IncidentSeverity } from '@/lib/stores/incident-store'

// =============================================================================
// Types
// =============================================================================

export type IncidentType = 'anomaly' | 'security' | 'maintenance'

export interface IncidentReportFormProps {
  /** Camera ID to attach to incident */
  cameraId: string
  /** Camera name for display */
  cameraName: string
  /** Close handler */
  onClose: () => void
}

// =============================================================================
// Constants
// =============================================================================

const INCIDENT_TYPES: { value: IncidentType; label: string }[] = [
  { value: 'anomaly', label: 'Anomaly' },
  { value: 'security', label: 'Security' },
  { value: 'maintenance', label: 'Maintenance' },
]

const SEVERITIES: { value: IncidentSeverity; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: 'text-red-400 border-red-500/40' },
  { value: 'warning', label: 'Warning', color: 'text-yellow-400 border-yellow-500/40' },
  { value: 'info', label: 'Info', color: 'text-blue-400 border-blue-500/40' },
]

// =============================================================================
// Component
// =============================================================================

export function IncidentReportForm({
  cameraId,
  cameraName,
  onClose,
}: IncidentReportFormProps): ReactNode {
  const [incidentType, setIncidentType] = useState<IncidentType>('anomaly')
  const [severity, setSeverity] = useState<IncidentSeverity>('warning')
  const [description, setDescription] = useState('')
  const addIncident = useIncidentStore((s) => s.addIncident)

  const handleSubmit = useCallback(() => {
    if (!description.trim()) return

    const id = `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    addIncident({
      id,
      title: `[${incidentType.toUpperCase()}] ${cameraName}`,
      severity,
      status: 'new',
      timestamp: new Date().toISOString(),
      cameraId,
      description: description.trim(),
    })

    onClose()
  }, [addIncident, cameraId, cameraName, description, incidentType, onClose, severity])

  return (
    <div
      className="absolute inset-0 z-30 bg-[#0d1117]/95 p-3 flex flex-col gap-2"
      data-testid="incident-report-form"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono uppercase text-cyan-300 tracking-wider">
          Report Incident
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] text-[#666] hover:text-white"
          data-testid="incident-form-close"
        >
          ✕
        </button>
      </div>

      {/* Type selector */}
      <div className="flex gap-1">
        {INCIDENT_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setIncidentType(t.value)}
            className={`px-2 py-0.5 text-[9px] font-mono uppercase rounded border transition-colors ${
              incidentType === t.value
                ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-300'
                : 'border-[#2a3440] bg-[#111827] text-[#7e8a9a] hover:border-cyan-500/30'
            }`}
            data-testid={`incident-type-${t.value}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Severity selector */}
      <div className="flex gap-1">
        {SEVERITIES.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setSeverity(s.value)}
            className={`px-2 py-0.5 text-[9px] font-mono uppercase rounded border transition-colors ${
              severity === s.value
                ? `${s.color} bg-white/5`
                : 'border-[#2a3440] text-[#7e8a9a] hover:border-[#444]'
            }`}
            data-testid={`incident-severity-${s.value}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Description */}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Describe the incident..."
        className="flex-1 min-h-[40px] px-2 py-1 text-[10px] font-mono bg-[#0b1220] border border-[#2a3440] rounded text-[#cbd5e1] placeholder:text-[#4b5563] focus:outline-none focus:border-cyan-500/50 resize-none"
        data-testid="incident-description"
      />

      {/* Camera info */}
      <div className="text-[8px] text-[#555] font-mono">
        Camera: {cameraName} ({cameraId})
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!description.trim()}
          className="flex-1 px-2 py-1 text-[9px] font-mono uppercase rounded border border-cyan-500/50 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          data-testid="incident-submit"
        >
          Submit
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 text-[9px] font-mono uppercase rounded border border-[#333] text-[#888] hover:border-[#555] transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
