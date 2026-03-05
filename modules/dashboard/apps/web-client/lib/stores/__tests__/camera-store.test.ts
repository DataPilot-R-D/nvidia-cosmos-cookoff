/**
 * Camera Store Tests
 *
 * Tests for the Zustand camera store managing discovered cameras
 * and active video streams.
 */

import { useCameraStore } from '../camera-store'
import type { CameraEntity, CameraStatus } from '@workspace/shared-types'

// =============================================================================
// Test Data
// =============================================================================

function createTestCamera(overrides: Partial<CameraEntity> = {}): CameraEntity {
  return {
    id: 'camera-001',
    robotId: 'robot-001',
    name: 'Front Camera',
    topic: '/robot_001/camera_front/image',
    status: 'active' as CameraStatus,
    capabilities: {
      supportsWebRTC: true,
      supportsHLS: true,
      supportsPTZ: false,
      maxResolution: { width: 1920, height: 1080 },
      maxFps: 30,
    },
    webrtcEnabled: true,
    ...overrides,
  }
}

// =============================================================================
// Store Tests
// =============================================================================

describe('useCameraStore', () => {
  // Reset store before each test
  beforeEach(() => {
    useCameraStore.setState({
      cameras: new Map(),
      activeStreams: new Map(),
      selectedCamera: null,
    })
  })

  describe('initial state', () => {
    it('should have empty cameras map', () => {
      const { cameras } = useCameraStore.getState()
      expect(cameras).toBeInstanceOf(Map)
      expect(cameras.size).toBe(0)
    })

    it('should have empty activeStreams map', () => {
      const { activeStreams } = useCameraStore.getState()
      expect(activeStreams).toBeInstanceOf(Map)
      expect(activeStreams.size).toBe(0)
    })

    it('should have null selectedCamera', () => {
      const { selectedCamera } = useCameraStore.getState()
      expect(selectedCamera).toBeNull()
    })
  })

  describe('addCamera', () => {
    it('should add camera to store', () => {
      const { addCamera } = useCameraStore.getState()
      const camera = createTestCamera()

      addCamera(camera)

      const { cameras } = useCameraStore.getState()
      expect(cameras.get(camera.id)).toEqual(camera)
    })

    it('should replace camera with same ID', () => {
      const { addCamera } = useCameraStore.getState()
      const camera1 = createTestCamera({ name: 'Camera V1' })
      const camera2 = createTestCamera({ name: 'Camera V2' })

      addCamera(camera1)
      addCamera(camera2)

      const { cameras } = useCameraStore.getState()
      expect(cameras.size).toBe(1)
      expect(cameras.get(camera1.id)?.name).toBe('Camera V2')
    })

    it('should handle multiple cameras', () => {
      const { addCamera } = useCameraStore.getState()
      const camera1 = createTestCamera({ id: 'cam-1', name: 'Camera 1' })
      const camera2 = createTestCamera({ id: 'cam-2', name: 'Camera 2' })

      addCamera(camera1)
      addCamera(camera2)

      const { cameras } = useCameraStore.getState()
      expect(cameras.size).toBe(2)
    })
  })

  describe('removeCamera', () => {
    it('should remove camera from store', () => {
      const { addCamera, removeCamera } = useCameraStore.getState()
      const camera = createTestCamera()

      addCamera(camera)
      removeCamera(camera.id)

      const { cameras } = useCameraStore.getState()
      expect(cameras.has(camera.id)).toBe(false)
    })

    it('should handle removing non-existent camera', () => {
      const { removeCamera } = useCameraStore.getState()

      removeCamera('non-existent')

      const { cameras } = useCameraStore.getState()
      expect(cameras.size).toBe(0)
    })

    it('should clean up active stream when camera removed', () => {
      const { addCamera, setActiveStream, removeCamera } = useCameraStore.getState()
      const camera = createTestCamera()

      addCamera(camera)
      setActiveStream(camera.id, {
        mode: 'hls',
        status: 'live',
        startedAt: Date.now(),
      })
      removeCamera(camera.id)

      const { activeStreams } = useCameraStore.getState()
      expect(activeStreams.has(camera.id)).toBe(false)
    })

    it('should clear selectedCamera if it was the removed camera', () => {
      const { addCamera, selectCamera, removeCamera } = useCameraStore.getState()
      const camera = createTestCamera()

      addCamera(camera)
      selectCamera(camera.id)
      removeCamera(camera.id)

      const { selectedCamera } = useCameraStore.getState()
      expect(selectedCamera).toBeNull()
    })
  })

  describe('updateCamera', () => {
    it('should update camera with partial data', () => {
      const { addCamera, updateCamera } = useCameraStore.getState()
      const camera = createTestCamera({ status: 'connecting' as CameraStatus })

      addCamera(camera)
      updateCamera(camera.id, { status: 'active' as CameraStatus })

      const { cameras } = useCameraStore.getState()
      expect(cameras.get(camera.id)?.status).toBe('active')
    })

    it('should not modify other fields', () => {
      const { addCamera, updateCamera } = useCameraStore.getState()
      const camera = createTestCamera()

      addCamera(camera)
      updateCamera(camera.id, { status: 'error' as CameraStatus })

      const { cameras } = useCameraStore.getState()
      const updated = cameras.get(camera.id)
      expect(updated?.name).toBe(camera.name)
      expect(updated?.robotId).toBe(camera.robotId)
    })

    it('should do nothing for non-existent camera', () => {
      const { updateCamera } = useCameraStore.getState()

      updateCamera('non-existent', { status: 'active' as CameraStatus })

      const { cameras } = useCameraStore.getState()
      expect(cameras.size).toBe(0)
    })
  })

  describe('selectCamera', () => {
    it('should set selected camera', () => {
      const { addCamera, selectCamera } = useCameraStore.getState()
      const camera = createTestCamera()

      addCamera(camera)
      selectCamera(camera.id)

      const { selectedCamera } = useCameraStore.getState()
      expect(selectedCamera).toBe(camera.id)
    })

    it('should allow selecting null', () => {
      const { addCamera, selectCamera } = useCameraStore.getState()
      const camera = createTestCamera()

      addCamera(camera)
      selectCamera(camera.id)
      selectCamera(null)

      const { selectedCamera } = useCameraStore.getState()
      expect(selectedCamera).toBeNull()
    })
  })

  describe('setActiveStream', () => {
    it('should set active stream for camera', () => {
      const { addCamera, setActiveStream } = useCameraStore.getState()
      const camera = createTestCamera()
      const streamInfo = {
        mode: 'webrtc' as const,
        status: 'connecting' as const,
        startedAt: Date.now(),
      }

      addCamera(camera)
      setActiveStream(camera.id, streamInfo)

      const { activeStreams } = useCameraStore.getState()
      expect(activeStreams.get(camera.id)).toEqual(streamInfo)
    })

    it('should update stream status', () => {
      const { addCamera, setActiveStream } = useCameraStore.getState()
      const camera = createTestCamera()

      addCamera(camera)
      setActiveStream(camera.id, {
        mode: 'hls',
        status: 'connecting',
        startedAt: Date.now(),
      })
      setActiveStream(camera.id, {
        mode: 'hls',
        status: 'live',
        startedAt: Date.now(),
      })

      const { activeStreams } = useCameraStore.getState()
      expect(activeStreams.get(camera.id)?.status).toBe('live')
    })
  })

  describe('removeActiveStream', () => {
    it('should remove active stream', () => {
      const { addCamera, setActiveStream, removeActiveStream } = useCameraStore.getState()
      const camera = createTestCamera()

      addCamera(camera)
      setActiveStream(camera.id, {
        mode: 'hls',
        status: 'live',
        startedAt: Date.now(),
      })
      removeActiveStream(camera.id)

      const { activeStreams } = useCameraStore.getState()
      expect(activeStreams.has(camera.id)).toBe(false)
    })
  })

  describe('selectors', () => {
    describe('getCameraById', () => {
      it('should return camera by ID', () => {
        const { addCamera } = useCameraStore.getState()
        const camera = createTestCamera()

        addCamera(camera)

        const result = useCameraStore.getState().getCameraById(camera.id)
        expect(result).toEqual(camera)
      })

      it('should return undefined for non-existent camera', () => {
        const result = useCameraStore.getState().getCameraById('non-existent')
        expect(result).toBeUndefined()
      })
    })

    describe('getCamerasByRobot', () => {
      it('should return cameras for specific robot', () => {
        const { addCamera } = useCameraStore.getState()
        const camera1 = createTestCamera({ id: 'cam-1', robotId: 'robot-001' })
        const camera2 = createTestCamera({ id: 'cam-2', robotId: 'robot-001' })
        const camera3 = createTestCamera({ id: 'cam-3', robotId: 'robot-002' })

        addCamera(camera1)
        addCamera(camera2)
        addCamera(camera3)

        const robot1Cameras = useCameraStore.getState().getCamerasByRobot('robot-001')
        expect(robot1Cameras).toHaveLength(2)
        expect(robot1Cameras.map((c) => c.id)).toContain('cam-1')
        expect(robot1Cameras.map((c) => c.id)).toContain('cam-2')
      })

      it('should return empty array for robot with no cameras', () => {
        const result = useCameraStore.getState().getCamerasByRobot('robot-999')
        expect(result).toEqual([])
      })
    })

    describe('getAllCameras', () => {
      it('should return all cameras as array', () => {
        const { addCamera } = useCameraStore.getState()
        const camera1 = createTestCamera({ id: 'cam-1' })
        const camera2 = createTestCamera({ id: 'cam-2' })

        addCamera(camera1)
        addCamera(camera2)

        const result = useCameraStore.getState().getAllCameras()
        expect(result).toHaveLength(2)
      })

      it('should return empty array when no cameras', () => {
        const result = useCameraStore.getState().getAllCameras()
        expect(result).toEqual([])
      })
    })

    describe('getActiveCameras', () => {
      it('should return only active status cameras', () => {
        const { addCamera } = useCameraStore.getState()
        const activeCam = createTestCamera({ id: 'active', status: 'active' as CameraStatus })
        const connectingCam = createTestCamera({
          id: 'connecting',
          status: 'connecting' as CameraStatus,
        })
        const errorCam = createTestCamera({ id: 'error', status: 'error' as CameraStatus })

        addCamera(activeCam)
        addCamera(connectingCam)
        addCamera(errorCam)

        const result = useCameraStore.getState().getActiveCameras()
        expect(result).toHaveLength(1)
        expect(result[0].id).toBe('active')
      })
    })

    describe('getCameraCount', () => {
      it('should return camera count', () => {
        const { addCamera } = useCameraStore.getState()
        const camera1 = createTestCamera({ id: 'cam-1' })
        const camera2 = createTestCamera({ id: 'cam-2' })

        addCamera(camera1)
        addCamera(camera2)

        const count = useCameraStore.getState().getCameraCount()
        expect(count).toBe(2)
      })
    })
  })

  describe('clearCameras', () => {
    it('should clear all cameras', () => {
      const { addCamera, clearCameras } = useCameraStore.getState()
      const camera1 = createTestCamera({ id: 'cam-1' })
      const camera2 = createTestCamera({ id: 'cam-2' })

      addCamera(camera1)
      addCamera(camera2)
      clearCameras()

      const { cameras } = useCameraStore.getState()
      expect(cameras.size).toBe(0)
    })

    it('should clear active streams', () => {
      const { addCamera, setActiveStream, clearCameras } = useCameraStore.getState()
      const camera = createTestCamera()

      addCamera(camera)
      setActiveStream(camera.id, {
        mode: 'hls',
        status: 'live',
        startedAt: Date.now(),
      })
      clearCameras()

      const { activeStreams } = useCameraStore.getState()
      expect(activeStreams.size).toBe(0)
    })

    it('should clear selectedCamera', () => {
      const { addCamera, selectCamera, clearCameras } = useCameraStore.getState()
      const camera = createTestCamera()

      addCamera(camera)
      selectCamera(camera.id)
      clearCameras()

      const { selectedCamera } = useCameraStore.getState()
      expect(selectedCamera).toBeNull()
    })
  })

  describe('immutability', () => {
    it('should create new Map on addCamera', () => {
      const { cameras: originalCameras } = useCameraStore.getState()
      const { addCamera } = useCameraStore.getState()
      const camera = createTestCamera()

      addCamera(camera)

      const { cameras: newCameras } = useCameraStore.getState()
      expect(newCameras).not.toBe(originalCameras)
    })

    it('should create new Map on removeCamera', () => {
      const { addCamera, removeCamera } = useCameraStore.getState()
      const camera = createTestCamera()

      addCamera(camera)

      const { cameras: beforeRemove } = useCameraStore.getState()

      removeCamera(camera.id)

      const { cameras: afterRemove } = useCameraStore.getState()
      expect(afterRemove).not.toBe(beforeRemove)
    })
  })
})
