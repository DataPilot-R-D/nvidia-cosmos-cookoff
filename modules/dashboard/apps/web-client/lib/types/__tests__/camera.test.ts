/**
 * Camera Source Types Tests
 *
 * @see T1.1 — Camera Source Registry
 */

import { CameraSourceSchema, type CameraSource } from '../camera'

describe('CameraSource Schema', () => {
  const validSource: CameraSource = {
    id: 'test-cam',
    name: 'Test Camera',
    kind: 'sim',
    streamUrl: '/robot0/front_cam/rgb',
    webrtcCapable: false,
    tags: ['test'],
    status: 'unknown',
  }

  it('validates a correct CameraSource', () => {
    const result = CameraSourceSchema.safeParse(validSource)
    expect(result.success).toBe(true)
  })

  it('accepts all valid kinds', () => {
    for (const kind of ['sim', 'cctv', 'usb'] as const) {
      const result = CameraSourceSchema.safeParse({ ...validSource, kind })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid kind', () => {
    const result = CameraSourceSchema.safeParse({ ...validSource, kind: 'thermal' })
    expect(result.success).toBe(false)
  })

  it('accepts all valid statuses', () => {
    for (const status of ['online', 'offline', 'unknown'] as const) {
      const result = CameraSourceSchema.safeParse({ ...validSource, status })
      expect(result.success).toBe(true)
    }
  })

  it('rejects empty id', () => {
    const result = CameraSourceSchema.safeParse({ ...validSource, id: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing fields', () => {
    const { id, ...partial } = validSource
    const result = CameraSourceSchema.safeParse(partial)
    expect(result.success).toBe(false)
  })

  it('accepts empty tags array', () => {
    const result = CameraSourceSchema.safeParse({ ...validSource, tags: [] })
    expect(result.success).toBe(true)
  })
})
