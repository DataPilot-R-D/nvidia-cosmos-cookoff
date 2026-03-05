import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReplayReviewModule } from '../ReplayReviewModule'
import { useEvidenceStore, type Evidence } from '@/lib/stores/evidence-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'

jest.mock('@/lib/stores/websocket-store', () => ({
  useWebSocketStore: jest.fn(),
}))

const mockEvidence = (overrides: Partial<Evidence> = {}): Evidence => ({
  id: 'ev-1',
  type: 'video_clip',
  title: 'Camera 1 clip',
  description: 'Motion detected',
  incidentId: 'inc-1',
  missionId: 'mis-1',
  robotId: 'robot-abc',
  cameraSourceId: 'cam-front',
  capturedAt: '2026-02-11T08:00:00Z',
  mediaUrl: 'rtsp://192.168.1.10/stream1',
  startOffset: 10,
  endOffset: 25,
  metadata: JSON.stringify({ confidence: 0.95 }),
  createdAt: '2026-02-11T08:00:00Z',
  updatedAt: '2026-02-11T08:00:00Z',
  ...overrides,
})

describe('ReplayReviewModule', () => {
  beforeEach(() => {
    useEvidenceStore.getState().setEntries([])
    useEvidenceStore.getState().clearFilters()
    useEvidenceStore.getState().setSelected(null)
    ;(useWebSocketStore as unknown as jest.Mock).mockImplementation((selector: unknown) => {
      if (typeof selector === 'function') {
        return (selector as (s: { socket: null }) => unknown)({ socket: null })
      }
      return null
    })
  })

  it('renders empty state', () => {
    render(<ReplayReviewModule />)
    expect(screen.getByText('No evidence entries')).toBeInTheDocument()
  })

  it('renders evidence entries on timeline', () => {
    useEvidenceStore
      .getState()
      .setEntries([
        mockEvidence({ id: '1', title: 'Camera 1 clip', type: 'video_clip' }),
        mockEvidence({ id: '2', title: 'Sensor reading', type: 'sensor_log' }),
      ])

    render(<ReplayReviewModule />)
    expect(screen.getByText('Camera 1 clip')).toBeInTheDocument()
    expect(screen.getByText('Sensor reading')).toBeInTheDocument()
    expect(screen.getByText('2 events')).toBeInTheDocument()
  })

  it('shows detail panel when entry is selected', () => {
    useEvidenceStore.getState().setEntries([
      mockEvidence({
        id: '1',
        title: 'Alert clip',
        mediaUrl: 'rtsp://10.0.0.1/cam',
        startOffset: 5,
        endOffset: 15,
      }),
    ])

    render(<ReplayReviewModule />)
    fireEvent.click(screen.getByText('Alert clip'))

    expect(screen.getByText('Media Source')).toBeInTheDocument()
    expect(screen.getByText('rtsp://10.0.0.1/cam')).toBeInTheDocument()
    expect(screen.getByText(/Start: 5s/)).toBeInTheDocument()
    expect(screen.getByText(/End: 15s/)).toBeInTheDocument()
  })

  it('shows metadata in detail panel', () => {
    useEvidenceStore
      .getState()
      .setEntries([mockEvidence({ id: '1', title: 'With meta', metadata: '{"score":42}' })])

    render(<ReplayReviewModule />)
    fireEvent.click(screen.getByText('With meta'))

    expect(screen.getByText('Metadata')).toBeInTheDocument()
  })

  it('filters by type', () => {
    useEvidenceStore
      .getState()
      .setEntries([
        mockEvidence({ id: '1', title: 'Video A', type: 'video_clip' }),
        mockEvidence({ id: '2', title: 'Note B', type: 'note' }),
      ])

    render(<ReplayReviewModule />)

    // Click snapshot filter (📝 for note)
    fireEvent.click(screen.getByRole('button', { name: '📝' }))

    expect(screen.queryByText('Video A')).not.toBeInTheDocument()
    expect(screen.getByText('Note B')).toBeInTheDocument()
  })

  it('shows event count', () => {
    useEvidenceStore
      .getState()
      .setEntries([mockEvidence({ id: '1' }), mockEvidence({ id: '2' }), mockEvidence({ id: '3' })])

    render(<ReplayReviewModule />)
    expect(screen.getByText('3 events')).toBeInTheDocument()
  })

  it('shows robot id on timeline entries', () => {
    useEvidenceStore
      .getState()
      .setEntries([mockEvidence({ id: '1', robotId: 'robot-xyz-12345678' })])

    render(<ReplayReviewModule />)
    expect(screen.getByText('🤖 robot-xy')).toBeInTheDocument()
  })
})
