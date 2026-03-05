import { useTopicStore, __resetTopicMissCountsForTests } from '../topic-store'

describe('topic-store setTopics stability', () => {
  beforeEach(() => {
    __resetTopicMissCountsForTests()
    useTopicStore.getState().clearTopics()
  })

  it('keeps a topic for a few refreshes even if it temporarily disappears', () => {
    useTopicStore.getState().setTopics([
      { name: '/scan', type: 'sensor_msgs/LaserScan' },
      { name: '/odom', type: 'nav_msgs/Odometry' },
    ])

    // Next refresh: /scan missing (flaky rosapi response)
    useTopicStore.getState().setTopics([{ name: '/odom', type: 'nav_msgs/Odometry' }])

    const names1 = useTopicStore.getState().topics.map((t) => t.name)
    expect(names1).toContain('/scan')

    // After 3 consecutive misses, it should be removed
    useTopicStore.getState().setTopics([{ name: '/odom', type: 'nav_msgs/Odometry' }])
    useTopicStore.getState().setTopics([{ name: '/odom', type: 'nav_msgs/Odometry' }])

    const names2 = useTopicStore.getState().topics.map((t) => t.name)
    expect(names2).not.toContain('/scan')
  })

  it('sorts topics by name for stable UI ordering', () => {
    useTopicStore.getState().setTopics([
      { name: '/z', type: 'std_msgs/String' },
      { name: '/a', type: 'std_msgs/String' },
    ])

    const names = useTopicStore.getState().topics.map((t) => t.name)
    expect(names).toEqual(['/a', '/z'])
  })
})
