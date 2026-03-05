/**
 * Camera Source Store Tests
 *
 * @see T1.6 — Camera Sources store
 */

import { useCameraSourceStore } from '../camera-source-store'
import { type CameraSource } from '@/lib/types/camera'
import { DEFAULT_CAMERAS } from '@/lib/config/default-cameras'

beforeEach(() => {
  useCameraSourceStore.getState().reset()
})

describe('CameraSourceStore', () => {
  describe('Initial State', () => {
    it('initializes with DEFAULT_CAMERAS', () => {
      const sources = useCameraSourceStore.getState().getAllSources()
      expect(sources.length).toBe(DEFAULT_CAMERAS.length)
    })

    it('each default camera is accessible by id', () => {
      for (const cam of DEFAULT_CAMERAS) {
        const source = useCameraSourceStore.getState().getSource(cam.id)
        expect(source).toBeDefined()
        expect(source!.name).toBe(cam.name)
      }
    })
  })

  describe('upsertSource', () => {
    const newCam: CameraSource = {
      id: 'cctv-entrance',
      name: 'Entrance CCTV',
      kind: 'cctv',
      streamUrl: 'rtsp://192.168.1.50/stream1',
      webrtcCapable: true,
      tags: ['security', 'entrance'],
      status: 'online',
    }

    it('adds a new source', () => {
      useCameraSourceStore.getState().upsertSource(newCam)
      const source = useCameraSourceStore.getState().getSource('cctv-entrance')
      expect(source).toEqual(newCam)
    })

    it('updates an existing source', () => {
      useCameraSourceStore.getState().upsertSource(newCam)
      useCameraSourceStore.getState().upsertSource({ ...newCam, status: 'offline' })
      const source = useCameraSourceStore.getState().getSource('cctv-entrance')
      expect(source!.status).toBe('offline')
    })
  })

  describe('removeSource', () => {
    it('removes a source by id', () => {
      const id = DEFAULT_CAMERAS[0].id
      useCameraSourceStore.getState().removeSource(id)
      expect(useCameraSourceStore.getState().getSource(id)).toBeUndefined()
    })

    it('no-ops for unknown id', () => {
      const before = useCameraSourceStore.getState().getAllSources().length
      useCameraSourceStore.getState().removeSource('nonexistent')
      expect(useCameraSourceStore.getState().getAllSources().length).toBe(before)
    })
  })

  describe('setStatus', () => {
    it('updates status of existing source', () => {
      const id = DEFAULT_CAMERAS[0].id
      useCameraSourceStore.getState().setStatus(id, 'online')
      expect(useCameraSourceStore.getState().getSource(id)!.status).toBe('online')
    })

    it('no-ops for unknown id', () => {
      const before = useCameraSourceStore.getState().sources
      useCameraSourceStore.getState().setStatus('nonexistent', 'online')
      expect(useCameraSourceStore.getState().sources).toBe(before)
    })
  })

  describe('setSources', () => {
    it('replaces all sources', () => {
      const cam: CameraSource = {
        id: 'only-one',
        name: 'Only',
        kind: 'usb',
        streamUrl: '/dev/video0',
        webrtcCapable: false,
        tags: [],
        status: 'online',
      }
      useCameraSourceStore.getState().setSources([cam])
      const all = useCameraSourceStore.getState().getAllSources()
      expect(all).toHaveLength(1)
      expect(all[0].id).toBe('only-one')
    })
  })

  describe('Selectors', () => {
    it('getByKind filters correctly', () => {
      const simCams = useCameraSourceStore.getState().getByKind('sim')
      expect(simCams.length).toBe(DEFAULT_CAMERAS.length)
      expect(useCameraSourceStore.getState().getByKind('cctv')).toHaveLength(0)
    })

    it('getByTag filters correctly', () => {
      const frontCams = useCameraSourceStore.getState().getByTag('front')
      expect(frontCams.length).toBeGreaterThan(0)
      expect(frontCams.every((c) => c.tags.includes('front'))).toBe(true)
    })
  })

  describe('reset', () => {
    it('restores default cameras', () => {
      useCameraSourceStore.getState().setSources([])
      expect(useCameraSourceStore.getState().getAllSources()).toHaveLength(0)
      useCameraSourceStore.getState().reset()
      expect(useCameraSourceStore.getState().getAllSources().length).toBe(DEFAULT_CAMERAS.length)
    })
  })
})
