/**
 * Topic Store
 *
 * Zustand store for managing ROS topic discovery and subscription state.
 * Integrates with ROSBridge to fetch available topics and track subscriptions.
 *
 * @see Topic Inspector Feature
 */

import { create } from 'zustand'

// =============================================================================
// Stability tuning (prevents topic list flicker)
// =============================================================================

const TOPIC_MISS_THRESHOLD = 3
const topicMissCounts: Map<string, number> = new Map()

/**
 * Test helper (not used in app runtime)
 */
export function __resetTopicMissCountsForTests(): void {
  topicMissCounts.clear()
}

// =============================================================================
// Types
// =============================================================================

/**
 * ROS Topic information
 */
export interface RosTopic {
  /** Topic name (e.g., /scan, /odom) */
  name: string
  /** Message type (e.g., sensor_msgs/LaserScan) */
  type: string
  /** Whether we're subscribed to this topic */
  subscribed?: boolean
  /** Last message timestamp */
  lastMessage?: number
  /** Message rate (Hz) */
  messageRate?: number
}

/**
 * Topic Store State
 */
export interface TopicStoreState {
  /** List of discovered topics */
  topics: RosTopic[]
  /** Topics we're currently subscribed to */
  subscriptions: Set<string>
  /** Loading state for topic discovery */
  loading: boolean
  /** Error message if topic discovery failed */
  error: string | null
  /** Timestamp of last topic update */
  lastUpdated: number | null
  /** Search/filter query */
  filterQuery: string
}

/**
 * Topic Store Actions
 */
export interface TopicStoreActions {
  /** Set topics list */
  setTopics: (topics: RosTopic[]) => void
  /** Add subscription */
  addSubscription: (topicName: string) => void
  /** Remove subscription */
  removeSubscription: (topicName: string) => void
  /** Toggle subscription */
  toggleSubscription: (topicName: string) => void
  /** Set loading state */
  setLoading: (loading: boolean) => void
  /** Set error state */
  setError: (error: string | null) => void
  /** Update last message time for a topic */
  updateTopicActivity: (topicName: string) => void
  /** Set filter query */
  setFilterQuery: (query: string) => void
  /** Clear all topics */
  clearTopics: () => void
  /** Get filtered topics */
  getFilteredTopics: () => RosTopic[]
  /** Check if subscribed to a topic */
  isSubscribed: (topicName: string) => boolean
  /** Get topic by name */
  getTopicByName: (topicName: string) => RosTopic | undefined
}

// =============================================================================
// Initial State
// =============================================================================

