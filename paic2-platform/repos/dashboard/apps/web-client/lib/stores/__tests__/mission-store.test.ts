import { useMissionStore, type Mission } from '../mission-store'

const makeMission = (overrides: Partial<Mission> = {}): Mission => ({
  id: 'mission-1',
  name: 'Patrol Alpha',
  type: 'patrol',
  waypoints: [{ x: 1, y: 2, z: 0 }],
  robotId: null,
  status: 'pending',
  createdAt: '2026-02-11T00:00:00.000Z',
  updatedAt: '2026-02-11T00:00:00.000Z',
  ...overrides,
})

describe('mission-store', () => {
  beforeEach(() => {
    useMissionStore.setState({
      missions: new Map(),
      selectedMissionId: null,
      filters: {},
      loading: false,
      error: null,
    })
  })

  it('setMissions replaces all missions', () => {
    const m1 = makeMission({ id: 'a' })
    const m2 = makeMission({ id: 'b', name: 'Inspect Beta' })
    useMissionStore.getState().setMissions([m1, m2])
    expect(useMissionStore.getState().missions.size).toBe(2)
  })

  it('upsertMission adds or updates a mission', () => {
    const m = makeMission()
    useMissionStore.getState().upsertMission(m)
    expect(useMissionStore.getState().missions.get('mission-1')?.name).toBe('Patrol Alpha')

    useMissionStore.getState().upsertMission({ ...m, status: 'dispatched' })
    expect(useMissionStore.getState().missions.get('mission-1')?.status).toBe('dispatched')
  })

  it('removeMission deletes by id', () => {
    useMissionStore.getState().upsertMission(makeMission())
    useMissionStore.getState().removeMission('mission-1')
    expect(useMissionStore.getState().missions.size).toBe(0)
  })

  it('setSelectedMission updates selection', () => {
    useMissionStore.getState().setSelectedMission('abc')
    expect(useMissionStore.getState().selectedMissionId).toBe('abc')
  })

  it('setFilter merges filters', () => {
    useMissionStore.getState().setFilter({ status: 'pending' })
    useMissionStore.getState().setFilter({ type: 'patrol' })
    expect(useMissionStore.getState().filters).toEqual({ status: 'pending', type: 'patrol' })
  })

  it('getFilteredMissions filters by status', () => {
    useMissionStore
      .getState()
      .setMissions([
        makeMission({ id: '1', status: 'pending' }),
        makeMission({ id: '2', status: 'completed' }),
      ])
    useMissionStore.getState().setFilter({ status: 'pending' })
    const result = useMissionStore.getState().getFilteredMissions()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('1')
  })

  it('getFilteredMissions filters by type', () => {
    useMissionStore
      .getState()
      .setMissions([
        makeMission({ id: '1', type: 'patrol' }),
        makeMission({ id: '2', type: 'inspect' }),
      ])
    useMissionStore.getState().setFilter({ type: 'inspect' })
    const result = useMissionStore.getState().getFilteredMissions()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('2')
  })

  it('getFilteredMissions sorts newest first', () => {
    useMissionStore
      .getState()
      .setMissions([
        makeMission({ id: '1', createdAt: '2026-01-01T00:00:00Z' }),
        makeMission({ id: '2', createdAt: '2026-02-01T00:00:00Z' }),
      ])
    const result = useMissionStore.getState().getFilteredMissions()
    expect(result[0]!.id).toBe('2')
  })

  it('setLoading and setError update state', () => {
    useMissionStore.getState().setLoading(true)
    expect(useMissionStore.getState().loading).toBe(true)
    useMissionStore.getState().setError('fail')
    expect(useMissionStore.getState().error).toBe('fail')
  })
})
