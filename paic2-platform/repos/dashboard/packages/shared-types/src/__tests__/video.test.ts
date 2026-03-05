/**
 * Video Schema Tests
 *
 * TDD tests for video streaming and WebRTC signaling schemas
 */

import { describe, it, expect } from 'vitest'
import {
  VideoFormatSchema,
  VideoFrameMetadataSchema,
  CameraSubscribeMessageSchema,
  CameraUnsubscribeMessageSchema,
  WebRTCOfferMessageSchema,
  WebRTCAnswerMessageSchema,
  WebRTCIceCandidateMessageSchema,
  type VideoFrameMetadata,
  type CameraSubscribeMessage,
} from '../video'

// =============================================================================
// Test Data
// =============================================================================

const validFrameMetadata: VideoFrameMetadata = {
  cameraId: 'cam-001',
  robotId: 'robot-001',
  format: 'jpeg',
  width: 1280,
  height: 720,
  frameNumber: 42,
  timestamp: Date.now(),
  quality: 75,
  fps: 30,
}

// =============================================================================
// VideoFormatSchema Tests
// =============================================================================

describe('VideoFormatSchema', () => {
  it('should accept valid format values', () => {
    const validFormats = ['jpeg', 'webp', 'png']

    validFormats.forEach((format) => {
      expect(VideoFormatSchema.parse(format)).toBe(format)
    })
  })

  it('should reject invalid format values', () => {
    expect(() => VideoFormatSchema.parse('gif')).toThrow()
    expect(() => VideoFormatSchema.parse('mp4')).toThrow()
    expect(() => VideoFormatSchema.parse('')).toThrow()
  })
})

// =============================================================================
// VideoFrameMetadataSchema Tests
// =============================================================================

describe('VideoFrameMetadataSchema', () => {
  it('should validate complete frame metadata', () => {
    const result = VideoFrameMetadataSchema.parse(validFrameMetadata)
    expect(result).toEqual(validFrameMetadata)
  })

  it('should accept minimal required fields', () => {
    const minimal = {
      cameraId: 'cam-001',
      robotId: 'robot-001',
      format: 'jpeg',
      width: 640,
      height: 480,
      frameNumber: 0,
      timestamp: Date.now(),
    }

    const result = VideoFrameMetadataSchema.parse(minimal)
    expect(result.cameraId).toBe('cam-001')
    expect(result.quality).toBeUndefined()
    expect(result.fps).toBeUndefined()
  })

  it('should require positive dimensions', () => {
    const zeroWidth = { ...validFrameMetadata, width: 0 }
    expect(() => VideoFrameMetadataSchema.parse(zeroWidth)).toThrow()

    const negativeHeight = { ...validFrameMetadata, height: -480 }
    expect(() => VideoFrameMetadataSchema.parse(negativeHeight)).toThrow()
  })

  it('should validate quality range 1-100', () => {
    const lowQuality = { ...validFrameMetadata, quality: 1 }
    expect(VideoFrameMetadataSchema.parse(lowQuality).quality).toBe(1)

    const highQuality = { ...validFrameMetadata, quality: 100 }
    expect(VideoFrameMetadataSchema.parse(highQuality).quality).toBe(100)

    const tooLow = { ...validFrameMetadata, quality: 0 }
    expect(() => VideoFrameMetadataSchema.parse(tooLow)).toThrow()

    const tooHigh = { ...validFrameMetadata, quality: 101 }
    expect(() => VideoFrameMetadataSchema.parse(tooHigh)).toThrow()
  })

  it('should require non-negative frameNumber', () => {
    const negative = { ...validFrameMetadata, frameNumber: -1 }
    expect(() => VideoFrameMetadataSchema.parse(negative)).toThrow()

    const zero = { ...validFrameMetadata, frameNumber: 0 }
    expect(VideoFrameMetadataSchema.parse(zero).frameNumber).toBe(0)
  })

  it('should validate fps as positive number', () => {
    const validFps = { ...validFrameMetadata, fps: 60 }
    expect(VideoFrameMetadataSchema.parse(validFps).fps).toBe(60)

    const zeroFps = { ...validFrameMetadata, fps: 0 }
    expect(() => VideoFrameMetadataSchema.parse(zeroFps)).toThrow()
  })
})

// =============================================================================
// CameraSubscribeMessageSchema Tests
// =============================================================================

