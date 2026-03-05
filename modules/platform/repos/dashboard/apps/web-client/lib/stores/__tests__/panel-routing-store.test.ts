/**
 * Panel Routing Store Tests
 *
 * Headless verification of dynamic topic routing (Foxglove-style).
 *
 * Test Checkpoints:
 * 1. visualizeTopic('/scan', 'sensor_msgs/LaserScan') changes store state for 'lidar'
 * 2. Store state is correctly updated with topic assignment
 * 3. Multiple panel types are routed correctly
 */

import { usePanelRoutingStore } from '../panel-routing-store'

describe('Panel Routing Store', () => {
  beforeEach(() => {
    // Reset store before each test
    usePanelRoutingStore.getState().clearAll()
  })

  describe('Checkpoint 1: visualizeTopic changes store state', () => {
    it('should route /scan topic to lidar panel', () => {
      const store = usePanelRoutingStore.getState()

      // Execute action
      const result = store.visualizeTopic('/scan', 'sensor_msgs/LaserScan')

      // Verify result
      expect(result).toBe('lidar')

      // Verify store state
      const updatedState = usePanelRoutingStore.getState()
      expect(updatedState.panels['lidar']).not.toBeNull()
      expect(updatedState.panels['lidar']?.topicName).toBe('/scan')
      expect(updatedState.panels['lidar']?.msgType).toBe('sensor_msgs/LaserScan')
    })

    it('should route PointCloud2 topic to lidar panel', () => {
      const store = usePanelRoutingStore.getState()

      const result = store.visualizeTopic('/robot0/pointcloud', 'sensor_msgs/PointCloud2')

      expect(result).toBe('lidar')
      expect(usePanelRoutingStore.getState().panels['lidar']?.topicName).toBe('/robot0/pointcloud')
    })
  })

  describe('Checkpoint 2: Camera topic routing', () => {
    it('should route Image topic to camera panel', () => {
      const store = usePanelRoutingStore.getState()

      const result = store.visualizeTopic('/camera/image_raw', 'sensor_msgs/Image')

      expect(result).toBe('camera')
      expect(usePanelRoutingStore.getState().panels['camera']?.topicName).toBe('/camera/image_raw')
    })

    it('should route CompressedImage topic to camera panel', () => {
      const store = usePanelRoutingStore.getState()

      const result = store.visualizeTopic('/camera/compressed', 'sensor_msgs/CompressedImage')

      expect(result).toBe('camera')
    })
  })

  describe('Checkpoint 3: Navigation topic routing', () => {
    it('should route Odometry topic to map-2d panel', () => {
      const store = usePanelRoutingStore.getState()

      const result = store.visualizeTopic('/odom', 'nav_msgs/Odometry')

      expect(result).toBe('map-2d')
      expect(usePanelRoutingStore.getState().panels['map-2d']?.topicName).toBe('/odom')
    })

    it('should route OccupancyGrid topic to map-2d panel', () => {
      const store = usePanelRoutingStore.getState()

      const result = store.visualizeTopic('/map', 'nav_msgs/OccupancyGrid')

      expect(result).toBe('map-2d')
    })

    it('should route Pose topic to map-2d panel', () => {
      const store = usePanelRoutingStore.getState()

      const result = store.visualizeTopic('/robot_pose', 'geometry_msgs/PoseStamped')

      expect(result).toBe('map-2d')
    })
  })

  describe('Checkpoint 4: Controls topic routing', () => {
    it('should route Twist topic to controls panel', () => {
      const store = usePanelRoutingStore.getState()

      const result = store.visualizeTopic('/cmd_vel', 'geometry_msgs/Twist')

      expect(result).toBe('controls')
      expect(usePanelRoutingStore.getState().panels['controls']?.topicName).toBe('/cmd_vel')
    })
  })

  describe('Checkpoint 5: Non-visualizable topics', () => {
    it('should return null for IMU topic (no panel)', () => {
      const store = usePanelRoutingStore.getState()

      const result = store.visualizeTopic('/imu/data', 'sensor_msgs/Imu')

      expect(result).toBeNull()
      expect(usePanelRoutingStore.getState().panels['imu']).toBeUndefined()
    })

    it('should return null for TF topic (no panel)', () => {
      const store = usePanelRoutingStore.getState()

      const result = store.visualizeTopic('/tf', 'tf2_msgs/TFMessage')

      expect(result).toBeNull()
    })

    it('should return null for unknown topic type', () => {
      const store = usePanelRoutingStore.getState()

      const result = store.visualizeTopic('/custom/topic', 'custom_msgs/Unknown')

      expect(result).toBeNull()
    })
  })

  describe('Checkpoint 6: Topic replacement', () => {
    it('should replace existing topic when new one is assigned', () => {
      const store = usePanelRoutingStore.getState()

      // Assign first topic
      store.visualizeTopic('/scan', 'sensor_msgs/LaserScan')
      expect(usePanelRoutingStore.getState().panels['lidar']?.topicName).toBe('/scan')

      // Assign second topic - should replace
      store.visualizeTopic('/robot0/scan', 'sensor_msgs/LaserScan')
      expect(usePanelRoutingStore.getState().panels['lidar']?.topicName).toBe('/robot0/scan')
    })
  })

  describe('Checkpoint 7: Manual assignment', () => {
    it('should allow manual topic assignment to any panel', () => {
      const store = usePanelRoutingStore.getState()

      store.assignTopic('lidar', '/custom/scan', 'sensor_msgs/LaserScan')

      expect(usePanelRoutingStore.getState().panels['lidar']?.topicName).toBe('/custom/scan')
    })
  })

  describe('Checkpoint 8: Panel clearing', () => {
    it('should clear topic from panel', () => {
      const store = usePanelRoutingStore.getState()

      // Assign topic
      store.visualizeTopic('/scan', 'sensor_msgs/LaserScan')
      expect(usePanelRoutingStore.getState().panels['lidar']).not.toBeNull()

      // Clear panel
      store.clearPanel('lidar')
      expect(usePanelRoutingStore.getState().panels['lidar']).toBeNull()
    })
  })

  describe('Checkpoint 9: History tracking', () => {
    it('should track assignment history', () => {
      const store = usePanelRoutingStore.getState()

      store.visualizeTopic('/scan', 'sensor_msgs/LaserScan')
      store.visualizeTopic('/camera/image_raw', 'sensor_msgs/Image')
      store.visualizeTopic('/odom', 'nav_msgs/Odometry')

      const history = usePanelRoutingStore.getState().history
      expect(history.length).toBe(3)
      expect(history[0].panelType).toBe('map-2d') // Most recent first
      expect(history[1].panelType).toBe('camera')
      expect(history[2].panelType).toBe('lidar')
    })

    it('should limit history to 10 entries', () => {
      const store = usePanelRoutingStore.getState()

      // Add 15 entries
      for (let i = 0; i < 15; i++) {
        store.visualizeTopic(`/scan${i}`, 'sensor_msgs/LaserScan')
      }

      const history = usePanelRoutingStore.getState().history
      expect(history.length).toBe(10)
    })
  })

  describe('Checkpoint 10: getActiveTopic selector', () => {
    it('should return active topic for panel', () => {
      const store = usePanelRoutingStore.getState()

      store.visualizeTopic('/scan', 'sensor_msgs/LaserScan')

      const activeTopic = store.getActiveTopic('lidar')
      expect(activeTopic?.topicName).toBe('/scan')
    })

    it('should return null for panel without topic', () => {
      const store = usePanelRoutingStore.getState()

      const activeTopic = store.getActiveTopic('camera')
      expect(activeTopic).toBeNull()
    })
  })
})
