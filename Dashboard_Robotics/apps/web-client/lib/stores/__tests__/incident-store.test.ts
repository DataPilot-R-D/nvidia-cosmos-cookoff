/**
 * Incident Store Tests
 *
 * Tests for the Zustand incident store managing incident list, selection,
 * filtering, and sorting.
 */

import { useIncidentStore, type Incident } from '../incident-store'

// =============================================================================
// Test Data
// =============================================================================

function createTestIncident(overrides: Partial<Incident> = {}): Incident {
  return {
    id: 'inc-test-001',
    title: 'Test Incident',
    severity: 'info',
    status: 'new',
    timestamp: '2026-02-11T00:00:00.000Z',
    description: 'Test description',
    ...overrides,
  }
}

// =============================================================================
// Store Tests
// =============================================================================

describe('useIncidentStore', () => {
  describe('initial state', () => {
    it('should initialize with 3-4 mock incidents for demo', () => {
      const { incidents } = useIncidentStore.getState()
      expect(incidents).toBeInstanceOf(Map)
      expect(incidents.size).toBeGreaterThanOrEqual(3)
      expect(incidents.size).toBeLessThanOrEqual(4)
    })
  })

  describe('CRUD', () => {
    beforeEach(() => {
      useIncidentStore.setState({
        incidents: new Map(),
        selectedIncidentId: null,
        filters: {},
      })
    })

    it('addIncident should add an incident', () => {
      const { addIncident } = useIncidentStore.getState()
      const incident = createTestIncident({ id: 'inc-1' })

      addIncident(incident)

      const { incidents } = useIncidentStore.getState()
      expect(incidents.size).toBe(1)
      expect(incidents.get('inc-1')).toEqual(incident)
    })

    it('addIncident should replace incident with same id', () => {
      const { addIncident } = useIncidentStore.getState()
      addIncident(createTestIncident({ id: 'inc-1', title: 'V1' }))
      addIncident(createTestIncident({ id: 'inc-1', title: 'V2' }))

      const { incidents } = useIncidentStore.getState()
      expect(incidents.size).toBe(1)
      expect(incidents.get('inc-1')?.title).toBe('V2')
    })

    it('updateIncident should update fields by id', () => {
      const { addIncident, updateIncident } = useIncidentStore.getState()
      addIncident(createTestIncident({ id: 'inc-1', status: 'new' }))

      updateIncident('inc-1', { status: 'acknowledged' })

      const { incidents } = useIncidentStore.getState()
      expect(incidents.get('inc-1')?.status).toBe('acknowledged')
    })

    it('updateIncident should do nothing for missing id', () => {
      const { updateIncident } = useIncidentStore.getState()
      updateIncident('missing', { status: 'resolved' })

      const { incidents } = useIncidentStore.getState()
      expect(incidents.size).toBe(0)
    })
  })

  describe('selection', () => {
    beforeEach(() => {
      useIncidentStore.setState({
        incidents: new Map(),
        selectedIncidentId: null,
        filters: {},
      })
    })

    it('setSelectedIncident should set selectedIncidentId', () => {
      const { setSelectedIncident } = useIncidentStore.getState()
      setSelectedIncident('inc-123')
      expect(useIncidentStore.getState().selectedIncidentId).toBe('inc-123')
    })

    it('setSelectedIncident should allow null', () => {
      const { setSelectedIncident } = useIncidentStore.getState()
      setSelectedIncident('inc-123')
      setSelectedIncident(null)
      expect(useIncidentStore.getState().selectedIncidentId).toBeNull()
    })
  })

  describe('filtering + sorting', () => {
    const incCriticalOld = createTestIncident({
      id: 'inc-critical-old',
      severity: 'critical',
      timestamp: '2026-02-10T00:00:00.000Z',
      title: 'Critical Old',
    })
    const incCriticalNew = createTestIncident({
      id: 'inc-critical-new',
      severity: 'critical',
      timestamp: '2026-02-11T00:00:00.000Z',
      title: 'Critical New',
    })
    const incWarningNew = createTestIncident({
      id: 'inc-warning-new',
      severity: 'warning',
      timestamp: '2026-02-11T01:00:00.000Z',
      title: 'Warning New',
    })
    const incInfoNew = createTestIncident({
      id: 'inc-info-new',
      severity: 'info',
      timestamp: '2026-02-11T02:00:00.000Z',
      title: 'Info New',
    })

    beforeEach(() => {
      useIncidentStore.setState({
        incidents: new Map([
          [incCriticalOld.id, incCriticalOld],
          [incInfoNew.id, incInfoNew],
          [incCriticalNew.id, incCriticalNew],
          [incWarningNew.id, incWarningNew],
        ]),
        selectedIncidentId: null,
        filters: {},
      })
    })

    it('getFilteredIncidents should sort by severity then timestamp (newest first within severity)', () => {
      const { getFilteredIncidents } = useIncidentStore.getState()
      const result = getFilteredIncidents()

      expect(result.map((i) => i.id)).toEqual([
        'inc-critical-new',
        'inc-critical-old',
        'inc-warning-new',
        'inc-info-new',
      ])
    })

    it('setFilter should filter by severity', () => {
      const { setFilter, getFilteredIncidents } = useIncidentStore.getState()
      setFilter({ severity: 'critical' })
      const result = getFilteredIncidents()

      expect(result.map((i) => i.severity)).toEqual(['critical', 'critical'])
    })

    it('setFilter should filter by status', () => {
      const { updateIncident, setFilter, getFilteredIncidents } = useIncidentStore.getState()
      updateIncident('inc-critical-new', { status: 'resolved' })

      setFilter({ status: 'resolved' })
      const result = getFilteredIncidents()

      expect(result.map((i) => i.id)).toEqual(['inc-critical-new'])
    })

    it('should support combined severity + status filtering', () => {
      const { updateIncident, setFilter, getFilteredIncidents } = useIncidentStore.getState()
      updateIncident('inc-warning-new', { status: 'resolved' })
      updateIncident('inc-critical-new', { status: 'resolved' })

      setFilter({ severity: 'critical', status: 'resolved' })
      const result = getFilteredIncidents()

      expect(result.map((i) => i.id)).toEqual(['inc-critical-new'])
    })
  })
})
