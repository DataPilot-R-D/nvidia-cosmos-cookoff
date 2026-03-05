/**
 * ROSBridge Types and Configuration
 *
 * Shared types and constants for ROSBridge handlers.
 */

import WebSocket from 'ws'

// =============================================================================
// Types
// =============================================================================

export interface RosbridgeMessage {
  op: string
  topic?: string
  type?: string
  msg?: unknown
  id?: string
  service?: string
  args?: unknown
  result?: unknown
  values?: unknown
  // Action-related fields
  feedback?: unknown
  status?: number
  action?: string
  // QoS settings (ROS2)
  qos?: QoSProfile
}

/**
 * QoS Profile for ROS2 topic subscriptions
 * Critical for topics like /map that use transient_local durability
 */
export interface QoSProfile {
  /** 'volatile' (default) | 'transient_local' (for latched topics like /map) */
  durability?: 'volatile' | 'transient_local'
  /** 'reliable' | 'best_effort' */
  reliability?: 'reliable' | 'best_effort'
  /** 'keep_last' | 'keep_all' */
  history?: 'keep_last' | 'keep_all'
  /** Queue depth (default: 10) */
  depth?: number
}

/**
 * Pre-defined QoS profiles for common use cases
 */
export const QOS_PROFILES = {
  /** For map topics (/map, /map_volatile, costmaps) - transient_local to receive latched messages */
  MAP: {
    durability: 'transient_local',
    reliability: 'reliable',
    history: 'keep_last',
    depth: 1,
  } as QoSProfile,

  /** Default QoS for most topics */
  DEFAULT: {
    durability: 'volatile',
    reliability: 'reliable',
    history: 'keep_last',
    depth: 10,
  } as QoSProfile,

  /** For high-frequency sensor data */
  SENSOR: {
    durability: 'volatile',
    reliability: 'best_effort',
    history: 'keep_last',
    depth: 5,
  } as QoSProfile,
}

export interface LidarPointCloud {
  points: Array<{ x: number; y: number; z: number; intensity?: number }>
  timestamp: number
  frameId: string
}

export interface RosbridgeClientState {
  ws: WebSocket | null
  isConnected: boolean
  reconnectAttempts: number
  subscribedTopics: Set<string>
  heartbeatInterval: NodeJS.Timeout | null
  lastPong: number
  /** Last time we emitted a `ros_topics` list (ms since epoch). */
  lastTopicsEmittedAt: number
}

// =============================================================================
// Configuration
// =============================================================================

export const ROSBRIDGE_CONFIG = {
  reconnectDelay: 2000,
  maxReconnectAttempts: 10,
  heartbeatInterval: 10000,
  /** Timeout for ping response before considering connection dead */
  pingTimeout: 5000,
  /** Target FPS for video streaming fallback (throttle) */
  targetVideoFps: 30,
  /** Minimum interval between frames in ms */
  minFrameInterval: 1000 / 30, // ~33ms for 30 FPS (JPEG is ~50KB/frame)
}

// Default topics to subscribe
export const DEFAULT_TOPICS = {
  // Navigation topics
  scan: '/scan',
  cmdVel: '/cmd_vel',
  odom: '/odom',
  map: '/map',
  mapLive: '/map_live',
  goalPose: '/goal_pose',
  plan: '/plan',
  localPlan: '/local_plan',

  // Robot0 (Go2 Unitree / Isaac Sim) specific topics
  robot0CmdVel: '/robot0/cmd_vel',
  robot0Camera: '/robot0/front_cam/rgb',
  robot0States: '/robot0/go2_states',
  robot0Imu: '/robot0/imu',
  robot0JointStates: '/robot0/joint_states',
  robot0Odom: '/robot0/odom',
  robot0Lidar: '/robot0/point_cloud2_L1',
  robot0LidarExtra: '/robot0/point_cloud2_extra',

  // Costmaps
  globalCostmap: '/global_costmap/costmap',
  localCostmap: '/local_costmap/costmap',

  // SLAM
  slamGraph: '/slam_toolbox/graph_visualization',
  slamScan: '/slam_toolbox/scan_visualization',
  slamMap: '/slam_toolbox/map', // Dynamic map output from SLAM Toolbox

  // Transforms
  tf: '/tf',
  tfStatic: '/tf_static',

  // Nav2 Action Feedback
  navFeedback: '/navigate_to_pose/_action/feedback',
  navStatus: '/navigate_to_pose/_action/status',

  // Vision LLM
  visionLlmResult: '/vision_llm/result',
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Infer topic type from topic name when type is not provided
 */
export function inferTopicType(topic: string): string {
  if (topic.includes('scan') || topic.includes('lidar')) {
    return 'sensor_msgs/LaserScan'
  }
  if (topic.includes('point_cloud') || topic.includes('pointcloud')) {
    return 'sensor_msgs/PointCloud2'
  }
  if (topic.includes('image/compressed') || topic.includes('/compressed')) {
    return 'sensor_msgs/CompressedImage'
  }
  if (topic.includes('image') || topic.includes('camera') || topic.includes('cam/rgb')) {
    return 'sensor_msgs/Image'
  }
  if (topic.includes('odom')) {
    return 'nav_msgs/Odometry'
  }
  if (topic.includes('cmd_vel') || topic.includes('twist')) {
    return 'geometry_msgs/Twist'
  }
  if (topic.includes('pose') || topic.includes('position')) {
    return 'geometry_msgs/PoseStamped'
  }
  if (topic.includes('map') || topic.includes('costmap')) {
    return 'nav_msgs/OccupancyGrid'
  }
  if (topic.includes('path') || topic.includes('plan')) {
    return 'nav_msgs/Path'
  }
  if (topic.includes('imu')) {
    return 'sensor_msgs/Imu'
  }
  if (topic.includes('joint_states')) {
    return 'sensor_msgs/JointState'
  }
  if (topic.includes('tf')) {
    return 'tf2_msgs/TFMessage'
  }
  return 'std_msgs/String'
}
