import { create } from 'zustand'
import type { Socket } from 'socket.io-client'

import { useWebSocketStore } from './websocket-store'

export type DecisionSeverity = 'critical' | 'warning' | 'info'

export interface DecisionVariant {
  id: string
  label: 'A' | 'B' | 'C' | 'D'
  description: string
  risks: {
    structural: number
    escape: number
    escalation: number
  }
  recommendedAction: string
}

export interface DecisionHypothesis {
  description: string
  confidence: number
}

export interface DecisionCountdown {
  secondsRemaining: number
  isRunning: boolean
  timeout: number
}

export interface DecisionAuditEntry {
  timestamp: string
  action: string
  details: string
}

export interface DecisionBoardState {
  variants: DecisionVariant[]
  selectedVariant: DecisionVariant | null
  hypothesis: DecisionHypothesis
  countdown: DecisionCountdown
  auditLog: DecisionAuditEntry[]
  incidentTitle: string
  severity: DecisionSeverity
}

export interface DecisionIncidentData {
  variants?: DecisionVariant[]
  hypothesis?: DecisionHypothesis
  incidentTitle?: string
  severity?: DecisionSeverity
  timeout?: number
}

export interface DecisionBoardActions {
  selectVariant: (variantId: string) => void
  approve: () => void
  override: () => void
  escalate: () => void
  startCountdown: (timeout?: number) => void
  stopCountdown: () => void
  tickCountdown: () => void
  addAuditEntry: (entry: Omit<DecisionAuditEntry, 'timestamp'>) => void
  setIncidentData: (data: DecisionIncidentData) => void
  autoExecute: () => void
}

const DEFAULT_VARIANTS: DecisionVariant[] = [
  {
    id: 'var-a',
    label: 'A',
    description: 'Seal east corridor and dispatch nearest robot pair.',
    risks: { structural: 0.42, escape: 0.26, escalation: 0.51 },
    recommendedAction: 'Deploy perimeter intercept and hold checkpoints.',
  },
  {
    id: 'var-b',
    label: 'B',
    description: 'Soft lockdown with staged drone confirmation sweep.',
    risks: { structural: 0.23, escape: 0.18, escalation: 0.27 },
    recommendedAction: 'Initiate remote lock routine and monitor live feeds.',
  },
  {
    id: 'var-c',
    label: 'C',
    description: 'Immediate manual takeover with hard corridor block.',
    risks: { structural: 0.66, escape: 0.34, escalation: 0.74 },
    recommendedAction: 'Switch to supervised mode and gate all exits.',
  },
  {
    id: 'var-d',
    label: 'D',
    description: 'Passive observe-and-track with delayed intervention window.',
    risks: { structural: 0.31, escape: 0.77, escalation: 0.58 },
    recommendedAction: 'Track movement and reassess after recon update.',
  },
]

const DEFAULT_TIMEOUT_SECONDS = 45

