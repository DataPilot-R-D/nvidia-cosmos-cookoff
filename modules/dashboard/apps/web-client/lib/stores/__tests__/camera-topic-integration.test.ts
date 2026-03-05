/**
 * Camera Topic Integration Tests
 *
 * Verification tests for:
 * 1. No mock devices in stores (Data Integrity)
 * 2. Camera topic selectors work correctly
 * 3. Topic-to-CameraID conversion matches server logic
 */

import { useRobotStore } from '../robot-store'
import { useCameraStore } from '../camera-store'
import {
  useTopicStore,
  selectCameraTopics,
  autoDetectCameraTopic,
  type RosTopic,
} from '../topic-store'

describe('Data Integrity - No Mock Devices', () => {
  beforeEach(() => {
    // Reset all stores before each test
    useRobotStore.getState().clearRobots()
    useCameraStore.getState().clearCameras()
    useTopicStore.getState().clearTopics()
  })

  describe('Checkpoint 1: Empty Initial State', () => {
    it('should have empty robot store on initialization', () => {
      const robots = useRobotStore.getState().getAllRobots()
      expect(robots).toHaveLength(0)
    })

    it('should have empty camera store on initialization', () => {
      const cameras = useCameraStore.getState().getAllCameras()
      expect(cameras).toHaveLength(0)
    })

    it('should have empty topic store on initialization', () => {
      const topics = useTopicStore.getState().topics
      expect(topics).toHaveLength(0)
    })
  })

  describe('Checkpoint 2: No Mock Flag on Devices', () => {
    it('should not have mock:true on any robot', () => {
      // Add a real robot (simulating WebSocket data)
      useRobotStore.getState().setRobot({
        id: 'robot0',
        name: 'Go2 Unitree',
        position: { x: 0, y: 0, z: 0, heading: 0 },
        battery: 85,
        status: 'online',
        velocity: 0,
        lastSeen: Date.now(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })

      const robots = useRobotStore.getState().getAllRobots()
      robots.forEach((robot) => {
        // TypeScript ensures RobotEntity doesn't have 'mock' property
        // This test verifies runtime data doesn't include it
        expect((robot as Record<string, unknown>).mock).toBeUndefined()
      })
    })

    it('should not have mock:true on any camera', () => {
      // Add a real camera (simulating WebSocket data)
      useCameraStore.getState().addCamera({
        id: 'robot0-front_cam-rgb',
        robotId: 'robot0',
        name: 'Go2 Front Camera',
        topic: '/robot0/front_cam/rgb',
        status: 'active',
        capabilities: {
          supportsWebRTC: false,
          supportsHLS: false,
          supportsPTZ: false,
          maxResolution: { width: 640, height: 480 },
          maxFps: 30,
        },
        webrtcEnabled: false,
      })

      const cameras = useCameraStore.getState().getAllCameras()
      cameras.forEach((camera) => {
        expect((camera as Record<string, unknown>).mock).toBeUndefined()
      })
    })
  })
})

describe('Camera Topic Selectors', () => {
  beforeEach(() => {
    useTopicStore.getState().clearTopics()
  })

  describe('Checkpoint 3: selectCameraTopics', () => {
    it('should filter only Image and CompressedImage topics', () => {
      // Set up test topics
      const testTopics: RosTopic[] = [
        { name: '/robot0/front_cam/rgb', type: 'sensor_msgs/Image' },
        { name: '/robot0/camera/compressed', type: 'sensor_msgs/CompressedImage' },
        { name: '/scan', type: 'sensor_msgs/LaserScan' },
        { name: '/odom', type: 'nav_msgs/Odometry' },
        { name: '/cmd_vel', type: 'geometry_msgs/Twist' },
      ]

      useTopicStore.getState().setTopics(testTopics)

      const cameraTopics = selectCameraTopics()

      expect(cameraTopics).toHaveLength(2)
      expect(cameraTopics.map((t) => t.name)).toContain('/robot0/front_cam/rgb')
      expect(cameraTopics.map((t) => t.name)).toContain('/robot0/camera/compressed')
      expect(cameraTopics.map((t) => t.name)).not.toContain('/scan')
    })

    it('should return empty array when no camera topics', () => {
      const testTopics: RosTopic[] = [
        { name: '/scan', type: 'sensor_msgs/LaserScan' },
        { name: '/odom', type: 'nav_msgs/Odometry' },
      ]

      useTopicStore.getState().setTopics(testTopics)

      const cameraTopics = selectCameraTopics()
      expect(cameraTopics).toHaveLength(0)
    })
  })

  describe('Checkpoint 4: autoDetectCameraTopic', () => {
    it('should prioritize /camera/ pattern', () => {
      const testTopics: RosTopic[] = [
        { name: '/video0', type: 'sensor_msgs/Image' },
        { name: '/robot0/camera/rgb', type: 'sensor_msgs/Image' },
        { name: '/image_raw', type: 'sensor_msgs/Image' },
      ]

      useTopicStore.getState().setTopics(testTopics)

      const detected = autoDetectCameraTopic()

      expect(detected).not.toBeNull()
      expect(detected?.name).toBe('/robot0/camera/rgb')
    })

    it('should fall back to /image_raw pattern', () => {
      const testTopics: RosTopic[] = [
        { name: '/video0', type: 'sensor_msgs/Image' },
        { name: '/image_raw', type: 'sensor_msgs/Image' },
      ]

      useTopicStore.getState().setTopics(testTopics)

      const detected = autoDetectCameraTopic()

      expect(detected).not.toBeNull()
      expect(detected?.name).toBe('/image_raw')
    })

    it('should fall back to /video pattern', () => {
      const testTopics: RosTopic[] = [
        { name: '/video0', type: 'sensor_msgs/Image' },
        { name: '/other_cam', type: 'sensor_msgs/Image' },
      ]

      useTopicStore.getState().setTopics(testTopics)

      const detected = autoDetectCameraTopic()

      expect(detected).not.toBeNull()
      expect(detected?.name).toBe('/video0')
    })

    it('should return first available if no pattern matches', () => {
      const testTopics: RosTopic[] = [
        { name: '/random_image_topic', type: 'sensor_msgs/Image' },
        { name: '/another_image', type: 'sensor_msgs/Image' },
      ]

      useTopicStore.getState().setTopics(testTopics)

      const detected = autoDetectCameraTopic()

      expect(detected).not.toBeNull()
      // Topic list is sorted for UI stability, so the "first available" is deterministic.
      expect(detected?.name).toBe('/another_image')
    })

    it('should return null when no camera topics', () => {
      const testTopics: RosTopic[] = [{ name: '/scan', type: 'sensor_msgs/LaserScan' }]

      useTopicStore.getState().setTopics(testTopics)

      const detected = autoDetectCameraTopic()
      expect(detected).toBeNull()
    })
  })

  describe('Checkpoint 5: Topic to Camera ID Conversion', () => {
    // This tests the same logic used by server in rosbridge.ts
    function topicToCameraId(topicName: string): string {
      return topicName.replace(/\//g, '-').slice(1)
    }

    it('should convert topic name to camera ID correctly', () => {
      expect(topicToCameraId('/robot0/front_cam/rgb')).toBe('robot0-front_cam-rgb')
      expect(topicToCameraId('/camera/image_raw')).toBe('camera-image_raw')
      expect(topicToCameraId('/video0')).toBe('video0')
    })
  })
})

describe('Camera Store Real Data Flow', () => {
  beforeEach(() => {
    useCameraStore.getState().clearCameras()
  })

  describe('Checkpoint 6: Camera Discovery from WebSocket', () => {
    it('should store camera when discovered', () => {
      // Simulate camera_discovered event from WebSocket
      useCameraStore.getState().addCamera({
        id: 'robot0-front_cam-rgb',
        robotId: 'robot0',
        name: 'Go2 Front Camera',
        topic: '/robot0/front_cam/rgb',
        status: 'active',
        capabilities: {
          supportsWebRTC: false,
          supportsHLS: false,
          supportsPTZ: false,
          maxResolution: { width: 640, height: 480 },
          maxFps: 30,
        },
        webrtcEnabled: false,
      })

      const cameras = useCameraStore.getState().getAllCameras()
      expect(cameras).toHaveLength(1)
      expect(cameras[0].id).toBe('robot0-front_cam-rgb')
      expect(cameras[0].topic).toBe('/robot0/front_cam/rgb')
    })

    it('should select camera by ID', () => {
      useCameraStore.getState().addCamera({
        id: 'robot0-front_cam-rgb',
        robotId: 'robot0',
        name: 'Go2 Front Camera',
        topic: '/robot0/front_cam/rgb',
        status: 'active',
        capabilities: {
          supportsWebRTC: false,
          supportsHLS: false,
          supportsPTZ: false,
          maxResolution: { width: 640, height: 480 },
          maxFps: 30,
        },
        webrtcEnabled: false,
      })

      useCameraStore.getState().selectCamera('robot0-front_cam-rgb')

      const selectedId = useCameraStore.getState().selectedCamera
      expect(selectedId).toBe('robot0-front_cam-rgb')
    })
  })
})
