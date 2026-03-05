/**
 * Default Cameras Config Tests
 *
 * @see T1.3 — Isaac fixed cameras config
 */

import { DEFAULT_CAMERAS } from '../default-cameras'
import { CameraSourceSchema } from '@/lib/types/camera'

describe('DEFAULT_CAMERAS', () => {
  it('contains at least one camera', () => {
    expect(DEFAULT_CAMERAS.length).toBeGreaterThan(0)
  })

  it('all entries pass CameraSource schema validation', () => {
    for (const cam of DEFAULT_CAMERAS) {
      const result = CameraSourceSchema.safeParse(cam)
      expect(result.success).toBe(true)
    }
  })

  it('all entries are kind=sim', () => {
    for (const cam of DEFAULT_CAMERAS) {
      expect(cam.kind).toBe('sim')
    }
  })

  it('all entries have unique ids', () => {
    const ids = DEFAULT_CAMERAS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all entries have isaac tag', () => {
    for (const cam of DEFAULT_CAMERAS) {
      expect(cam.tags).toContain('isaac')
    }
  })

  it('front RGB camera exists with correct topic', () => {
    const front = DEFAULT_CAMERAS.find((c) => c.id === 'isaac-front-rgb')
    expect(front).toBeDefined()
    expect(front!.streamUrl).toBe('/robot0/front_cam/rgb')
  })
})
