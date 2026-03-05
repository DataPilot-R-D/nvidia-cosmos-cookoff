/**
 * Camera Schema Tests
 *
 * TDD tests for camera entity and capability schemas
 */

import { describe, it, expect } from 'vitest'
import {
  CameraStatusSchema,
  CameraCapabilitiesSchema,
  CameraEntitySchema,
  CameraDiscoveredMessageSchema,
  CameraLostMessageSchema,
  type CameraEntity,
  type CameraCapabilities,
} from '../camera'

// =============================================================================
// Test Data
// =============================================================================

const validCameraCapabilities: CameraCapabilities = {
  supportsWebRTC: true,
  supportsHLS: true,
  supportsPTZ: false,
  maxResolution: { width: 1920, height: 1080 },
  maxFps: 30,
}

const validCamera: CameraEntity = {
  id: 'cam-001',
  robotId: 'robot-001',
  name: 'Front Camera',
  topic: '/robot_001/camera_front/image_compressed',
  status: 'active',
  capabilities: validCameraCapabilities,
  hlsUrl: 'http://localhost:8888/camera1/playlist.m3u8',
  webrtcEnabled: true,
}

// =============================================================================
// CameraStatusSchema Tests
// =============================================================================

describe('CameraStatusSchema', () => {
  it('should accept valid status values', () => {
    const validStatuses = ['active', 'inactive', 'error', 'connecting']

    validStatuses.forEach((status) => {
      expect(CameraStatusSchema.parse(status)).toBe(status)
    })
  })

  it('should reject invalid status values', () => {
    expect(() => CameraStatusSchema.parse('unknown')).toThrow()
    expect(() => CameraStatusSchema.parse('')).toThrow()
    expect(() => CameraStatusSchema.parse(123)).toThrow()
  })
})

// =============================================================================
// CameraCapabilitiesSchema Tests
// =============================================================================

describe('CameraCapabilitiesSchema', () => {
  it('should validate correct capabilities', () => {
    const result = CameraCapabilitiesSchema.parse(validCameraCapabilities)
    expect(result).toEqual(validCameraCapabilities)
  })

  it('should require all boolean fields', () => {
    const incomplete = {
      supportsWebRTC: true,
      // missing supportsHLS, supportsPTZ
      maxResolution: { width: 640, height: 480 },
      maxFps: 15,
    }

    expect(() => CameraCapabilitiesSchema.parse(incomplete)).toThrow()
  })

  it('should validate maxResolution as object with width and height', () => {
    const invalidResolution = {
      ...validCameraCapabilities,
      maxResolution: { w: 1920, h: 1080 }, // Wrong property names
    }

    expect(() => CameraCapabilitiesSchema.parse(invalidResolution)).toThrow()
  })

  it('should require positive values for resolution and fps', () => {
    const negativeWidth = {
      ...validCameraCapabilities,
      maxResolution: { width: -1920, height: 1080 },
    }

    expect(() => CameraCapabilitiesSchema.parse(negativeWidth)).toThrow()

    const zeroFps = {
      ...validCameraCapabilities,
      maxFps: 0,
    }

    expect(() => CameraCapabilitiesSchema.parse(zeroFps)).toThrow()
  })
})

// =============================================================================
// CameraEntitySchema Tests
// =============================================================================

describe('CameraEntitySchema', () => {
  it('should validate a complete camera entity', () => {
    const result = CameraEntitySchema.parse(validCamera)
    expect(result).toEqual(validCamera)
  })

  it('should require id, robotId, name, topic, status, capabilities', () => {
    const minimalCamera = {
      id: 'cam-002',
      robotId: 'robot-001',
      name: 'Rear Camera',
      topic: '/robot_001/camera_rear/image_raw',
      status: 'connecting',
      capabilities: validCameraCapabilities,
    }

    const result = CameraEntitySchema.parse(minimalCamera)
    expect(result.id).toBe('cam-002')
    expect(result.webrtcEnabled).toBe(false) // Default value
  })

  it('should accept optional hlsUrl as valid URL', () => {
    const withHls = {
      ...validCamera,
      hlsUrl: 'http://video.example.com/stream.m3u8',
    }

    const result = CameraEntitySchema.parse(withHls)
    expect(result.hlsUrl).toBe('http://video.example.com/stream.m3u8')
  })

  it('should reject invalid hlsUrl', () => {
    const invalidHls = {
      ...validCamera,
      hlsUrl: 'not-a-url',
    }

    expect(() => CameraEntitySchema.parse(invalidHls)).toThrow()
  })

  it('should default webrtcEnabled to false', () => {
    const withoutWebrtc = {
      id: 'cam-003',
      robotId: 'robot-001',
      name: 'Side Camera',
      topic: '/camera/image',
      status: 'active',
      capabilities: validCameraCapabilities,
    }

    const result = CameraEntitySchema.parse(withoutWebrtc)
    expect(result.webrtcEnabled).toBe(false)
  })

  it('should reject empty strings for id, name, topic', () => {
    const emptyId = { ...validCamera, id: '' }
    expect(() => CameraEntitySchema.parse(emptyId)).toThrow()

    const emptyTopic = { ...validCamera, topic: '' }
    expect(() => CameraEntitySchema.parse(emptyTopic)).toThrow()
  })
})

// =============================================================================
// CameraDiscoveredMessageSchema Tests
// =============================================================================

describe('CameraDiscoveredMessageSchema', () => {
  it('should validate camera_discovered message', () => {
    const message = {
      type: 'camera_discovered',
      timestamp: Date.now(),
      data: validCamera,
    }

    const result = CameraDiscoveredMessageSchema.parse(message)
    expect(result.type).toBe('camera_discovered')
    expect(result.data.id).toBe('cam-001')
  })

  it('should require type to be exactly "camera_discovered"', () => {
    const wrongType = {
      type: 'camera_found', // Wrong type
      timestamp: Date.now(),
      data: validCamera,
    }

    expect(() => CameraDiscoveredMessageSchema.parse(wrongType)).toThrow()
  })

  it('should require data to be valid CameraEntity', () => {
    const invalidData = {
      type: 'camera_discovered',
      timestamp: Date.now(),
      data: { id: 'cam-001' }, // Incomplete camera
    }

    expect(() => CameraDiscoveredMessageSchema.parse(invalidData)).toThrow()
  })
})

// =============================================================================
// CameraLostMessageSchema Tests
// =============================================================================

describe('CameraLostMessageSchema', () => {
  it('should validate camera_lost message', () => {
    const message = {
      type: 'camera_lost',
      timestamp: Date.now(),
      data: {
        cameraId: 'cam-001',
        robotId: 'robot-001',
      },
    }

    const result = CameraLostMessageSchema.parse(message)
    expect(result.type).toBe('camera_lost')
    expect(result.data.cameraId).toBe('cam-001')
  })

  it('should require cameraId in data', () => {
    const missingCameraId = {
      type: 'camera_lost',
      timestamp: Date.now(),
      data: {
        robotId: 'robot-001',
      },
    }

    expect(() => CameraLostMessageSchema.parse(missingCameraId)).toThrow()
  })
})
