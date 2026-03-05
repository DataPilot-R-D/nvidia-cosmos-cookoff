/**
 * IncidentListModule Component
 *
 * SOC-style incident list with filtering and selection.
 */

'use client'

import type { ModuleProps } from './ModuleRegistry'
import {
  useIncidentStore,
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

function FilterButton({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'px-2 py-1 rounded border text-[9px] uppercase tracking-wider',
        active
          ? 'border-[#00ffff] text-[#00ffff] bg-[#111111]'
          : 'border-[#222222] text-[#666666] bg-[#0f0f0f]',
        'hover:border-[#333333] hover:text-[#888888] transition-colors',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function IncidentListModule({ windowId }: ModuleProps) {
  const getFilteredIncidents = useIncidentStore((s) => s.getFilteredIncidents)
  const selectedIncidentId = useIncidentStore((s) => s.selectedIncidentId)
  const filters = useIncidentStore((s) => s.filters)
  const setSelectedIncident = useIncidentStore((s) => s.setSelectedIncident)
  const setFilter = useIncidentStore((s) => s.setFilter)

  const incidents = getFilteredIncidents()

  const setSeverity = (severity?: IncidentSeverity) => setFilter({ severity })
  const setStatus = (status?: IncidentStatus) => setFilter({ status })

  return (
    <div
      className="h-full w-full flex flex-col bg-[#0a0a0a] p-3 overflow-auto"
      data-testid={`module-incident-list-${windowId}`}
    >
      {/* Filters */}
      <div className="flex flex-col gap-2 mb-3 pb-2 border-b border-[#222222]">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#666666] uppercase tracking-wider font-medium">
            Severity
          </span>
          <div className="flex items-center gap-1.5">
            <FilterButton
              label="All"
              active={!filters.severity}
              onClick={() => setSeverity(undefined)}
            />
            <FilterButton
              label="Critical"
              active={filters.severity === 'critical'}
              onClick={() => setSeverity('critical')}
            />
            <FilterButton
              label="Warning"
              active={filters.severity === 'warning'}
              onClick={() => setSeverity('warning')}
            />
            <FilterButton
              label="Info"
              active={filters.severity === 'info'}
              onClick={() => setSeverity('info')}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#666666] uppercase tracking-wider font-medium">
            Status
          </span>
          <div className="flex items-center gap-1.5">
            <FilterButton
              label="All"
              active={!filters.status}
              onClick={() => setStatus(undefined)}
            />
            <FilterButton
              label="New"
              active={filters.status === 'new'}
              onClick={() => setStatus('new')}
            />
            <FilterButton
              label="Acknowledged"
              active={filters.status === 'acknowledged'}
              onClick={() => setStatus('acknowledged')}
            />
            <FilterButton
              label="Resolved"
              active={filters.status === 'resolved'}
              onClick={() => setStatus('resolved')}
            />
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex flex-col gap-1">
        {incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <span className="text-[10px] text-[#555555] uppercase tracking-wider">
              No incidents match filters
            </span>
          </div>
        ) : (
          incidents.map((incident) => {
            const selected = incident.id === selectedIncidentId
            return (
              <button
                key={incident.id}
                type="button"
                onClick={() => setSelectedIncident(incident.id)}
                data-testid={`incident-row-${incident.id}`}
                data-selected={selected ? 'true' : 'false'}
                className={[
                  'w-full text-left rounded border px-2 py-2',
                  selected ? 'border-[#00ffff] bg-[#111111]' : 'border-[#1a1a1a] bg-[#0f0f0f]',
                  'hover:border-[#333333] transition-colors',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <SeverityBadge severity={incident.severity} />
                    <span className="text-xs text-[#cccccc] font-medium truncate">
                      {incident.title}
                    </span>
                  </div>
                  <span className="text-[9px] text-[#666666] font-mono whitespace-nowrap">
                    {incident.timestamp}
                  </span>
                </div>

                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-[#555555] font-mono">
                    {incident.status.toUpperCase()}
                  </span>
                  <span className="text-[9px] text-[#444444] font-mono">{incident.id}</span>
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
