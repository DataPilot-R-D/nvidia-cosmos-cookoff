/**
 * TrustDashboardModule Tests — Category breakdown, Override panel, Thresholds
 *
 * @see Issue #38 — T5.2 Trust UI v1 FE
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { TrustDashboardModule } from '../TrustDashboardModule'
import {
  useTrustStore,
  type TrustScore,
  type CategoryScore,
  type TrustOverride,
} from '@/lib/stores/trust-store'

jest.mock('@/lib/stores/websocket-store', () => ({
  useWebSocketStore: jest.fn((selector: (s: { socket: null }) => unknown) => {
    if (typeof selector === 'function') return selector({ socket: null })
    return { socket: null }
  }),
}))

const mockScore: TrustScore = {
  id: 'ts-1',
  robotId: 'robot-alpha',
  confidenceScore: 75,
  riskLevel: 'medium',
  handoverStatus: 'supervised',
  reasons: '["Path deviation detected"]',
  recommendations: '["Increase monitoring"]',
  sensorHealth: '{"lidar": 90, "camera": 60}',
  metadata: null,
  createdAt: '2026-02-19T10:00:00Z',
  updatedAt: '2026-02-19T10:00:00Z',
}

const mockCategories: CategoryScore[] = [
  {
    id: 'c1',
    robotId: 'robot-alpha',
    category: 'navigation',
    score: 85,
    factors: [{ name: 'path_accuracy', weight: 1, value: 85 }],
    updatedAt: '',
  },
  {
    id: 'c2',
    robotId: 'robot-alpha',
    category: 'manipulation',
    score: 60,
    factors: [{ name: 'grip_success', weight: 1, value: 60 }],
    updatedAt: '',
  },
  {
    id: 'c3',
    robotId: 'robot-alpha',
    category: 'perception',
    score: 40,
    factors: [{ name: 'detection_rate', weight: 1, value: 40 }],
    updatedAt: '',
  },
]

const mockOverride: TrustOverride = {
  id: 'ov-1',
  robotId: 'robot-alpha',
  category: null,
  previousScore: 75,
  overrideScore: 30,
  reason: 'Robot acting erratically',
  operatorId: 'op-1',
  expiresAt: null,
  active: true,
  createdAt: '2026-02-19T10:00:00Z',
}

// Mock fetch
const mockFetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [] })
beforeAll(() => {
  global.fetch = mockFetch
})
afterEach(() => {
  mockFetch.mockClear()
})

function setup(opts?: {
  categories?: CategoryScore[]
  overrides?: TrustOverride[]
  selected?: boolean
}) {
  const store = useTrustStore.getState()
  store.setScores([mockScore])
  if (opts?.categories) store.setCategories('robot-alpha', opts.categories)
  if (opts?.overrides) store.setOverrides('robot-alpha', opts.overrides)
  if (opts?.selected) store.setSelectedRobot('robot-alpha')
  return render(<TrustDashboardModule />)
}

describe('TrustDashboard — Robot List', () => {
  beforeEach(() => {
    const s = useTrustStore.getState()
    s.setScores([])
    s.setSelectedRobot(null)
    s.setThresholds({ green: 80, yellow: 50 })
    mockFetch.mockResolvedValue({ ok: true, json: async () => [] })
  })

  it('renders robot card with score', () => {
    setup()
    expect(screen.getByText(/robot-alpha/)).toBeInTheDocument()
    expect(screen.getAllByText('75%').length).toBeGreaterThanOrEqual(1)
  })

  it('shows override lock icon when override active', () => {
    setup({ overrides: [mockOverride] })
    expect(screen.getByTitle('Score override active')).toBeInTheDocument()
  })

  it('shows 1 robot count', () => {
    setup()
    expect(screen.getByText('1 robot')).toBeInTheDocument()
  })
})

describe('TrustDashboard — Category Breakdown', () => {
  beforeEach(() => {
    useTrustStore.getState().setScores([])
    useTrustStore.getState().setSelectedRobot(null)
  })

  it('renders category bars when robot selected', () => {
    setup({ categories: mockCategories, selected: true })
    expect(screen.getByText(/Navigation/)).toBeInTheDocument()
    expect(screen.getByText(/Manipulation/)).toBeInTheDocument()
    expect(screen.getByText(/Perception/)).toBeInTheDocument()
  })

  it('shows category scores', () => {
    setup({ categories: mockCategories, selected: true })
    // Scores may appear in multiple places (card + detail)
    expect(screen.getAllByText('85%').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('60%').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('40%').length).toBeGreaterThanOrEqual(1)
  })

  it('shows factor labels', () => {
    setup({ categories: mockCategories, selected: true })
    expect(screen.getByText(/path_accuracy/)).toBeInTheDocument()
  })
})

describe('TrustDashboard — Override Panel', () => {
  beforeEach(() => {
    useTrustStore.getState().setScores([])
    useTrustStore.getState().setSelectedRobot(null)
  })

  it('shows override active indicator', () => {
    setup({ overrides: [mockOverride], selected: true })
    expect(screen.getByText(/Locked at 30%/)).toBeInTheDocument()
    expect(screen.getByText(/Robot acting erratically/)).toBeInTheDocument()
  })

  it('shows Set Override button when no override', () => {
    setup({ selected: true })
    expect(screen.getByText('Set Override')).toBeInTheDocument()
  })

  it('expands override form on click', () => {
    setup({ selected: true })
    fireEvent.click(screen.getByText('Set Override'))
    expect(screen.getByTestId('override-score-slider')).toBeInTheDocument()
    expect(screen.getByTestId('override-reason')).toBeInTheDocument()
    expect(screen.getByTestId('override-submit')).toBeInTheDocument()
  })
})

describe('TrustDashboard — Thresholds', () => {
  it('uses default thresholds', () => {
    const { thresholds } = useTrustStore.getState()
    expect(thresholds.green).toBe(80)
    expect(thresholds.yellow).toBe(50)
  })

  it('can update thresholds', () => {
    useTrustStore.getState().setThresholds({ green: 90, yellow: 60 })
    expect(useTrustStore.getState().thresholds.green).toBe(90)
    expect(useTrustStore.getState().thresholds.yellow).toBe(60)
  })
})
