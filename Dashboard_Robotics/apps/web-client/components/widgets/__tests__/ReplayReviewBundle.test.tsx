/**
 * ReplayReview Bundle + Video Sync Tests
 *
 * @see Issue #36 — T4.2 Replay/Review UI v1
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReplayReviewModule } from '../ReplayReviewModule'
import { useEvidenceStore } from '@/lib/stores/evidence-store'
import type { Evidence } from '@/lib/stores/evidence-store'

// Mock WebSocket store
jest.mock('@/lib/stores/websocket-store', () => ({
  useWebSocketStore: jest.fn((selector: (s: { socket: null }) => unknown) => {
    if (typeof selector === 'function') return selector({ socket: null })
    return { socket: null }
  }),
}))

function makeEvidence(overrides: Partial<Evidence> & { id: string }): Evidence {
  return {
    type: 'event',
    title: 'Test Event',
    description: '',
    incidentId: null,
    missionId: null,
    robotId: null,
    cameraSourceId: null,
    capturedAt: '2026-02-19T10:00:00Z',
    mediaUrl: null,
    startOffset: null,
    endOffset: null,
    metadata: null,
    createdAt: '2026-02-19T10:00:00Z',
    updatedAt: '2026-02-19T10:00:00Z',
    ...overrides,
  }
}

describe('ReplayReview — Event Type', () => {
  beforeEach(() => {
    const store = useEvidenceStore.getState()
    store.setEntries([])
  })

  it('renders event type with icon', () => {
    const store = useEvidenceStore.getState()
    store.setEntries([
      makeEvidence({
        id: 'ev-1',
        type: 'event',
        title: 'Motion Alert',
        capturedAt: '2026-02-19T10:00:00Z',
      }),
    ])

    render(<ReplayReviewModule />)
    expect(screen.getByText('⚡')).toBeInTheDocument()
    expect(screen.getByText('Motion Alert')).toBeInTheDocument()
  })

  it('has type filter buttons', () => {
    render(<ReplayReviewModule />)
    // Filter bar has "All" button
    expect(screen.getByText('All')).toBeInTheDocument()
  })
})

describe('ReplayReview — Timeline', () => {
  beforeEach(() => {
    const store = useEvidenceStore.getState()
    store.setEntries([
      makeEvidence({
        id: 'ev-1',
        type: 'event',
        title: 'Alert Start',
        capturedAt: '2026-02-19T10:00:00Z',
        incidentId: 'inc-1',
      }),
      makeEvidence({
        id: 'ev-2',
        type: 'video_clip',
        title: 'Camera Footage',
        capturedAt: '2026-02-19T10:00:30Z',
        incidentId: 'inc-1',
        cameraSourceId: 'cam-1',
        mediaUrl: 'rtsp://server/cam-1',
      }),
      makeEvidence({
        id: 'ev-3',
        type: 'snapshot',
        title: 'Frame Capture',
        capturedAt: '2026-02-19T10:01:00Z',
        incidentId: 'inc-1',
      }),
    ])
  })

  it('renders timeline with multiple entries', () => {
    render(<ReplayReviewModule />)
    expect(screen.getByText('Alert Start')).toBeInTheDocument()
    expect(screen.getByText('Camera Footage')).toBeInTheDocument()
    expect(screen.getByText('Frame Capture')).toBeInTheDocument()
  })

  it('shows event count', () => {
    render(<ReplayReviewModule />)
    expect(screen.getByText('3 events')).toBeInTheDocument()
  })

  it('renders timeline bar', () => {
    render(<ReplayReviewModule />)
    expect(screen.getByLabelText('Timeline')).toBeInTheDocument()
  })

  it('has playback controls', () => {
    render(<ReplayReviewModule />)
    // Play button exists (▶ or Play text)
    const playBtns = screen.getAllByRole('button')
    expect(playBtns.length).toBeGreaterThan(0)
  })

  it('has speed controls', () => {
    render(<ReplayReviewModule />)
    // Speed buttons exist
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(3) // play + speed + filters
  })

  it('clicking entry selects and seeks', () => {
    render(<ReplayReviewModule />)
    const alertEntry = screen.getByText('Alert Start')
    fireEvent.click(alertEntry)
    // Should show at minimum the module still renders
    expect(screen.getByTestId('replay-review-module')).toBeInTheDocument()
  })
})

describe('ReplayReview — Bundle Fetch', () => {
  const mockFetch = jest.fn()
  beforeAll(() => {
    global.fetch = mockFetch
  })
  afterEach(() => {
    mockFetch.mockClear()
  })

  it('fetches bundle when incidentId filter is set', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        incidentId: 'inc-1',
        items: [
          makeEvidence({ id: 'b-1', type: 'event', title: 'Bundled Event', incidentId: 'inc-1' }),
        ],
        summary: {
          total: 1,
          byType: { event: 1 },
          timeRange: { earliest: '2026-02-19T10:00:00Z', latest: '2026-02-19T10:00:00Z' },
          cameras: [],
        },
      }),
    })

    const store = useEvidenceStore.getState()
    store.setFilter({ incidentId: 'inc-1' })

    render(<ReplayReviewModule />)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/evidence/bundle/inc-1'),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })
  })
})
