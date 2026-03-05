import { useTrustStore, type TrustScore } from '../trust-store'

const mockScore = (overrides: Partial<TrustScore> = {}): TrustScore => ({
  id: 'ts-1',
  robotId: 'robot-1',
  confidenceScore: 85,
  riskLevel: 'low',
  handoverStatus: 'autonomous',
  reasons: '[]',
  recommendations: '[]',
  sensorHealth: null,
  metadata: null,
  createdAt: '2026-02-11T08:00:00Z',
  updatedAt: '2026-02-11T08:00:00Z',
  ...overrides,
})

describe('trust-store', () => {
  beforeEach(() => {
    useTrustStore.getState().setScores([])
    useTrustStore.getState().setSelectedRobot(null)
  })

  it('sets and retrieves scores', () => {
    useTrustStore.getState().setScores([mockScore({ robotId: 'r1' }), mockScore({ robotId: 'r2' })])
    expect(useTrustStore.getState().scores.size).toBe(2)
  })

  it('upserts score', () => {
    useTrustStore.getState().setScores([mockScore({ robotId: 'r1', confidenceScore: 90 })])
    useTrustStore.getState().upsertScore(mockScore({ robotId: 'r1', confidenceScore: 30 }))
    expect(useTrustStore.getState().scores.get('r1')?.confidenceScore).toBe(30)
  })

  it('getScore returns score by robotId', () => {
    useTrustStore.getState().setScores([mockScore({ robotId: 'r1' })])
    expect(useTrustStore.getState().getScore('r1')?.robotId).toBe('r1')
    expect(useTrustStore.getState().getScore('unknown')).toBeUndefined()
  })

  it('getSortedScores sorts by risk (critical first)', () => {
    useTrustStore
      .getState()
      .setScores([
        mockScore({ robotId: 'safe', riskLevel: 'low' }),
        mockScore({ robotId: 'danger', riskLevel: 'critical' }),
        mockScore({ robotId: 'mid', riskLevel: 'medium' }),
      ])

    const sorted = useTrustStore.getState().getSortedScores()
    expect(sorted[0]?.robotId).toBe('danger')
    expect(sorted[1]?.robotId).toBe('mid')
    expect(sorted[2]?.robotId).toBe('safe')
  })

  it('manages selectedRobotId', () => {
    useTrustStore.getState().setSelectedRobot('r1')
    expect(useTrustStore.getState().selectedRobotId).toBe('r1')
    useTrustStore.getState().setSelectedRobot(null)
    expect(useTrustStore.getState().selectedRobotId).toBeNull()
  })
})
