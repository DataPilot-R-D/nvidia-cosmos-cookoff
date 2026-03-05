/**
 * LIDAR Type Tests
 *
 * Tests for LIDAR point cloud message schemas.
 * @see research-summary.md Section 2.2
 */

import { describe, it, expect } from 'vitest'
import {
  LidarPointSchema,
  LidarHeaderSchema,
  LidarScanMessageSchema,
  LidarStreamMessageSchema,
  type LidarPoint,
  type LidarHeader,
  type LidarScanMessage,
  type LidarStreamMessage,
} from '../lidar'

// =============================================================================
// Test Data
// =============================================================================

const validHeader: LidarHeader = {
  timestamp: Date.now(),
  frameId: 'lidar_link',
  robotId: 'robot-001',
}

const validPoint: LidarPoint = {
  x: 1.5,
  y: 2.3,
  z: 0.1,
  intensity: 128,
}

const validScanMessage: LidarScanMessage = {
  type: 'lidar_scan',
  timestamp: Date.now(),
  data: {
    header: validHeader,
    pointCount: 1024,
    rangeMin: 0.1,
    rangeMax: 30.0,
    angleMin: -Math.PI,
    angleMax: Math.PI,
    angleIncrement: 0.01,
  },
}

const validStreamMessage: LidarStreamMessage = {
  type: 'lidar_stream',
  timestamp: Date.now(),
  data: {
    robotId: 'robot-001',
    frameId: 'lidar_link',
    pointCount: 2048,
    format: 'xyz_intensity',
    compressionType: 'none',
  },
}

// =============================================================================
// LidarPointSchema Tests
// =============================================================================

describe('LidarPointSchema', () => {
  it('should validate a valid LIDAR point', () => {
    const result = LidarPointSchema.safeParse(validPoint)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.x).toBe(1.5)
      expect(result.data.y).toBe(2.3)
      expect(result.data.z).toBe(0.1)
      expect(result.data.intensity).toBe(128)
    }
  })

  it('should allow point without intensity', () => {
    const point = { x: 1.0, y: 2.0, z: 0.5 }
    const result = LidarPointSchema.safeParse(point)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.intensity).toBeUndefined()
    }
  })

  it('should allow point with color', () => {
    const point = { x: 1.0, y: 2.0, z: 0.5, r: 255, g: 128, b: 64 }
    const result = LidarPointSchema.safeParse(point)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.r).toBe(255)
      expect(result.data.g).toBe(128)
      expect(result.data.b).toBe(64)
    }
  })

  it('should reject point with invalid x coordinate', () => {
    const point = { x: 'invalid', y: 2.0, z: 0.5 }
    const result = LidarPointSchema.safeParse(point)
    expect(result.success).toBe(false)
  })

  it('should reject point missing required fields', () => {
    const point = { x: 1.0 }
    const result = LidarPointSchema.safeParse(point)
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// LidarHeaderSchema Tests
// =============================================================================

describe('LidarHeaderSchema', () => {
  it('should validate a valid LIDAR header', () => {
    const result = LidarHeaderSchema.safeParse(validHeader)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.robotId).toBe('robot-001')
      expect(result.data.frameId).toBe('lidar_link')
    }
  })

  it('should reject header with missing robotId', () => {
    const header = { timestamp: Date.now(), frameId: 'lidar_link' }
    const result = LidarHeaderSchema.safeParse(header)
    expect(result.success).toBe(false)
  })

  it('should reject header with invalid timestamp', () => {
    const header = { timestamp: 'invalid', frameId: 'lidar_link', robotId: 'robot-001' }
    const result = LidarHeaderSchema.safeParse(header)
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// LidarScanMessageSchema Tests
// =============================================================================

describe('LidarScanMessageSchema', () => {
  it('should validate a valid LIDAR scan message', () => {
    const result = LidarScanMessageSchema.safeParse(validScanMessage)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('lidar_scan')
      expect(result.data.data.pointCount).toBe(1024)
      expect(result.data.data.header.robotId).toBe('robot-001')
    }
  })

  it('should validate scan with range parameters', () => {
    const result = LidarScanMessageSchema.safeParse(validScanMessage)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.data.rangeMin).toBe(0.1)
      expect(result.data.data.rangeMax).toBe(30.0)
      expect(result.data.data.angleMin).toBe(-Math.PI)
      expect(result.data.data.angleMax).toBe(Math.PI)
    }
  })

  it('should reject message with wrong type', () => {
    const message = { ...validScanMessage, type: 'wrong_type' }
    const result = LidarScanMessageSchema.safeParse(message)
    expect(result.success).toBe(false)
  })

  it('should reject message with negative pointCount', () => {
    const message = {
      ...validScanMessage,
      data: { ...validScanMessage.data, pointCount: -1 },
    }
    const result = LidarScanMessageSchema.safeParse(message)
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// LidarStreamMessageSchema Tests
// =============================================================================

describe('LidarStreamMessageSchema', () => {
  it('should validate a valid LIDAR stream message', () => {
    const result = LidarStreamMessageSchema.safeParse(validStreamMessage)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.type).toBe('lidar_stream')
      expect(result.data.data.robotId).toBe('robot-001')
      expect(result.data.data.format).toBe('xyz_intensity')
    }
  })

  it('should validate stream with compression', () => {
    const message = {
      ...validStreamMessage,
      data: { ...validStreamMessage.data, compressionType: 'gzip' as const },
    }
    const result = LidarStreamMessageSchema.safeParse(message)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.data.compressionType).toBe('gzip')
    }
  })

  it('should allow xyz format without intensity', () => {
    const message = {
      ...validStreamMessage,
      data: { ...validStreamMessage.data, format: 'xyz' as const },
    }
    const result = LidarStreamMessageSchema.safeParse(message)
    expect(result.success).toBe(true)
  })

  it('should reject message with invalid format', () => {
    const message = {
      ...validStreamMessage,
      data: { ...validStreamMessage.data, format: 'invalid' },
    }
    const result = LidarStreamMessageSchema.safeParse(message)
    expect(result.success).toBe(false)
  })
})

// =============================================================================
// Type Inference Tests
// =============================================================================

describe('Type Inference', () => {
  it('should correctly infer LidarPoint type', () => {
    const point: LidarPoint = {
      x: 1.0,
      y: 2.0,
      z: 0.5,
      intensity: 100,
    }
    expect(typeof point.x).toBe('number')
  })

  it('should correctly infer LidarScanMessage type', () => {
    const message: LidarScanMessage = validScanMessage
    expect(message.type).toBe('lidar_scan')
  })
})
