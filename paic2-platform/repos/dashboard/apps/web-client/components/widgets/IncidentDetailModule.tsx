/**
 * IncidentDetailModule Component
 *
 * Full incident details + status actions.
 */

'use client'

import type { ModuleProps } from './ModuleRegistry'
import {
  useIncidentStore,
  type Incident,
  type IncidentSeverity,
  type IncidentStatus,
} from '@/lib/stores/incident-store'

// =============================================================================
// Constants
// =============================================================================

const SEVERITY_COLORS: Record<IncidentSeverity, string> = {
  critical: '#ff4444',
  warning: '#ffaa00',
  info: '#4488ff',
} as const

function SeverityBadge({ severity }: { severity: IncidentSeverity }) {
  const color = SEVERITY_COLORS[severity]
  return (
    <span
      className="px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-wider font-medium"
      style={{ color, borderColor: color, backgroundColor: '#0f0f0f' }}
    >
      {severity}
    </span>
  )
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 border-b border-[#1a1a1a] last:border-0">
      <span className="text-[9px] text-[#555555] uppercase tracking-wider">{label}</span>
      <span className="text-[10px] text-[#888888] font-mono text-right break-words">{value}</span>
    </div>
  )
}

function ActionButton({
  label,
  variant,
  onClick,
}: {
  label: string
  variant: 'primary' | 'danger' | 'neutral'
  onClick: () => void
}) {
  const styles =
    variant === 'primary'
      ? 'border-[#00ffff] text-[#00ffff] bg-[#111111]'
      : variant === 'danger'
        ? 'border-[#ff4444] text-[#ff4444] bg-[#111111]'
        : 'border-[#222222] text-[#cccccc] bg-[#0f0f0f]'

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-2 py-1 rounded border text-[9px] uppercase tracking-wider',
        styles,
        'hover:border-[#333333] hover:text-[#ffffff] transition-colors',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function setIncidentStatus(_incident: Incident, status: IncidentStatus): Partial<Incident> {
  return {
    status,
  }
}

// =============================================================================
// Main Component
// =============================================================================

export function IncidentDetailModule({ windowId }: ModuleProps) {
  const selectedIncidentId = useIncidentStore((s) => s.selectedIncidentId)
  const incidents = useIncidentStore((s) => s.incidents)
  const updateIncident = useIncidentStore((s) => s.updateIncident)

  const incident = selectedIncidentId ? incidents.get(selectedIncidentId) : undefined

  // Placeholder
  if (!incident) {
    return (
      <div
        className="h-full w-full flex flex-col items-center justify-center bg-[#0a0a0a] p-3"
        data-testid={`module-incident-detail-${windowId}`}
      >
        <div className="w-8 h-8 rounded-full border border-[#333333] flex items-center justify-center mb-2">
          <span className="text-[#444444] text-xs">!</span>
        </div>
        <span className="text-[10px] text-[#555555] uppercase tracking-wider block">
          Select an incident to view details
        </span>
      </div>
    )
  }

  return (
    <div
      className="h-full w-full flex flex-col bg-[#0a0a0a] p-3 overflow-auto"
      data-testid={`module-incident-detail-${windowId}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3 pb-2 border-b border-[#222222]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={incident.severity} />
            <span className="text-xs text-[#cccccc] font-medium truncate">{incident.title}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[9px] text-[#666666] font-mono">
            <span>{incident.timestamp}</span>
            <span className="text-[#333333]">|</span>
            <span>{incident.status.toUpperCase()}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <ActionButton
            label="Acknowledge"
            variant="primary"
            onClick={() => updateIncident(incident.id, setIncidentStatus(incident, 'acknowledged'))}
          />
          <ActionButton
            label="Resolve"
            variant="danger"
            onClick={() => updateIncident(incident.id, setIncidentStatus(incident, 'resolved'))}
          />
          <ActionButton label="Escalate" variant="neutral" onClick={() => {}} />
        </div>
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-2">
        <div className="rounded border border-[#1a1a1a] bg-[#0f0f0f] p-2">
          <FieldRow label="ID" value={incident.id} />
          <FieldRow label="Location" value={incident.location ?? 'N/A'} />
          <FieldRow label="Camera" value={incident.cameraId ?? 'N/A'} />
        </div>

        <div className="rounded border border-[#1a1a1a] bg-[#0f0f0f] p-2">
          <span className="text-[9px] text-[#555555] uppercase tracking-wider">Description</span>
          <p className="mt-2 text-[10px] text-[#cccccc] leading-relaxed">{incident.description}</p>
        </div>

        {incident.cameraId && (
          <div className="mt-1">
            <button
              type="button"
              className="w-full px-2 py-2 rounded border border-[#222222] bg-[#0f0f0f] text-[10px] text-[#00ffff] uppercase tracking-wider hover:border-[#333333] transition-colors"
            >
              View Camera
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