const initialState: TopicStoreState = {
  topics: [],
  subscriptions: new Set(),
  loading: false,
  error: null,
  lastUpdated: null,
  filterQuery: '',
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useTopicStore = create<TopicStoreState & TopicStoreActions>((set, get) => ({
  ...initialState,

  setTopics: (topics: RosTopic[]) =>
    set((state) => {
      // Merge + debounce removal to prevent flicker.
      // rosapi/topics can be temporarily inconsistent between refreshes.
      const subscriptions = state.subscriptions
      const prevByName = new Map(state.topics.map((t) => [t.name, t]))
      const incomingByName = new Map(topics.map((t) => [t.name, t]))

      // Reset miss counts for incoming topics
      for (const name of incomingByName.keys()) {
        topicMissCounts.set(name, 0)
      }

      // Increment miss counts for topics that disappeared
      for (const name of prevByName.keys()) {
        if (!incomingByName.has(name)) {
          const next = (topicMissCounts.get(name) ?? 0) + 1
          topicMissCounts.set(name, next)
        }
      }

      const mergedTopics: RosTopic[] = []

      // Always include incoming (fresh) topics
      for (const incoming of topics) {
        const prev = prevByName.get(incoming.name)
        mergedTopics.push({
          ...incoming,
          subscribed: subscriptions.has(incoming.name),
          lastMessage: incoming.lastMessage ?? prev?.lastMessage,
          messageRate: incoming.messageRate ?? prev?.messageRate,
        })
      }

      // Keep recently-missed topics until threshold
      for (const prev of prevByName.values()) {
        if (incomingByName.has(prev.name)) continue

        const misses = topicMissCounts.get(prev.name) ?? 0
        if (misses < TOPIC_MISS_THRESHOLD) {
          mergedTopics.push(prev)
        } else {
          topicMissCounts.delete(prev.name)
        }
      }

      // Stable sort for UI consistency
      mergedTopics.sort((a, b) => a.name.localeCompare(b.name))

      return {
        topics: mergedTopics,
        lastUpdated: Date.now(),
        loading: false,
        error: null,
      }
    }),

  addSubscription: (topicName: string) =>
    set((state) => {
      const newSubscriptions = new Set(state.subscriptions)
      newSubscriptions.add(topicName)

      const updatedTopics = state.topics.map((topic) =>
        topic.name === topicName ? { ...topic, subscribed: true } : topic
      )

      return {
        subscriptions: newSubscriptions,
        topics: updatedTopics,
      }
    }),

  removeSubscription: (topicName: string) =>
    set((state) => {
      const newSubscriptions = new Set(state.subscriptions)
      newSubscriptions.delete(topicName)

      const updatedTopics = state.topics.map((topic) =>
        topic.name === topicName ? { ...topic, subscribed: false } : topic
      )

      return {
        subscriptions: newSubscriptions,
        topics: updatedTopics,
      }
    }),

  toggleSubscription: (topicName: string) => {
    const { subscriptions, addSubscription, removeSubscription } = get()
    if (subscriptions.has(topicName)) {
      removeSubscription(topicName)
    } else {
      addSubscription(topicName)
    }
  },

  setLoading: (loading: boolean) =>
    set({
      loading,
    }),

  setError: (error: string | null) =>
    set({
      error,
      loading: false,
    }),

  updateTopicActivity: (topicName: string) =>
    set((state) => {
      const updatedTopics = state.topics.map((topic) =>
        topic.name === topicName ? { ...topic, lastMessage: Date.now() } : topic
      )

      return { topics: updatedTopics }
    }),

  setFilterQuery: (query: string) =>
    set({
      filterQuery: query,
    }),

  clearTopics: () =>
    set({
      topics: [],
      subscriptions: new Set(),
      lastUpdated: null,
      error: null,
    }),

  getFilteredTopics: () => {
    const { topics, filterQuery } = get()
    if (!filterQuery.trim()) {
      return topics
    }

    const query = filterQuery.toLowerCase()
    return topics.filter(
      (topic) =>
        topic.name.toLowerCase().includes(query) || topic.type.toLowerCase().includes(query)
    )
  },

  isSubscribed: (topicName: string) => get().subscriptions.has(topicName),

  getTopicByName: (topicName: string) => get().topics.find((topic) => topic.name === topicName),
}))

// =============================================================================
// Selectors
// =============================================================================

/**
 * Select camera/image topics (sensor_msgs/Image, CompressedImage)
 * Supports both ROS1 (sensor_msgs/Image) and ROS2 (sensor_msgs/msg/Image) formats
 */
export const selectCameraTopics = () => {
  const { topics } = useTopicStore.getState()
  return topics.filter((topic) => {
    const type = topic.type.toLowerCase()
    // Match both sensor_msgs/Image and sensor_msgs/msg/Image formats
    return (
      (type.includes('sensor_msgs') && type.includes('image')) ||
      (type.includes('sensor_msgs') && type.includes('compressedimage'))
    )
  })
}

/**
 * Auto-detect best camera topic based on naming patterns
 * Priority: /camera/ > /image_raw > /video > first available
 */
export const autoDetectCameraTopic = (): RosTopic | null => {
  const cameraTopics = selectCameraTopics()
  if (cameraTopics.length === 0) return null

  // Priority patterns for auto-detection
  const patterns = [/\/camera\//i, /\/image_raw/i, /\/video/i, /robot0/i]

  for (const pattern of patterns) {
    const match = cameraTopics.find((topic) => pattern.test(topic.name))
    if (match) return match
  }

  // Return first available if no pattern matches
  return cameraTopics[0]
}

/**
 * Select LIDAR topics (LaserScan, PointCloud2)
 * Supports both ROS1 and ROS2 message type formats
 */
export const selectLidarTopics = () => {
  const { topics } = useTopicStore.getState()
  return topics.filter((topic) => {
    const type = topic.type.toLowerCase()
    const name = topic.name.toLowerCase()
    // Match LaserScan and PointCloud2 types
    return (
      (type.includes('sensor_msgs') && type.includes('laserscan')) ||
      (type.includes('sensor_msgs') && type.includes('pointcloud2')) ||
      // Also match by topic name patterns
      name.includes('scan') ||
      name.includes('lidar') ||
      name.includes('point_cloud')
    )
  })
}

/**
 * Auto-detect best LIDAR topic based on naming patterns
 * Priority: /scan > /lidar > /point_cloud > first available
 */
export const autoDetectLidarTopic = (): RosTopic | null => {
  const lidarTopics = selectLidarTopics()
  if (lidarTopics.length === 0) return null

  // Priority patterns for auto-detection
  const patterns = [
    /\/scan$/i,
    /\/robot0\/.*lidar/i,
    /\/robot0\/.*point_cloud/i,
    /point_cloud2_L1/i,
    /lidar/i,
  ]

  for (const pattern of patterns) {
    const match = lidarTopics.find((topic) => pattern.test(topic.name))
    if (match) return match
  }

  // Return first available if no pattern matches
  return lidarTopics[0]
}

export type TopicStore = typeof useTopicStore