describe('CameraSubscribeMessageSchema', () => {
  it('should validate camera_subscribe message', () => {
    const message: CameraSubscribeMessage = {
      type: 'camera_subscribe',
      timestamp: Date.now(),
      data: {
        cameraId: 'cam-001',
        robotId: 'robot-001',
        quality: 75,
        maxFps: 30,
      },
    }

    const result = CameraSubscribeMessageSchema.parse(message)
    expect(result.type).toBe('camera_subscribe')
    expect(result.data.cameraId).toBe('cam-001')
  })

  it('should apply default values for quality and maxFps', () => {
    const minimal = {
      type: 'camera_subscribe',
      timestamp: Date.now(),
      data: {
        cameraId: 'cam-001',
        robotId: 'robot-001',
      },
    }

    const result = CameraSubscribeMessageSchema.parse(minimal)
    expect(result.data.quality).toBe(75) // Default
    expect(result.data.maxFps).toBe(15) // Default
  })

  it('should validate quality range 1-100', () => {
    const tooLow = {
      type: 'camera_subscribe',
      timestamp: Date.now(),
      data: {
        cameraId: 'cam-001',
        robotId: 'robot-001',
        quality: 0,
      },
    }

    expect(() => CameraSubscribeMessageSchema.parse(tooLow)).toThrow()
  })

  it('should validate maxFps max 30', () => {
    const tooHigh = {
      type: 'camera_subscribe',
      timestamp: Date.now(),
      data: {
        cameraId: 'cam-001',
        robotId: 'robot-001',
        maxFps: 60, // Too high
      },
    }

    expect(() => CameraSubscribeMessageSchema.parse(tooHigh)).toThrow()
  })
})

// =============================================================================
// CameraUnsubscribeMessageSchema Tests
// =============================================================================

describe('CameraUnsubscribeMessageSchema', () => {
  it('should validate camera_unsubscribe message', () => {
    const message = {
      type: 'camera_unsubscribe',
      timestamp: Date.now(),
      data: {
        cameraId: 'cam-001',
      },
    }

    const result = CameraUnsubscribeMessageSchema.parse(message)
    expect(result.type).toBe('camera_unsubscribe')
    expect(result.data.cameraId).toBe('cam-001')
  })

  it('should require cameraId', () => {
    const missing = {
      type: 'camera_unsubscribe',
      timestamp: Date.now(),
      data: {},
    }

    expect(() => CameraUnsubscribeMessageSchema.parse(missing)).toThrow()
  })
})

// =============================================================================
// WebRTC Signaling Tests
// =============================================================================

describe('WebRTCOfferMessageSchema', () => {
  it('should validate webrtc_offer message', () => {
    const offer = {
      type: 'webrtc_offer',
      timestamp: Date.now(),
      data: {
        cameraId: 'cam-001',
        clientId: 'client-abc123',
        sdp: 'v=0\r\no=- 1234567890 2 IN IP4 127.0.0.1\r\n...',
      },
    }

    const result = WebRTCOfferMessageSchema.parse(offer)
    expect(result.type).toBe('webrtc_offer')
    expect(result.data.sdp).toContain('v=0')
  })

  it('should require cameraId, clientId, and sdp', () => {
    const missingSdp = {
      type: 'webrtc_offer',
      timestamp: Date.now(),
      data: {
        cameraId: 'cam-001',
        clientId: 'client-abc',
      },
    }

    expect(() => WebRTCOfferMessageSchema.parse(missingSdp)).toThrow()
  })
})

describe('WebRTCAnswerMessageSchema', () => {
  it('should validate webrtc_answer message', () => {
    const answer = {
      type: 'webrtc_answer',
      timestamp: Date.now(),
      data: {
        cameraId: 'cam-001',
        clientId: 'client-abc123',
        sdp: 'v=0\r\no=- 9876543210 2 IN IP4 192.168.1.1\r\n...',
      },
    }

    const result = WebRTCAnswerMessageSchema.parse(answer)
    expect(result.type).toBe('webrtc_answer')
  })
})

describe('WebRTCIceCandidateMessageSchema', () => {
  it('should validate webrtc_ice message', () => {
    const ice = {
      type: 'webrtc_ice',
      timestamp: Date.now(),
      data: {
        cameraId: 'cam-001',
        clientId: 'client-abc123',
        candidate: 'candidate:1 1 UDP 2122252543 192.168.1.1 12345 typ host',
        sdpMid: 'video',
        sdpMLineIndex: 0,
      },
    }

    const result = WebRTCIceCandidateMessageSchema.parse(ice)
    expect(result.type).toBe('webrtc_ice')
    expect(result.data.candidate).toContain('candidate:')
  })

  it('should allow optional sdpMid and sdpMLineIndex', () => {
    const minimal = {
      type: 'webrtc_ice',
      timestamp: Date.now(),
      data: {
        cameraId: 'cam-001',
        clientId: 'client-abc',
        candidate: 'candidate:1 1 UDP 2122252543 192.168.1.1 12345 typ host',
      },
    }

    const result = WebRTCIceCandidateMessageSchema.parse(minimal)
    expect(result.data.sdpMid).toBeUndefined()
  })

  it('should accept null candidate for end-of-candidates', () => {
    const endOfCandidates = {
      type: 'webrtc_ice',
      timestamp: Date.now(),
      data: {
        cameraId: 'cam-001',
        clientId: 'client-abc',
        candidate: null,
      },
    }

    const result = WebRTCIceCandidateMessageSchema.parse(endOfCandidates)
    expect(result.data.candidate).toBeNull()
  })
})
