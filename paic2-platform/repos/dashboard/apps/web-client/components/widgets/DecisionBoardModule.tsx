'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import type { ModuleProps } from './ModuleRegistry'
import { formatCountdown, useDecisionBoardStore } from '@/lib/stores/decision-board-store'

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'text-red-400 border-red-400/50 bg-red-400/10',
  warning: 'text-yellow-400 border-yellow-400/50 bg-yellow-400/10',
  info: 'text-cyan-400 border-cyan-400/50 bg-cyan-400/10',
}

function riskBarColor(value: number): string {
  if (value < 0.3) return 'bg-green-500'
  if (value < 0.7) return 'bg-yellow-500'
  return 'bg-red-500'
}

function RiskGauge({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[9px] uppercase tracking-wide text-[#888888] font-mono">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 w-full rounded bg-[#1a1a1a] overflow-hidden">
        <div className={`h-full ${riskBarColor(value)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function DecisionBoardModule({ windowId }: ModuleProps) {
  const variants = useDecisionBoardStore((s) => s.variants)
  const selectedVariant = useDecisionBoardStore((s) => s.selectedVariant)
  const hypothesis = useDecisionBoardStore((s) => s.hypothesis)
  const countdown = useDecisionBoardStore((s) => s.countdown)
  const auditLog = useDecisionBoardStore((s) => s.auditLog)
  const incidentTitle = useDecisionBoardStore((s) => s.incidentTitle)
  const severity = useDecisionBoardStore((s) => s.severity)

  const selectVariant = useDecisionBoardStore((s) => s.selectVariant)
  const approve = useDecisionBoardStore((s) => s.approve)
  const override = useDecisionBoardStore((s) => s.override)
  const escalate = useDecisionBoardStore((s) => s.escalate)
  const startCountdown = useDecisionBoardStore((s) => s.startCountdown)
  const tickCountdown = useDecisionBoardStore((s) => s.tickCountdown)

  const [isAuditOpen, setIsAuditOpen] = useState(true)
  const didStartCountdown = useRef(false)

  useEffect(() => {
    if (didStartCountdown.current) return
    didStartCountdown.current = true
    startCountdown(countdown.timeout)
  }, [countdown.timeout, startCountdown])

  useEffect(() => {
    if (!countdown.isRunning) return undefined

    const timerId = window.setInterval(() => {
      tickCountdown()
    }, 1000)

    return () => {
      window.clearInterval(timerId)
    }
  }, [countdown.isRunning, tickCountdown])

  const confidenceWidth = useMemo(() => {
    const clamped = Math.max(0, Math.min(1, hypothesis.confidence))
    return `${Math.round(clamped * 100)}%`
  }, [hypothesis.confidence])

  return (
    <div
      className="h-full w-full overflow-auto bg-[#0a0a0a] border border-[#1a1a1a] text-[#cccccc] p-3"
      data-testid={`module-decision-board-${windowId}`}
    >
      <div className="space-y-3">
        <div className="rounded border border-[#1a1a1a] bg-[#111111] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-medium truncate">{incidentTitle}</h2>
            <span
              className={`px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-wider font-mono ${SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info}`}
            >
              {severity}
            </span>
          </div>

          <div className="text-[10px] text-[#888888]">{hypothesis.description}</div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[9px] text-[#888888] font-mono">
              <span>H1 confidence</span>
              <span>{hypothesis.confidence.toFixed(2)}</span>
            </div>
            <div className="h-1.5 rounded bg-[#1a1a1a] overflow-hidden">
              <div className="h-full bg-cyan-500" style={{ width: confidenceWidth }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {variants.map((variant) => {
            const isSelected = selectedVariant?.id === variant.id
            return (
              <div
                key={variant.id}
                className={`rounded border p-2 bg-[#111111] ${
                  isSelected ? 'border-cyan-500/70' : 'border-[#1a1a1a]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold font-mono">
                    Variant {variant.label}
                  </span>
                  <span className="text-[9px] text-[#888888] font-mono">{variant.id}</span>
                </div>

                <p className="mt-1 text-[10px] text-[#888888] leading-relaxed">
                  {variant.description}
                </p>

                <div className="mt-2 space-y-1.5">
                  <RiskGauge label="structural" value={variant.risks.structural} />
                  <RiskGauge label="escape" value={variant.risks.escape} />
                  <RiskGauge label="escalation" value={variant.risks.escalation} />
                </div>

                <div className="mt-2 text-[9px] text-[#888888] border border-[#1a1a1a] rounded p-1.5">
                  <span className="text-[#cccccc] uppercase tracking-wide">recommended:</span>{' '}
                  {variant.recommendedAction}
                </div>

                <button
                  type="button"
                  onClick={() => selectVariant(variant.id)}
                  className={`mt-2 w-full rounded border px-2 py-1 text-[10px] uppercase tracking-wider font-mono transition-colors ${
                    isSelected
                      ? 'border-cyan-500 text-cyan-300 bg-cyan-500/10'
                      : 'border-[#333333] text-[#cccccc] hover:border-[#555555]'
                  }`}
                >
                  Select {variant.label}
                </button>
              </div>
            )
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <div className="rounded border border-[#1a1a1a] bg-[#111111] p-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#888888] uppercase tracking-wider">
                HOTL Timer
              </span>
              <span className="text-[9px] text-[#888888] font-mono">
                timeout {countdown.timeout}s
              </span>
            </div>
            <div
              className={`text-[13px] font-mono ${countdown.secondsRemaining < 10 ? 'text-red-400' : 'text-[#cccccc]'}`}
            >
              {formatCountdown(countdown.secondsRemaining)}
            </div>
          </div>

          <div className="rounded border border-[#1a1a1a] bg-[#111111] p-2 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={approve}
              className="rounded border border-green-500/50 bg-green-500/10 text-green-300 text-[10px] uppercase tracking-wider font-mono py-1"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={override}
              className="rounded border border-yellow-500/50 bg-yellow-500/10 text-yellow-300 text-[10px] uppercase tracking-wider font-mono py-1"
            >
              Override
            </button>
            <button
              type="button"
              onClick={escalate}
              className="rounded border border-red-500/50 bg-red-500/10 text-red-300 text-[10px] uppercase tracking-wider font-mono py-1"
            >
              Escalate
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
          <div className="rounded border border-[#1a1a1a] bg-[#1a1a1a] min-h-24 flex items-center justify-center text-[10px] text-[#888888] font-mono">
            Live Feed - WebRTC
          </div>
          <div className="rounded border border-[#1a1a1a] bg-[#1a1a1a] min-h-24 flex items-center justify-center text-[10px] text-[#888888] font-mono">
            Map - Robot Position
          </div>
        </div>

        <div className="rounded border border-[#1a1a1a] bg-[#111111] p-2">
          <button
            type="button"
            onClick={() => setIsAuditOpen((open) => !open)}
            className="w-full flex items-center justify-between text-[10px] uppercase tracking-wider text-[#cccccc]"
          >
            <span>Audit Trail</span>
            <span className="text-[9px] text-[#888888] font-mono">{auditLog.length} entries</span>
          </button>

          {isAuditOpen && (
            <div className="mt-2 space-y-1 max-h-36 overflow-auto">
              {auditLog.length === 0 ? (
                <div className="text-[9px] text-[#888888] font-mono">No decision events yet.</div>
              ) : (
                auditLog.map((entry, index) => (
                  <div
                    key={`${entry.timestamp}-${index}`}
                    className="text-[9px] font-mono text-[#888888]"
                  >
                    <span className="text-[#cccccc]">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>{' '}
                    <span className="uppercase">{entry.action}</span> - {entry.details}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
