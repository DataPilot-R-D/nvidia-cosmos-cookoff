/**
 * TopicRegistry - Mapping ROS Message Types to Panel IDs
 *
 * Central registry for routing ROS topics to appropriate visualization panels.
 * Used by TopicInspector to determine which panel should display a topic.
 *
 * @see Dynamic Topic Routing (Foxglove-style)
 */

import type { ModuleType } from '@/components/widgets/ModuleRegistry'

// =============================================================================
// Types
// =============================================================================

/**
 * Topic category definition for routing
 */
export interface TopicCategoryDef {
  /** Category display name */
  name: string
  /** Icon character for display */
  icon: string
  /** Display color (hex) */
  color: string
  /** Pattern to match message types */
  pattern: RegExp
  /** Target panel ID to visualize this type */
  targetPanel: ModuleType | null
  /** Priority for routing (higher = preferred) */
  priority: number
}

/**
 * Panel topic assignment
 */
export interface PanelTopicAssignment {
  /** Topic name */
  topicName: string
  /** Message type */
  msgType: string
  /** Timestamp when assigned */
  assignedAt: number
}

// =============================================================================
// Topic Registry Configuration
// =============================================================================

/**
 * Topic categories with routing configuration
 * Ordered by priority (first match wins)
 */
export const TOPIC_REGISTRY: TopicCategoryDef[] = [
  // LIDAR / Point Cloud - highest priority for sensor visualization
  {
    name: 'LIDAR',
    icon: '~',
    color: '#00ffff',
    pattern: /sensor_msgs\/(LaserScan|PointCloud2|PointCloud)/,
    targetPanel: 'lidar',
    priority: 100,
  },
  // Camera / Image
  {
    name: 'Camera',
    icon: '[]',
    color: '#ff00ff',
    pattern: /sensor_msgs\/(Image|CompressedImage|CameraInfo)/,
    targetPanel: 'camera',
    priority: 90,
  },
  // Navigation - Odometry
  {
    name: 'Odometry',
    icon: '<>',
    color: '#00ff00',
    pattern: /nav_msgs\/Odometry/,
    targetPanel: 'map-2d',
    priority: 80,
  },
  // Navigation - Pose
  {
    name: 'Pose',
    icon: '+',
    color: '#ffff00',
    pattern: /geometry_msgs\/(Pose|PoseStamped|PoseWithCovariance|PoseWithCovarianceStamped)/,
    targetPanel: 'map-2d',
    priority: 75,
  },
  // Navigation - Map
  {
    name: 'Map',
    icon: '#',
    color: '#ff8800',
    pattern: /nav_msgs\/(OccupancyGrid|GridCells|Path|MapMetaData)/,
    targetPanel: 'map-2d',
    priority: 85,
  },
  // 3D Visualization
  {
    name: '3D Markers',
    icon: '◆',
    color: '#ff00aa',
    pattern: /visualization_msgs\/(Marker|MarkerArray)/,
    targetPanel: 'map-3d',
    priority: 70,
  },
  // Control - Twist/Velocity
  {
    name: 'Velocity',
    icon: '>',
    color: '#ff88ff',
    pattern: /geometry_msgs\/(Twist|TwistStamped|TwistWithCovariance)/,
    targetPanel: 'controls',
    priority: 60,
  },
  // IMU (no panel yet)
  {
    name: 'IMU',
    icon: '*',
    color: '#88ff00',
    pattern: /sensor_msgs\/Imu/,
    targetPanel: null,
    priority: 50,
  },
  // TF (no panel yet)
  {
    name: 'TF',
    icon: '@',
    color: '#8888ff',
    pattern: /tf2_msgs\/TFMessage|tf\/tfMessage/,
    targetPanel: null,
    priority: 40,
  },
  // Joint State (no panel yet)
  {
    name: 'Joints',
    icon: '⚙',
    color: '#aaaaaa',
    pattern: /sensor_msgs\/JointState/,
    targetPanel: null,
    priority: 30,
  },
  // Diagnostics (robot-status)
  {
    name: 'Diagnostics',
    icon: '!',
    color: '#ffaa00',
    pattern: /diagnostic_msgs\/(DiagnosticArray|DiagnosticStatus)/,
    targetPanel: 'robot-status',
    priority: 20,
  },
]

// =============================================================================
// Registry API
// =============================================================================

/**
 * Get category definition for a message type
 */
export function getCategoryForType(msgType: string): TopicCategoryDef | null {
  // Sort by priority descending
  const sorted = [...TOPIC_REGISTRY].sort((a, b) => b.priority - a.priority)
  return sorted.find((cat) => cat.pattern.test(msgType)) ?? null
}

/**
 * Get target panel for a message type
 */
export function getTargetPanel(msgType: string): ModuleType | null {
  const category = getCategoryForType(msgType)
  return category?.targetPanel ?? null
}

/**
 * Check if a message type can be visualized
 */
export function canVisualize(msgType: string): boolean {
  return getTargetPanel(msgType) !== null
}

/**
 * Get display info for a message type
 */
export function getTypeDisplayInfo(msgType: string): {
  name: string
  icon: string
  color: string
} {
  const category = getCategoryForType(msgType)
  if (category) {
    return {
      name: category.name,
      icon: category.icon,
      color: category.color,
    }
  }
  return {
    name: 'Unknown',
    icon: '?',
    color: '#666666',
  }
}

/**
 * Get all categories that target a specific panel
 */
export function getCategoriesForPanel(panelType: ModuleType): TopicCategoryDef[] {
  return TOPIC_REGISTRY.filter((cat) => cat.targetPanel === panelType)
}

/**
 * Get short type name (e.g., "LaserScan" from "sensor_msgs/LaserScan")
 */
export function getShortTypeName(msgType: string): string {
  const parts = msgType.split('/')
  return parts[parts.length - 1] || msgType
}

export default TOPIC_REGISTRY
