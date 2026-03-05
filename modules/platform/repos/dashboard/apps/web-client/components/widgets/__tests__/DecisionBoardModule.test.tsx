import { act, fireEvent, render, screen } from '@testing-library/react'

import { DecisionBoardModule } from '../DecisionBoardModule'
import { useDecisionBoardStore, type DecisionVariant } from '@/lib/stores/decision-board-store'

function seedState(overrides: Partial<ReturnType<typeof useDecisionBoardStore.getState>> = {}) {
  const variants: DecisionVariant[] = [
    {
      id: 'var-a',
      label: 'A',
      description: 'Seal corridor and hold perimeter.',
      risks: { structural: 0.4, escape: 0.3, escalation: 0.5 },
      recommendedAction: 'Deploy drone assist and hold.',
    },
    {
      id: 'var-b',
      label: 'B',
      description: 'Fallback to remote lock routine.',
      risks: { structural: 0.2, escape: 0.1, escalation: 0.2 },
      recommendedAction: 'Issue lock and monitor.',
    },
    {
      id: 'var-c',
      label: 'C',
      description: 'Interdict with manual operator takeover.',
      risks: { structural: 0.6, escape: 0.4, escalation: 0.7 },
      recommendedAction: 'Switch to supervised mode.',
    },
    {
      id: 'var-d',
      label: 'D',
      description: 'Delay and continue passive observation.',
      risks: { structural: 0.3, escape: 0.8, escalation: 0.6 },
      recommendedAction: 'Observe and reassess in 30s.',
    },
  ]

  useDecisionBoardStore.setState({
    variants,
    selectedVariant: null,
    hypothesis: {
      description: 'H1: Coordinated breach attempt with diversion.',
      confidence: 0.72,
    },
    countdown: {
      secondsRemaining: 45,
      isRunning: false,
      timeout: 45,
    },
    auditLog: [],
    incidentTitle: 'Sector 7 Perimeter Breach',
    severity: 'critical',
    ...overrides,
  })
}

describe('DecisionBoardModule', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    act(() => {
      seedState()
    })
  })

  afterEach(() => {
    act(() => {
      jest.clearAllTimers()
    })
    jest.useRealTimers()
  })

  it('selects a variant from variant cards', () => {
    render(<DecisionBoardModule windowId="w-db" />)

    fireEvent.click(screen.getByRole('button', { name: 'Select B' }))

    expect(useDecisionBoardStore.getState().selectedVariant?.label).toBe('B')
  })

  it('runs countdown timer in mm:ss format', () => {
    render(<DecisionBoardModule windowId="w-db" />)

    expect(screen.getByText('00:45')).toBeInTheDocument()

    act(() => {
      jest.advanceTimersByTime(2000)
    })

    expect(screen.getByText('00:43')).toBeInTheDocument()
  })

  it('approve/override/escalate actions append audit log entries', () => {
    render(<DecisionBoardModule windowId="w-db" />)

    fireEvent.click(screen.getByRole('button', { name: 'Select A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    fireEvent.click(screen.getByRole('button', { name: 'Override' }))
    fireEvent.click(screen.getByRole('button', { name: 'Escalate' }))

    const actions = useDecisionBoardStore.getState().auditLog.map((entry) => entry.action)

    expect(actions).toContain('approve')
    expect(actions).toContain('override')
    expect(actions).toContain('escalate')
  })

  it('auto-executes top variant on timeout', () => {
    act(() => {
      seedState({
        countdown: { secondsRemaining: 2, isRunning: false, timeout: 2 },
      })
    })

    render(<DecisionBoardModule windowId="w-db" />)

    act(() => {
      jest.advanceTimersByTime(2000)
    })

    expect(useDecisionBoardStore.getState().selectedVariant?.label).toBe('B')
    expect(useDecisionBoardStore.getState().auditLog.some((e) => e.action === 'auto_execute')).toBe(
      true
    )
  })
})
