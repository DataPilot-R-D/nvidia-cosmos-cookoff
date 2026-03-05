/**
 * Robot State Store Tests
 *
 * TDD Tests for Robot state management.
 * Tests follow the plan.md specification for Step 2.
 *
 * @see plan.md Step 2: Robot State Store
 */

import { useRobotStore, type RobotState } from '../robot-store'
import { type RobotEntity } from '@workspace/shared-types'

// =============================================================================
// Test Fixtures
// =============================================================================

const createMockRobot = (overrides: Partial<RobotEntity> = {}): RobotEntity => ({
  id: 'robot-001',
  name: 'Security Bot Alpha',
  model: 'SB-100',
  serialNumber: 'SN-2024-001',
  position: { x: 10, y: 20, z: 0, heading: 90 },
  status: 'online',
  battery: 85,
  velocity: 0,
  lastSeen: Date.now(),
  createdAt: Date.now() - 86400000, // 1 day ago
  updatedAt: Date.now(),
  ...overrides,
})

const robot1 = createMockRobot({ id: 'robot-001', name: 'Alpha', status: 'online' })
const robot2 = createMockRobot({ id: 'robot-002', name: 'Beta', status: 'patrol' })
const robot3 = createMockRobot({ id: 'robot-003', name: 'Gamma', status: 'offline' })
const robot4 = createMockRobot({ id: 'robot-004', name: 'Delta', status: 'idle' })
const robot5 = createMockRobot({ id: 'robot-005', name: 'Epsilon', status: 'alert' })
const robot6 = createMockRobot({ id: 'robot-006', name: 'Zeta', status: 'warning' })

