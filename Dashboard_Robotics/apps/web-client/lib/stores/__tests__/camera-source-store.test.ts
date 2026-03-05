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
  describe('fetchSources', () => {
    it('fetches camera sources from backend and maps to frontend shape', async () => {
      const mockResponse = {
        sources: [
          {
            id: 'cam-1',
            slug: 'lobby-main',
            name: 'Lobby Main',
            type: 'rtsp-physical',
            url: 'rtsp://10.0.0.10/main',
            status: 'healthy',
            go2rtcStream: 'lobby-main',
            metadata: { tags: ['lobby', 'security'] },
          },
          {
            id: 'cam-2',
            slug: 'isaac-front',
            name: 'Isaac Front',
            type: 'rtsp-isaac',
            url: '/robot0/front_cam/rgb',
            status: 'degraded',
            go2rtcStream: null,
            metadata: {},
          },
        ],
      }

      const originalFetch = globalThis.fetch
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      } as Response)
      globalThis.fetch = fetchMock as typeof fetch

      await useCameraSourceStore.getState().fetchSources()

      const all = useCameraSourceStore.getState().getAllSources()
      const first = all.find((s) => s.id === 'cam-1')
      const second = all.find((s) => s.id === 'cam-2')

      expect(fetchMock).toHaveBeenCalled()
      expect(first).toEqual({
        id: 'cam-1',
        name: 'Lobby Main',
        kind: 'cctv',
        streamUrl: 'rtsp://10.0.0.10/main',
        webrtcCapable: true,
        tags: ['lobby', 'security', 'lobby-main'],
        status: 'online',
      })
      expect(second).toEqual({
        id: 'cam-2',
        name: 'Isaac Front',
        kind: 'sim',
        streamUrl: '/robot0/front_cam/rgb',
        webrtcCapable: false,
        tags: ['isaac-front'],
        status: 'offline',
      })
      expect(useCameraSourceStore.getState().isLoading).toBe(false)
      expect(useCameraSourceStore.getState().error).toBeNull()
      expect(useCameraSourceStore.getState().lastFetchedAt).not.toBeNull()

      globalThis.fetch = originalFetch
    })

    it('sets error when fetch fails', async () => {
      const originalFetch = globalThis.fetch
      const fetchMock = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
      } as Response)
      globalThis.fetch = fetchMock as typeof fetch

      await useCameraSourceStore.getState().fetchSources()

      expect(useCameraSourceStore.getState().error).toContain('Failed to fetch')
      expect(useCameraSourceStore.getState().isLoading).toBe(false)

      globalThis.fetch = originalFetch
    })
  })

  describe('polling', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      useCameraSourceStore.getState().stopPolling()
      jest.useRealTimers()
    })

    it('startPolling periodically fetches sources', async () => {
      const fetchSpy = jest.spyOn(useCameraSourceStore.getState(), 'fetchSources')
      useCameraSourceStore.getState().startPolling(2000)

      await jest.advanceTimersByTimeAsync(6100)

      expect(fetchSpy).toHaveBeenCalledTimes(3)
      fetchSpy.mockRestore()
    })

    it('stopPolling cancels active interval', async () => {
      const fetchSpy = jest.spyOn(useCameraSourceStore.getState(), 'fetchSources')

      useCameraSourceStore.getState().startPolling(1000)
      await jest.advanceTimersByTimeAsync(2100)
      useCameraSourceStore.getState().stopPolling()
      await jest.advanceTimersByTimeAsync(3000)

      expect(fetchSpy).toHaveBeenCalledTimes(2)
      fetchSpy.mockRestore()
    })
  })

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
