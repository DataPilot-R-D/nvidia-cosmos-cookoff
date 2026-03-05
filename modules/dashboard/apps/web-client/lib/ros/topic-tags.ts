/**
 * ROS Topic Tags
 *
 * Human-facing tags/badges for ROS topics.
 * Goal: quickly see which dashboard tools/modules can handle a given topic.
 *
 * The mapping is config-driven: add/adjust rules in TOPIC_TAG_RULES.
 */

export interface TopicTag {
  label: string
  color: string
}

export interface TopicTagRule {
  /** Tag label shown in UI */
  tag: TopicTag
  /** Match by topic name (e.g., /scan) */
  namePattern?: RegExp
  /** Match by message type (e.g., sensor_msgs/Image) */
  typePattern?: RegExp
}

// =============================================================================
// Config
// =============================================================================

/**
 * Topic tag rules (order doesn't matter; tags are de-duplicated by label).
 *
 * Keep this file as the single place Piotr can extend in the future.
 */
export const TOPIC_TAG_RULES: TopicTagRule[] = [
  {
    tag: { label: 'Camera', color: '#ff00ff' },
    typePattern: /sensor_msgs\/(Image|CompressedImage)/,
  },
  {
    tag: { label: 'SLAM', color: '#ff8800' },
    namePattern: /(\/slam_toolbox\b)|(\/map(_live)?$)|(\/scan$)/,
  },
  {
    tag: { label: 'Navigation', color: '#00ff00' },
    namePattern:
      /(\/odom$)|(\/cmd_vel$)|(\/navigate_to_pose\b)|(\/plan$)|(\/goal_pose$)|(\/tf(_static)?$)/,
  },
  {
    tag: { label: 'LIDAR', color: '#00ffff' },
    typePattern: /sensor_msgs\/(LaserScan|PointCloud2)/,
  },
  {
    tag: { label: 'DMOES', color: '#7c3aed' },
    namePattern: /\/dmoes\b/i,
  },
]

// =============================================================================
// Helpers
// =============================================================================

/**
 * Return de-duplicated UI tags for a ROS topic based on name/type rules.
 *
 * @param topicName - The ROS topic name (e.g., `/scan`).
 * @param topicType - Optional ROS message type (e.g., `sensor_msgs/Image`).
 * @returns Array of matching tags (unique by label).
 */
export function getTopicTags(topicName: string, topicType?: string): TopicTag[] {
  const tags = new Map<string, TopicTag>()

  for (const rule of TOPIC_TAG_RULES) {
    const matchesName = rule.namePattern ? rule.namePattern.test(topicName) : false
    const matchesType = rule.typePattern && topicType ? rule.typePattern.test(topicType) : false

    if (matchesName || matchesType) {
      tags.set(rule.tag.label, rule.tag)
    }
  }

  return Array.from(tags.values())
}
