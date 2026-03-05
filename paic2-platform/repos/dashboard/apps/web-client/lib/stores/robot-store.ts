/**
 * Robot State Store
 *
 * Zustand store for managing robot fleet state.
 * Uses RobotEntity from @workspace/shared-types for type safety.
 *
 * @see plan.md Step 2: Robot State Store
 */

import { create } from 'zustand'
import { type RobotEntity, type RobotStatus } from '@workspace/shared-types'

/**
 * Active robot statuses
 * Robots with these statuses are considered operational
 */
const ACTIVE_STATUSES: RobotStatus[] = ['online', 'patrol', 'idle', 'alert']

/**
 * Robot Store State Interface
 *
 * Represents the current state of the robot fleet.
 */
export interface RobotState {
  /** Map of robot IDs to robot entities */
  robots: Map<string, RobotEntity>
  /** Currently selected robot ID for multi-robot context */
  activeRobotId: string | null
}

/**
 * Robot Store Actions Interface
 *
 * Actions for managing robot fleet state.
 */
export interface RobotActions {
  /** Add or replace a robot in the store */
  setRobot: (robot: RobotEntity) => void
  /** Update robot with partial data (immutable merge) */
  updateRobot: (id: string, partial: Partial<RobotEntity>) => void
  /** Remove robot from store */
  removeRobot: (id: string) => void
  /** Clear all robots from store */
  clearRobots: () => void
  /** Selector: get robot by ID */
  getRobotById: (id: string) => RobotEntity | undefined
  /** Selector: get all active robots (online, patrol, idle, alert) */
  getActiveRobots: () => RobotEntity[]
  /** Selector: get total robot count */
  getRobotCount: () => number
  /** Selector: get all robots as array */
  getAllRobots: () => RobotEntity[]
  /** Set active robot for multi-robot context */
  setActiveRobot: (id: string | null) => void
  /** Get active robot entity */
  getActiveRobot: () => RobotEntity | undefined
}

/**
 * Initial state for the Robot store
 */
const initialState: RobotState = {
  robots: new Map(),
  activeRobotId: null,
}

/**
 * Robot State Store
 *
 * Manages the fleet state for all robots.
 * Uses Map<string, RobotEntity> for O(1) lookups.
 *
 * @example
 * ```tsx
 * // In a component
 * const robots = useRobotStore((state) => state.getAllRobots())
 * const { setRobot, updateRobot } = useRobotStore.getState()
 *
 * // Get specific robot
 * const robot = useRobotStore((state) => state.getRobotById('robot-001'))
 *
 * // Get active robots only
 * const active = useRobotStore((state) => state.getActiveRobots())
 * ```
 */
export const useRobotStore = create<RobotState & RobotActions>((set, get) => ({
  // State
  ...initialState,

  // Actions
  setRobot: (robot: RobotEntity) =>
    set((state) => {
      const newRobots = new Map(state.robots)
      newRobots.set(robot.id, robot)
      return { robots: newRobots }
    }),

  updateRobot: (id: string, partial: Partial<RobotEntity>) =>
    set((state) => {
      const existingRobot = state.robots.get(id)
      if (!existingRobot) {
        return state // No change if robot doesn't exist
      }
      const newRobots = new Map(state.robots)
      newRobots.set(id, {
        ...existingRobot,
        ...partial,
      })
      return { robots: newRobots }
    }),

  removeRobot: (id: string) =>
    set((state) => {
      const newRobots = new Map(state.robots)
      newRobots.delete(id)
      return { robots: newRobots }
    }),

  clearRobots: () =>
    set({
      robots: new Map(),
    }),

  // Selectors
  getRobotById: (id: string) => get().robots.get(id),

  getActiveRobots: () => {
    const robots = get().robots
    return Array.from(robots.values()).filter((robot) => ACTIVE_STATUSES.includes(robot.status))
  },

  getRobotCount: () => get().robots.size,

  getAllRobots: () => Array.from(get().robots.values()),

  setActiveRobot: (id) => set({ activeRobotId: id }),

  getActiveRobot: () => {
    const { activeRobotId, robots } = get()
    if (!activeRobotId) return undefined
    return robots.get(activeRobotId)
  },
}))

/**
 * Export store type for testing and typing purposes
 */
export type RobotStore = typeof useRobotStore
