/**
 * Path Store
 *
 * Zustand store for managing navigation path data from ROS.
 * Handles /plan, /local_plan topics from Nav2.
 */

import { create } from 'zustand'

// =============================================================================
// Types
// =============================================================================

/**
 * 2D/3D point
 */
export interface PathPoint {
  x: number
  y: number
  z: number
}

/**
 * Navigation path data
 */
export interface PathData {
  /** ROS topic name */
  topic: string
  /** Frame ID (usually 'map') */
  frameId: string
  /** Path points */
  points: PathPoint[]
  /** Number of points */
  pointCount: number
  /** Timestamp when received */
  timestamp: number
}

/**
 * Goal pose data
 */
export interface GoalPose {
  x: number
  y: number
  theta: number
  frameId: string
  timestamp: number
  status: 'pending' | 'navigating' | 'reached' | 'failed' | 'canceled'
}

/**
 * Navigation progress data from Nav2 feedback
 */
export interface NavigationProgress {
  distanceRemaining: number | null
  distanceTotal: number | null
  navigationTime: number | null
  numberOfRecoveries: number
}

/**
 * Waypoint for patrol mode
 */
export interface Waypoint {
  id: string
  x: number
  y: number
  theta: number
  status: 'pending' | 'current' | 'reached'
}

/**
 * Path store state
 */
interface PathState {
  /** Paths by topic name */
  paths: Map<string, PathData>
  /** Current goal pose */
  goalPose: GoalPose | null
  /** Goal pose history */
  goalHistory: GoalPose[]
  /** Last update timestamp */
  lastUpdated: number | null
  /** Navigation progress from Nav2 */
  navigationProgress: NavigationProgress | null
  /** Waypoints for patrol mode */
  waypoints: Waypoint[]
  /** Waypoint mode enabled */
  isWaypointMode: boolean
  /** Current waypoint index during patrol */
  currentWaypointIndex: number
}

/**
 * Path store actions
 */
interface PathActions {
  /** Add or update a path */
  addPath: (data: PathData) => void
  /** Get path by topic */
  getPath: (topic: string) => PathData | undefined
  /** Get global plan */
  getGlobalPlan: () => PathData | undefined
  /** Get local plan */
  getLocalPlan: () => PathData | undefined
  /** Set goal pose */
  setGoalPose: (goal: Omit<GoalPose, 'timestamp' | 'status'>) => void
  /** Update goal status */
  updateGoalStatus: (status: GoalPose['status']) => void
  /** Clear goal pose */
  clearGoalPose: () => void
  /** Clear all paths */
  clearPaths: () => void
  /** Update navigation progress */
  updateNavigationProgress: (progress: Partial<NavigationProgress>) => void
  /** Clear navigation progress */
  clearNavigationProgress: () => void
  /** Add waypoint */
  addWaypoint: (waypoint: Omit<Waypoint, 'id' | 'status'>) => void
  /** Remove waypoint */
  removeWaypoint: (id: string) => void
  /** Clear all waypoints */
  clearWaypoints: () => void
  /** Set waypoint mode */
  setWaypointMode: (enabled: boolean) => void
  /** Set current waypoint index */
  setCurrentWaypointIndex: (index: number) => void
  /** Update waypoint status */
  updateWaypointStatus: (id: string, status: Waypoint['status']) => void
}

// =============================================================================
// Store Implementation
// =============================================================================

const MAX_GOAL_HISTORY = 10

