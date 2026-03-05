/**
 * Video Frame Store Tests
 *
 * Tests for video frame state management.
 */

import { useVideoFrameStore } from '../video-frame-store'
import type { VideoFrameMetadata } from '@workspace/shared-types'

// =============================================================================
// Test Helpers
// =============================================================================

function createTestMetadata(overrides: Partial<VideoFrameMetadata> = {}): VideoFrameMetadata {
  return {
    cameraId: 'camera-001',
    robotId: 'robot-001',
    format: 'jpeg',
    width: 640,
    height: 480,
    frameNumber: 1,
    timestamp: Date.now(),
    quality: 75,
    fps: 30,
    ...overrides,
  }
}

function createTestFrameData(size: number = 1000): ArrayBuffer {
  const buffer = new ArrayBuffer(size)
  const view = new Uint8Array(buffer)
  for (let i = 0; i < size; i++) {
    view[i] = i % 256
  }
  return buffer
}

// =============================================================================
// Tests
// =============================================================================

describe('useVideoFrameStore', () => {
  beforeEach(() => {
    // Reset store - now using Record instead of Map
    useVideoFrameStore.setState({
      frames: {},
    })
  })

  describe('initial state', () => {
    it('should have empty frames object', () => {
      const { frames } = useVideoFrameStore.getState()
      expect(Object.keys(frames).length).toBe(0)
    })
  })

  describe('addFrame', () => {
    it('should add frame for camera', () => {
      const metadata = createTestMetadata()
      const data = createTestFrameData()

      useVideoFrameStore.getState().addFrame('camera-001', metadata, data)

      const frame = useVideoFrameStore.getState().getFrame('camera-001')
      expect(frame).toBeDefined()
      expect(frame?.metadata).toEqual(metadata)
    })

    it('should create blob URL or data URL from frame data', () => {
      const metadata = createTestMetadata()
      const data = createTestFrameData()

      useVideoFrameStore.getState().addFrame('camera-001', metadata, data)

      const frame = useVideoFrameStore.getState().getFrame('camera-001')
      // Can be either blob: URL or data: URL depending on implementation
      expect(frame?.dataUrl).toMatch(/^(blob:|data:image\/jpeg)/)
    })

    it('should update existing frame', () => {
      const metadata1 = createTestMetadata({ frameNumber: 1 })
      const metadata2 = createTestMetadata({ frameNumber: 2 })
      const data = createTestFrameData()

      useVideoFrameStore.getState().addFrame('camera-001', metadata1, data)
      useVideoFrameStore.getState().addFrame('camera-001', metadata2, data)

      const frame = useVideoFrameStore.getState().getFrame('camera-001')
      expect(frame?.metadata?.frameNumber).toBe(2)
    })

    it('should track frame count', () => {
      const data = createTestFrameData()

      for (let i = 0; i < 5; i++) {
        const metadata = createTestMetadata({ frameNumber: i })
        useVideoFrameStore.getState().addFrame('camera-001', metadata, data)
      }

      const frame = useVideoFrameStore.getState().getFrame('camera-001')
      expect(frame?.frameCount).toBe(5)
    })
  })

  describe('clearFrames', () => {
    it('should remove frames for camera', () => {
      const metadata = createTestMetadata()
      const data = createTestFrameData()

      useVideoFrameStore.getState().addFrame('camera-001', metadata, data)
      useVideoFrameStore.getState().clearFrames('camera-001')

      const frame = useVideoFrameStore.getState().getFrame('camera-001')
      expect(frame).toBeUndefined()
    })

    it('should not affect other cameras', () => {
      const metadata1 = createTestMetadata({ cameraId: 'camera-001' })
      const metadata2 = createTestMetadata({ cameraId: 'camera-002' })
      const data = createTestFrameData()

      useVideoFrameStore.getState().addFrame('camera-001', metadata1, data)
      useVideoFrameStore.getState().addFrame('camera-002', metadata2, data)
      useVideoFrameStore.getState().clearFrames('camera-001')

      expect(useVideoFrameStore.getState().getFrame('camera-001')).toBeUndefined()
      expect(useVideoFrameStore.getState().getFrame('camera-002')).toBeDefined()
    })
  })

  describe('getFrame', () => {
    it('should return undefined for non-existent camera', () => {
      const frame = useVideoFrameStore.getState().getFrame('non-existent')
      expect(frame).toBeUndefined()
    })

    it('should return frame state for existing camera', () => {
      const metadata = createTestMetadata()
      const data = createTestFrameData()

      useVideoFrameStore.getState().addFrame('camera-001', metadata, data)

      const frame = useVideoFrameStore.getState().getFrame('camera-001')
      expect(frame).toBeDefined()
      expect(frame?.metadata?.cameraId).toBe('camera-001')
    })
  })

  describe('getFps', () => {
    it('should return 0 for non-existent camera', () => {
      const fps = useVideoFrameStore.getState().getFps('non-existent')
      expect(fps).toBe(0)
    })

    it('should return calculated FPS', () => {
      const metadata = createTestMetadata()
      const data = createTestFrameData()

      // Add frame
      useVideoFrameStore.getState().addFrame('camera-001', metadata, data)

      const fps = useVideoFrameStore.getState().getFps('camera-001')
      expect(typeof fps).toBe('number')
    })
  })

  describe('multiple cameras', () => {
    it('should handle frames from multiple cameras', () => {
      const data = createTestFrameData()

      for (let i = 1; i <= 3; i++) {
        const metadata = createTestMetadata({ cameraId: `camera-00${i}` })
        useVideoFrameStore.getState().addFrame(`camera-00${i}`, metadata, data)
      }

      const { frames } = useVideoFrameStore.getState()
      expect(Object.keys(frames).length).toBe(3)
      expect(useVideoFrameStore.getState().getFrame('camera-001')).toBeDefined()
      expect(useVideoFrameStore.getState().getFrame('camera-002')).toBeDefined()
      expect(useVideoFrameStore.getState().getFrame('camera-003')).toBeDefined()
    })
  })
})
