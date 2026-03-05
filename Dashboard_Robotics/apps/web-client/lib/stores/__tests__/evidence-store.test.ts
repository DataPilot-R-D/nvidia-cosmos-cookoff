import { useEvidenceStore, type Evidence } from '../evidence-store'

const mockEvidence = (overrides: Partial<Evidence> = {}): Evidence => ({
  id: 'ev-1',
  type: 'video_clip',
  title: 'Test clip',
  description: '',
  incidentId: null,
  missionId: null,
  robotId: null,
  cameraSourceId: null,
  capturedAt: '2026-02-11T08:00:00Z',
  mediaUrl: null,
  startOffset: null,
  endOffset: null,
  metadata: null,
  createdAt: '2026-02-11T08:00:00Z',
  updatedAt: '2026-02-11T08:00:00Z',
  ...overrides,
})

describe('evidence-store', () => {
  beforeEach(() => {
    useEvidenceStore.getState().setEntries([])
    useEvidenceStore.getState().clearFilters()
    useEvidenceStore.getState().setSelected(null)
  })

  it('sets and retrieves entries', () => {
    const entries = [mockEvidence({ id: '1' }), mockEvidence({ id: '2' })]
    useEvidenceStore.getState().setEntries(entries)

    const map = useEvidenceStore.getState().entries
    expect(map.size).toBe(2)
    expect(map.get('1')?.id).toBe('1')
  })

  it('upserts entry', () => {
    useEvidenceStore.getState().setEntries([mockEvidence({ id: '1', title: 'Original' })])
    useEvidenceStore.getState().upsertEntry(mockEvidence({ id: '1', title: 'Updated' }))

    expect(useEvidenceStore.getState().entries.get('1')?.title).toBe('Updated')
  })

  it('removes entry', () => {
    useEvidenceStore.getState().setEntries([mockEvidence({ id: '1' }), mockEvidence({ id: '2' })])
    useEvidenceStore.getState().removeEntry('1')

    expect(useEvidenceStore.getState().entries.size).toBe(1)
    expect(useEvidenceStore.getState().entries.has('1')).toBe(false)
  })

  it('sets and clears filters', () => {
    useEvidenceStore.getState().setFilter({ type: 'snapshot', robotId: 'r1' })
    expect(useEvidenceStore.getState().filters.type).toBe('snapshot')

    useEvidenceStore.getState().clearFilters()
    expect(useEvidenceStore.getState().filters).toEqual({})
  })

  it('getFilteredEntries filters by type', () => {
    useEvidenceStore
      .getState()
      .setEntries([
        mockEvidence({ id: '1', type: 'video_clip' }),
        mockEvidence({ id: '2', type: 'note' }),
      ])
    useEvidenceStore.getState().setFilter({ type: 'note' })

    const filtered = useEvidenceStore.getState().getFilteredEntries()
    expect(filtered.length).toBe(1)
    expect(filtered[0]?.type).toBe('note')
  })

  it('getTimelineSorted returns chronological order', () => {
    useEvidenceStore
      .getState()
      .setEntries([
        mockEvidence({ id: '1', capturedAt: '2026-02-11T10:00:00Z' }),
        mockEvidence({ id: '2', capturedAt: '2026-02-11T08:00:00Z' }),
      ])

    const sorted = useEvidenceStore.getState().getTimelineSorted()
    expect(sorted[0]?.id).toBe('2')
    expect(sorted[1]?.id).toBe('1')
  })

  it('manages selected id', () => {
    useEvidenceStore.getState().setSelected('ev-1')
    expect(useEvidenceStore.getState().selectedId).toBe('ev-1')

    useEvidenceStore.getState().setSelected(null)
    expect(useEvidenceStore.getState().selectedId).toBeNull()
  })
})