describe('Robot Store', () => {
  // Reset store state before each test
  beforeEach(() => {
    useRobotStore.setState({
      robots: new Map(),
    })
  })

  // ===========================================================================
  // Initial State Tests
  // ===========================================================================

  describe('Initial State', () => {
    it('should have empty robots Map initially', () => {
      const state = useRobotStore.getState()
      expect(state.robots).toBeInstanceOf(Map)
      expect(state.robots.size).toBe(0)
    })

    it('should match expected initial state shape', () => {
      const state = useRobotStore.getState()
      expect(state).toMatchObject({
        robots: expect.any(Map),
      })
    })
  })

  // ===========================================================================
  // setRobot() Tests
  // ===========================================================================

  describe('setRobot(robot)', () => {
    it('should add a new robot to the store', () => {
      const { setRobot } = useRobotStore.getState()

      setRobot(robot1)

      const state = useRobotStore.getState()
      expect(state.robots.size).toBe(1)
      expect(state.robots.has('robot-001')).toBe(true)
    })

    it('should store the robot data correctly', () => {
      const { setRobot } = useRobotStore.getState()

      setRobot(robot1)

      const state = useRobotStore.getState()
      const storedRobot = state.robots.get('robot-001')
      expect(storedRobot).toEqual(robot1)
    })

    it('should add multiple robots', () => {
      const { setRobot } = useRobotStore.getState()

      setRobot(robot1)
      setRobot(robot2)
      setRobot(robot3)

      const state = useRobotStore.getState()
      expect(state.robots.size).toBe(3)
    })

    it('should replace existing robot with same id', () => {
      const { setRobot } = useRobotStore.getState()

      setRobot(robot1)
      const updatedRobot = { ...robot1, battery: 50, name: 'Updated Alpha' }
      setRobot(updatedRobot)

      const state = useRobotStore.getState()
      expect(state.robots.size).toBe(1)
      expect(state.robots.get('robot-001')?.battery).toBe(50)
      expect(state.robots.get('robot-001')?.name).toBe('Updated Alpha')
    })

    it('should create new Map reference (immutability)', () => {
      const { setRobot } = useRobotStore.getState()
      const initialMap = useRobotStore.getState().robots

      setRobot(robot1)

      const newMap = useRobotStore.getState().robots
      expect(newMap).not.toBe(initialMap)
    })
  })

  // ===========================================================================
  // updateRobot() Tests
  // ===========================================================================

  describe('updateRobot(id, partial)', () => {
    it('should update existing robot with partial data', () => {
      const { setRobot, updateRobot } = useRobotStore.getState()
      setRobot(robot1)

      updateRobot('robot-001', { battery: 60 })

      const state = useRobotStore.getState()
      const updatedRobot = state.robots.get('robot-001')
      expect(updatedRobot?.battery).toBe(60)
    })

    it('should preserve other robot properties', () => {
      const { setRobot, updateRobot } = useRobotStore.getState()
      setRobot(robot1)

      updateRobot('robot-001', { battery: 60 })

      const state = useRobotStore.getState()
      const updatedRobot = state.robots.get('robot-001')
      expect(updatedRobot?.name).toBe(robot1.name)
      expect(updatedRobot?.status).toBe(robot1.status)
      expect(updatedRobot?.position).toEqual(robot1.position)
    })

    it('should update multiple properties at once', () => {
      const { setRobot, updateRobot } = useRobotStore.getState()
      setRobot(robot1)

      updateRobot('robot-001', {
        battery: 45,
        status: 'patrol',
        velocity: 2.5,
      })

      const state = useRobotStore.getState()
      const updatedRobot = state.robots.get('robot-001')
      expect(updatedRobot?.battery).toBe(45)
      expect(updatedRobot?.status).toBe('patrol')
      expect(updatedRobot?.velocity).toBe(2.5)
    })

    it('should update nested position object immutably', () => {
      const { setRobot, updateRobot } = useRobotStore.getState()
      setRobot(robot1)
      const originalPosition = useRobotStore.getState().robots.get('robot-001')?.position

      updateRobot('robot-001', {
        position: { x: 100, y: 200, z: 0, heading: 180 },
      })

      const state = useRobotStore.getState()
      const newPosition = state.robots.get('robot-001')?.position
      expect(newPosition).not.toBe(originalPosition)
      expect(newPosition?.x).toBe(100)
      expect(newPosition?.y).toBe(200)
    })

    it('should not throw if robot does not exist', () => {
      const { updateRobot } = useRobotStore.getState()

      expect(() => {
        updateRobot('non-existent', { battery: 50 })
      }).not.toThrow()
    })

    it('should not add robot if it does not exist', () => {
      const { updateRobot } = useRobotStore.getState()

      updateRobot('non-existent', { battery: 50 })

      const state = useRobotStore.getState()
      expect(state.robots.size).toBe(0)
    })

    it('should create new Map reference on update (immutability)', () => {
      const { setRobot, updateRobot } = useRobotStore.getState()
      setRobot(robot1)
      const mapBeforeUpdate = useRobotStore.getState().robots

      updateRobot('robot-001', { battery: 50 })

      const mapAfterUpdate = useRobotStore.getState().robots
      expect(mapAfterUpdate).not.toBe(mapBeforeUpdate)
    })
  })

  // ===========================================================================
  // removeRobot() Tests
  // ===========================================================================

  describe('removeRobot(id)', () => {
    it('should remove robot from store', () => {
      const { setRobot, removeRobot } = useRobotStore.getState()
      setRobot(robot1)
      setRobot(robot2)

      removeRobot('robot-001')

      const state = useRobotStore.getState()
      expect(state.robots.size).toBe(1)
      expect(state.robots.has('robot-001')).toBe(false)
      expect(state.robots.has('robot-002')).toBe(true)
    })

    it('should not throw if robot does not exist', () => {
      const { removeRobot } = useRobotStore.getState()

      expect(() => {
        removeRobot('non-existent')
      }).not.toThrow()
    })

    it('should create new Map reference on remove (immutability)', () => {
      const { setRobot, removeRobot } = useRobotStore.getState()
      setRobot(robot1)
      const mapBeforeRemove = useRobotStore.getState().robots

      removeRobot('robot-001')

      const mapAfterRemove = useRobotStore.getState().robots
      expect(mapAfterRemove).not.toBe(mapBeforeRemove)
    })

    it('should remove all robots when called for each', () => {
      const { setRobot, removeRobot } = useRobotStore.getState()
      setRobot(robot1)
      setRobot(robot2)
      setRobot(robot3)

      removeRobot('robot-001')
      removeRobot('robot-002')
      removeRobot('robot-003')

      const state = useRobotStore.getState()
      expect(state.robots.size).toBe(0)
    })
  })

  // ===========================================================================
  // getRobotById() Selector Tests
  // ===========================================================================

  describe('getRobotById(id)', () => {
    it('should return robot when it exists', () => {
      const { setRobot, getRobotById } = useRobotStore.getState()
      setRobot(robot1)

      const result = getRobotById('robot-001')

      expect(result).toEqual(robot1)
    })

    it('should return undefined when robot does not exist', () => {
      const { getRobotById } = useRobotStore.getState()

      const result = getRobotById('non-existent')

      expect(result).toBeUndefined()
    })

    it('should return correct robot from multiple robots', () => {
      const { setRobot, getRobotById } = useRobotStore.getState()
      setRobot(robot1)
      setRobot(robot2)
      setRobot(robot3)

      const result = getRobotById('robot-002')

      expect(result?.name).toBe('Beta')
      expect(result?.status).toBe('patrol')
    })
  })

  // ===========================================================================
  // getActiveRobots() Selector Tests
  // ===========================================================================

  describe('getActiveRobots()', () => {
    it('should return empty array when no robots', () => {
      const { getActiveRobots } = useRobotStore.getState()

      const result = getActiveRobots()

      expect(result).toEqual([])
    })

    it('should return only active robots (online, patrol, idle, alert)', () => {
      const { setRobot, getActiveRobots } = useRobotStore.getState()
      setRobot(robot1) // online - ACTIVE
      setRobot(robot2) // patrol - ACTIVE
      setRobot(robot3) // offline - NOT ACTIVE
      setRobot(robot4) // idle - ACTIVE
      setRobot(robot5) // alert - ACTIVE
      setRobot(robot6) // warning - NOT ACTIVE

      const result = getActiveRobots()

      expect(result).toHaveLength(4)
      expect(result.map((r) => r.id)).toContain('robot-001')
      expect(result.map((r) => r.id)).toContain('robot-002')
      expect(result.map((r) => r.id)).toContain('robot-004')
      expect(result.map((r) => r.id)).toContain('robot-005')
    })

    it('should not include offline robots', () => {
      const { setRobot, getActiveRobots } = useRobotStore.getState()
      setRobot(robot3) // offline

      const result = getActiveRobots()

      expect(result).toHaveLength(0)
    })

    it('should not include warning robots', () => {
      const { setRobot, getActiveRobots } = useRobotStore.getState()
      setRobot(robot6) // warning

      const result = getActiveRobots()

      expect(result).toHaveLength(0)
    })

    it('should return all robots if all are active', () => {
      const { setRobot, getActiveRobots } = useRobotStore.getState()
      setRobot(robot1) // online
      setRobot(robot2) // patrol

      const result = getActiveRobots()

      expect(result).toHaveLength(2)
    })
  })

  // ===========================================================================
  // clearRobots() Tests
  // ===========================================================================

  describe('clearRobots()', () => {
    it('should remove all robots from store', () => {
      const { setRobot, clearRobots } = useRobotStore.getState()
      setRobot(robot1)
      setRobot(robot2)
      setRobot(robot3)

      clearRobots()

      const state = useRobotStore.getState()
      expect(state.robots.size).toBe(0)
    })

    it('should create new Map reference (immutability)', () => {
      const { setRobot, clearRobots } = useRobotStore.getState()
      setRobot(robot1)
      const mapBefore = useRobotStore.getState().robots

      clearRobots()

      const mapAfter = useRobotStore.getState().robots
      expect(mapAfter).not.toBe(mapBefore)
    })
  })

  // ===========================================================================
  // getRobotCount() Selector Tests
  // ===========================================================================

  describe('getRobotCount()', () => {
    it('should return 0 when no robots', () => {
      const { getRobotCount } = useRobotStore.getState()

      const result = getRobotCount()

      expect(result).toBe(0)
    })

    it('should return correct count', () => {
      const { setRobot, getRobotCount } = useRobotStore.getState()
      setRobot(robot1)
      setRobot(robot2)
      setRobot(robot3)

      const result = getRobotCount()

      expect(result).toBe(3)
    })
  })

  // ===========================================================================
  // getAllRobots() Selector Tests
  // ===========================================================================

  describe('getAllRobots()', () => {
    it('should return empty array when no robots', () => {
      const { getAllRobots } = useRobotStore.getState()

      const result = getAllRobots()

      expect(result).toEqual([])
    })

    it('should return all robots as array', () => {
      const { setRobot, getAllRobots } = useRobotStore.getState()
      setRobot(robot1)
      setRobot(robot2)

      const result = getAllRobots()

      expect(result).toHaveLength(2)
      expect(result).toContainEqual(robot1)
      expect(result).toContainEqual(robot2)
    })
  })

  // ===========================================================================
  // State Immutability Tests
  // ===========================================================================

  describe('State Immutability', () => {
    it('should create new state objects on updates', () => {
      const initialState = useRobotStore.getState()

      const { setRobot } = initialState
      setRobot(robot1)

      const newState = useRobotStore.getState()
      expect(newState).not.toBe(initialState)
    })

    it('should not mutate original robot object on update', () => {
      const { setRobot, updateRobot } = useRobotStore.getState()
      const originalRobot = { ...robot1 }
      setRobot(robot1)

      updateRobot('robot-001', { battery: 0 })

      expect(robot1.battery).toBe(originalRobot.battery)
    })
  })

  // ===========================================================================
  // Type Safety Tests
  // ===========================================================================

  describe('Type Safety', () => {
    it('should export RobotState type correctly', () => {
      const state: RobotState = useRobotStore.getState()

      expect(state.robots).toBeInstanceOf(Map)
    })

    it('should handle RobotEntity type from shared-types', () => {
      const { setRobot, getRobotById } = useRobotStore.getState()
      const typedRobot: RobotEntity = robot1

      setRobot(typedRobot)
      const result = getRobotById('robot-001')

      expect(result).toBeDefined()
      expect(result?.id).toBe(typedRobot.id)
    })
  })
})