const initialState: DecisionBoardState = {
  variants: DEFAULT_VARIANTS,
  selectedVariant: null,
  hypothesis: {
    description: 'H1: Coordinated breach attempt with diversion in sector 7.',
    confidence: 0.72,
  },
  countdown: {
    secondsRemaining: DEFAULT_TIMEOUT_SECONDS,
    isRunning: false,
    timeout: DEFAULT_TIMEOUT_SECONDS,
  },
  auditLog: [],
  incidentTitle: 'Sector 7 Perimeter Breach',
  severity: 'critical',
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function getTopVariant(variants: DecisionVariant[]): DecisionVariant | null {
  if (variants.length === 0) return null

  return [...variants].sort((a, b) => {
    const aScore = a.risks.structural + a.risks.escape + a.risks.escalation
    const bScore = b.risks.structural + b.risks.escape + b.risks.escalation
    if (aScore !== bScore) return aScore - bScore
    return a.label.localeCompare(b.label)
  })[0]
}

export function formatCountdown(secondsRemaining: number): string {
  const safe = Math.max(0, Math.floor(secondsRemaining))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export const useDecisionBoardStore = create<DecisionBoardState & DecisionBoardActions>(
  (set, get) => ({
    ...initialState,

    selectVariant: (variantId: string) => {
      const variant = get().variants.find((item) => item.id === variantId)
      if (!variant) return

      set({ selectedVariant: variant })
      get().addAuditEntry({
        action: 'select_variant',
        details: `Selected variant ${variant.label}`,
      })
    },

    approve: () => {
      const selected = get().selectedVariant
      get().addAuditEntry({
        action: 'approve',
        details: selected
          ? `Approved variant ${selected.label}`
          : 'Approved without variant selection',
      })
    },

    override: () => {
      const selected = get().selectedVariant
      get().addAuditEntry({
        action: 'override',
        details: selected
          ? `Override requested for variant ${selected.label}`
          : 'Override requested',
      })
    },

    escalate: () => {
      get().addAuditEntry({
        action: 'escalate',
        details: 'Escalated decision to supervisory command',
      })
    },

    startCountdown: (timeout?: number) =>
      set((state) => {
        const nextTimeout =
          typeof timeout === 'number' && timeout > 0 ? Math.floor(timeout) : state.countdown.timeout

        return {
          countdown: {
            timeout: nextTimeout,
            secondsRemaining: nextTimeout,
            isRunning: true,
          },
        }
      }),

    stopCountdown: () =>
      set((state) => ({
        countdown: {
          ...state.countdown,
          isRunning: false,
        },
      })),

    tickCountdown: () => {
      const { countdown } = get()
      if (!countdown.isRunning) return

      if (countdown.secondsRemaining <= 1) {
        set({
          countdown: {
            ...countdown,
            secondsRemaining: 0,
            isRunning: false,
          },
        })
        get().autoExecute()
        return
      }

      set({
        countdown: {
          ...countdown,
          secondsRemaining: countdown.secondsRemaining - 1,
        },
      })
    },

    addAuditEntry: (entry) =>
      set((state) => ({
        auditLog: [{ timestamp: new Date().toISOString(), ...entry }, ...state.auditLog].slice(
          0,
          200
        ),
      })),

    setIncidentData: (data) =>
      set((state) => ({
        variants: data.variants ?? state.variants,
        selectedVariant:
          data.variants && state.selectedVariant
            ? (data.variants.find((v) => v.id === state.selectedVariant?.id) ?? null)
            : state.selectedVariant,
        hypothesis: data.hypothesis
          ? {
              description: data.hypothesis.description,
              confidence: clamp01(data.hypothesis.confidence),
            }
          : state.hypothesis,
        incidentTitle: data.incidentTitle ?? state.incidentTitle,
        severity: data.severity ?? state.severity,
        countdown:
          typeof data.timeout === 'number' && data.timeout > 0
            ? {
                timeout: Math.floor(data.timeout),
                secondsRemaining: Math.floor(data.timeout),
                isRunning: false,
              }
            : state.countdown,
      })),

    autoExecute: () => {
      const topVariant = getTopVariant(get().variants)
      if (!topVariant) return

      set({ selectedVariant: topVariant })
      get().addAuditEntry({
        action: 'auto_execute',
        details: `HOTL timeout reached, auto-selected variant ${topVariant.label}`,
      })
    },
  })
)

interface DecisionBoardUpdatePayload {
  topic?: string
  incidentTitle?: string
  severity?: DecisionSeverity
  hypothesis?: DecisionHypothesis
  variants?: DecisionVariant[]
  timeout?: number
}

let boundSocket: Socket | null = null
let onUpdateHandler: ((payload: DecisionBoardUpdatePayload) => void) | null = null

function bindDecisionBoardSocket(socket: Socket | null) {
  if (boundSocket && onUpdateHandler) {
    boundSocket.off('decision_board_update', onUpdateHandler)
    boundSocket.emit('ros_unsubscribe', { topic: 'decision_board' })
  }

  boundSocket = socket

  if (!boundSocket) {
    onUpdateHandler = null
    return
  }

  onUpdateHandler = (payload: DecisionBoardUpdatePayload) => {
    if (payload?.topic && payload.topic !== 'decision_board') return

    useDecisionBoardStore.getState().setIncidentData({
      incidentTitle: payload.incidentTitle,
      severity: payload.severity,
      hypothesis: payload.hypothesis,
      variants: payload.variants,
      timeout: payload.timeout,
    })
    useDecisionBoardStore
      .getState()
      .addAuditEntry({ action: 'decision_board_update', details: 'Received live board update' })
  }

  boundSocket.emit('ros_subscribe', { topic: 'decision_board' })
  boundSocket.on('decision_board_update', onUpdateHandler)
}

bindDecisionBoardSocket(useWebSocketStore.getState().socket)

useWebSocketStore.subscribe((state, prevState) => {
  if (state.socket === prevState.socket) return
  bindDecisionBoardSocket(state.socket)
})

export type DecisionBoardStore = typeof useDecisionBoardStore
