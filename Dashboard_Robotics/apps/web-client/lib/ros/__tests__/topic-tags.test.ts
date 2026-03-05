import { getTopicTags } from '../topic-tags'

describe('getTopicTags', () => {
  it('adds Camera tag from message type', () => {
    const tags = getTopicTags('/robot0/front_cam/rgb', 'sensor_msgs/Image')
    expect(tags.map((t) => t.label)).toContain('Camera')
  })

  it('adds SLAM + Navigation tags for /scan (multi-tag)', () => {
    const tags = getTopicTags('/scan', 'sensor_msgs/LaserScan')
    const labels = tags.map((t) => t.label)
    expect(labels).toContain('SLAM')
    expect(labels).toContain('LIDAR')
  })

  it('returns empty list for unknown topics', () => {
    const tags = getTopicTags('/some/custom/topic', 'custom_msgs/Foo')
    expect(tags).toEqual([])
  })
})
