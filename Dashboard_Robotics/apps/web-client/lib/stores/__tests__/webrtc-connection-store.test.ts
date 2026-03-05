/**
 * WebRTC Connection Store Tests
 *
 * @see Issue #21 — T1.10 Performance guardrail
 */

import { useWebRTCConnectionStore, MAX_WEBRTC_CONNECTIONS } from '../webrtc-connection-store'

beforeEach(() => {
  useWebRTCConnectionStore.getState().reset()
})

describe('WebRTCConnectionStore', () => {
  describe('acquire', () => {
    it('acquires up to MAX_WEBRTC_CONNECTIONS', () => {
      const store = useWebRTCConnectionStore.getState()
      for (let i = 0; i < MAX_WEBRTC_CONNECTIONS; i++) {
        expect(store.acquire(`cam-${i}`)).toBe(true)
      }
      expect(store.getActiveCount()).toBe(MAX_WEBRTC_CONNECTIONS)
    })

    it('returns false when at limit', () => {
      const store = useWebRTCConnectionStore.getState()
      for (let i = 0; i < MAX_WEBRTC_CONNECTIONS; i++) {
        store.acquire(`cam-${i}`)
      }
      expect(store.acquire('cam-extra')).toBe(false)
      expect(store.getActiveCount()).toBe(MAX_WEBRTC_CONNECTIONS)
    })

    it('returns true for already-acquired camera (idempotent)', () => {
      const store = useWebRTCConnectionStore.getState()
      expect(store.acquire('cam-1')).toBe(true)
      expect(store.acquire('cam-1')).toBe(true)
      expect(store.getActiveCount()).toBe(1)
    })
  })

  describe('release', () => {
    it('frees a slot', () => {
      const store = useWebRTCConnectionStore.getState()
      store.acquire('cam-1')
      store.acquire('cam-2')
      expect(store.getActiveCount()).toBe(2)
      store.release('cam-1')
      expect(store.getActiveCount()).toBe(1)
      expect(store.has('cam-1')).toBe(false)
      expect(store.has('cam-2')).toBe(true)
    })

    it('is safe to call for non-existent camera', () => {
      const store = useWebRTCConnectionStore.getState()
      expect(() => store.release('nonexistent')).not.toThrow()
    })
  })

  describe('getOldest', () => {
    it('returns null when empty', () => {
      expect(useWebRTCConnectionStore.getState().getOldest()).toBeNull()
    })

    it('returns oldest by connectedAt', () => {
      const store = useWebRTCConnectionStore.getState()
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(2000)
        .mockReturnValueOnce(3000)
      store.acquire('cam-a')
      store.acquire('cam-b')
      store.acquire('cam-c')
      expect(store.getOldest()).toBe('cam-a')
      jest.restoreAllMocks()
    })
  })

  describe('isAtLimit / canAcquire', () => {
    it('reflects correct state', () => {
      const store = useWebRTCConnectionStore.getState()
      expect(store.isAtLimit()).toBe(false)
      expect(store.canAcquire()).toBe(true)
      for (let i = 0; i < MAX_WEBRTC_CONNECTIONS; i++) {
        store.acquire(`cam-${i}`)
      }
      expect(store.isAtLimit()).toBe(true)
      expect(store.canAcquire()).toBe(false)
    })
  })

  describe('reset', () => {
    it('clears all connections', () => {
      const store = useWebRTCConnectionStore.getState()
      store.acquire('cam-1')
      store.acquire('cam-2')
      store.reset()
      expect(store.getActiveCount()).toBe(0)
      expect(store.connections.size).toBe(0)
    })
  })
})