export const usePathStore = create<PathState & PathActions>((set, get) => ({
  // Initial state
  paths: new Map(),
  goalPose: null,
  goalHistory: [],
  lastUpdated: null,
  navigationProgress: null,
  waypoints: [],
  isWaypointMode: false,
  currentWaypointIndex: 0,

  // Actions
  addPath: (data: PathData) => {
    set((state) => {
      const newPaths = new Map(state.paths)
      newPaths.set(data.topic, {
        ...data,
        timestamp: Date.now(),
      })

      return {
        paths: newPaths,
        lastUpdated: Date.now(),
      }
    })
  },

  getPath: (topic: string) => {
    return get().paths.get(topic)
  },

  getGlobalPlan: () => {
    const { paths } = get()
    return paths.get('/plan') || paths.get('/global_plan')
  },

  getLocalPlan: () => {
    const { paths } = get()
    return paths.get('/local_plan')
  },

  setGoalPose: (goal) => {
    set((state) => {
      const newGoal: GoalPose = {
        ...goal,
        timestamp: Date.now(),
        status: 'pending',
      }

      // Add previous goal to history if exists
      const newHistory = state.goalPose
        ? [state.goalPose, ...state.goalHistory].slice(0, MAX_GOAL_HISTORY)
        : state.goalHistory

      return {
        goalPose: newGoal,
        goalHistory: newHistory,
      }
    })
  },

  updateGoalStatus: (status) => {
    set((state) => {
      if (!state.goalPose) return state

      return {
        goalPose: {
          ...state.goalPose,
          status,
        },
      }
    })
  },

  clearGoalPose: () => {
    set({ goalPose: null })
  },

  clearPaths: () => {
    set({
      paths: new Map(),
      lastUpdated: null,
    })
  },

  updateNavigationProgress: (progress) => {
    set((state) => {
      const currentProgress = state.navigationProgress || {
        distanceRemaining: null,
        distanceTotal: null,
        navigationTime: null,
        numberOfRecoveries: 0,
      }

      // Calculate total distance from path if not set
      let distanceTotal = progress.distanceTotal ?? currentProgress.distanceTotal
      if (
        distanceTotal === null &&
        progress.distanceRemaining !== null &&
        progress.distanceRemaining !== undefined
      ) {
        // First time receiving progress, set total as current remaining
        const globalPlan = state.paths.get('/plan')
        if (globalPlan) {
          distanceTotal = getPathLength(globalPlan)
        } else {
          distanceTotal = progress.distanceRemaining
        }
      }

      return {
        navigationProgress: {
          ...currentProgress,
          ...progress,
          distanceTotal,
        },
      }
    })
  },

  clearNavigationProgress: () => {
    set({ navigationProgress: null })
  },

  addWaypoint: (waypoint) => {
    set((state) => ({
      waypoints: [
        ...state.waypoints,
        {
          ...waypoint,
          id: `wp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          status: 'pending',
        },
      ],
    }))
  },

  removeWaypoint: (id) => {
    set((state) => ({
      waypoints: state.waypoints.filter((wp) => wp.id !== id),
    }))
  },

  clearWaypoints: () => {
    set({
      waypoints: [],
      currentWaypointIndex: 0,
    })
  },

  setWaypointMode: (enabled) => {
    set({ isWaypointMode: enabled })
  },

  setCurrentWaypointIndex: (index) => {
    set({ currentWaypointIndex: index })
  },

  updateWaypointStatus: (id, status) => {
    set((state) => ({
      waypoints: state.waypoints.map((wp) => (wp.id === id ? { ...wp, status } : wp)),
    }))
  },
}))

// =============================================================================
// Selectors
// =============================================================================

/**
 * Check if robot is navigating
 */
export const isNavigating = () => {
  const { goalPose } = usePathStore.getState()
  return goalPose?.status === 'navigating' || goalPose?.status === 'pending'
}

/**
 * Get path length in meters
 */
export const getPathLength = (path: PathData): number => {
  if (path.points.length < 2) return 0

  let length = 0
  for (let i = 1; i < path.points.length; i++) {
    const dx = path.points[i].x - path.points[i - 1].x
    const dy = path.points[i].y - path.points[i - 1].y
    length += Math.sqrt(dx * dx + dy * dy)
  }
  return length
}

export type PathStore = typeof usePathStore
