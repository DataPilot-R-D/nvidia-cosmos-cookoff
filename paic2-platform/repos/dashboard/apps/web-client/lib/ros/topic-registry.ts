/**
 * ROS Topic Registry
 *
 * Centralized topic categorization and routing logic.
 * Extracted from TopicListWidget.tsx for reusability across components.
 */

import type { ModuleType } from '@/components/widgets/ModuleRegistry'

// =============================================================================
// Types
// =============================================================================

export interface TopicCategory {
  name: string
  icon: string
  color: string
  pattern: RegExp
  targetModule: ModuleType | null
}

export interface CategorizedTopic {
  name: string
  type: string
  category: TopicCategory | null
  color: string
  icon: string
  shortType: string
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Topic categories for smart routing
 * Maps ROS message types to UI modules and display properties
 */
export const TOPIC_CATEGORIES: TopicCategory[] = [
  {
    name: 'LIDAR',
    icon: '~',
    color: '#00ffff',
    pattern: /sensor_msgs\/(LaserScan|PointCloud2)/,
    targetModule: 'lidar',
  },
  {
    name: 'Camera',
    icon: '[]',
    color: '#ff00ff',
    pattern: /sensor_msgs\/(Image|CompressedImage)/,
    targetModule: 'camera',
  },
  {
    name: 'Odometry',
    icon: '<>',
    color: '#00ff00',
    pattern: /nav_msgs\/Odometry/,
    targetModule: 'map-2d',
  },
  {
    name: 'Pose',
    icon: '+',
    color: '#ffff00',
    pattern: /geometry_msgs\/(Pose|PoseStamped|PoseWithCovariance)/,
    targetModule: 'map-2d',
  },
  {
    name: 'Map',
    icon: '#',
    color: '#ff8800',
    pattern: /nav_msgs\/(OccupancyGrid|Path)/,
    targetModule: 'map-2d',
  },
  {
    name: 'IMU',
    icon: '*',
    color: '#88ff00',
    pattern: /sensor_msgs\/Imu/,
    targetModule: null,
  },
  {
    name: 'TF',
    icon: '@',
    color: '#8888ff',
    pattern: /tf2_msgs\/TFMessage/,
    targetModule: null,
  },
  {
    name: 'Twist',
    icon: '>',
    color: '#ff88ff',
    pattern: /geometry_msgs\/Twist/,
    targetModule: 'controls',
  },
]

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get category for a topic type
 */
export function getTopicCategory(type: string): TopicCategory | null {
  return TOPIC_CATEGORIES.find((cat) => cat.pattern.test(type)) || null
}

/**
 * Get display color for topic type
 */
export function getTopicColor(type: string): string {
  const category = getTopicCategory(type)
  return category?.color || '#666666'
}

/**
 * Get icon for topic type
 */
export function getTopicIcon(type: string): string {
  const category = getTopicCategory(type)
  return category?.icon || '?'
}

/**
 * Get short type name (last segment after /)
 */
export function getShortTypeName(type: string): string {
  const parts = type.split('/')
  return parts[parts.length - 1] || type
}

/**
 * Categorize a single topic with all display properties
 */
export function categorizeTopic(name: string, type: string): CategorizedTopic {
  const category = getTopicCategory(type)
  return {
    name,
    type,
    category,
    color: category?.color || '#666666',
    icon: category?.icon || '?',
    shortType: getShortTypeName(type),
  }
}

// =============================================================================
// Filtering Functions
// =============================================================================

/**
 * Filter topics by category name
 */
export function filterTopicsByCategory(
  topics: Array<{ name: string; type: string }>,
  categoryName: string
): Array<{ name: string; type: string }> {
  const category = TOPIC_CATEGORIES.find((c) => c.name === categoryName)
  if (!category) return []
  return topics.filter((t) => category.pattern.test(t.type))
}

/**
 * Filter camera/image topics (sensor_msgs/Image, CompressedImage)
 */
export function filterCameraTopics(
  topics: Array<{ name: string; type: string }>
): Array<{ name: string; type: string }> {
  return topics.filter((topic) => {
    const type = topic.type.toLowerCase()
    return (
      (type.includes('sensor_msgs') && type.includes('image')) ||
      (type.includes('sensor_msgs') && type.includes('compressedimage'))
    )
  })
}

/**
 * Filter LIDAR topics (LaserScan, PointCloud2)
 */
export function filterLidarTopics(
  topics: Array<{ name: string; type: string }>
): Array<{ name: string; type: string }> {
  return topics.filter((topic) => {
    const type = topic.type.toLowerCase()
    const name = topic.name.toLowerCase()
    return (
      (type.includes('sensor_msgs') && type.includes('laserscan')) ||
      (type.includes('sensor_msgs') && type.includes('pointcloud2')) ||
      name.includes('scan') ||
      name.includes('lidar') ||
      name.includes('point_cloud')
    )
  })
}
