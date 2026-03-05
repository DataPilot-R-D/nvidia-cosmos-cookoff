/**
 * Offline Queue Store — Unit Tests
 *
 * Tests queue logic with mocked IDB layer.
 */

// Mock the IDB adapter before importing the store
const mockAdd = jest.fn().mockResolvedValue(1)
const mockGetAll = jest.fn().mockResolvedValue([])
const mockDeleteBatch = jest.fn().mockResolvedValue(undefined)
const mockClear = jest.fn().mockResolvedValue(undefined)

jest.mock('@/lib/storage/offline-queue-idb', () => ({
  offlineQueueAdd: (...args: unknown[]) => mockAdd(...args),
  offlineQueueGetAll: () => mockGetAll(),
  offlineQueueDeleteBatch: (...args: unknown[]) => mockDeleteBatch(...args),
  offlineQueueClear: () => mockClear(),
}))

import { useOfflineQueueStore } from '../offline-queue-store'

describe('useOfflineQueueStore', () => {
  beforeEach(() => {
    // Reset store state
    useOfflineQueueStore.setState({
      items: [],
      hydrated: false,
      flushing: false,
      senders: {},
    })
    jest.clearAllMocks()
  })

  describe('hydrate', () => {
    it('loads items from IDB', async () => {
      const items = [
        {
          id: 1,
          type: 'teleop' as const,
          payload: { linear: 0.5, angular: 0 },
          createdAt: Date.now(),
          retries: 0,
        },
      ]
      mockGetAll.mockResolvedValueOnce(items)

      await useOfflineQueueStore.getState().hydrate()

      expect(useOfflineQueueStore.getState().items).toEqual(items)
      expect(useOfflineQueueStore.getState().hydrated).toBe(true)
    })

    it('sets hydrated even if IDB fails', async () => {
      mockGetAll.mockRejectedValueOnce(new Error('IDB unavailable'))

      await useOfflineQueueStore.getState().hydrate()

      expect(useOfflineQueueStore.getState().hydrated).toBe(true)
      expect(useOfflineQueueStore.getState().items).toEqual([])
    })
  })

  describe('enqueue', () => {
    it('adds command to IDB and memory', async () => {
      mockAdd.mockResolvedValueOnce(42)

      await useOfflineQueueStore.getState().enqueue('teleop', { linear: 1, angular: 0 })

      expect(mockAdd).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'teleop', payload: { linear: 1, angular: 0 } })
      )
      expect(useOfflineQueueStore.getState().items).toHaveLength(1)
      expect(useOfflineQueueStore.getState().items[0].id).toBe(42)
    })
  })

  describe('flush', () => {
    it('sends queued commands via registered senders', async () => {
      const sender = jest.fn().mockReturnValue(true)
      useOfflineQueueStore.setState({
        items: [
          {
            id: 1,
            type: 'teleop',
            payload: { linear: 0.5, angular: 0 },
            createdAt: Date.now(),
            retries: 0,
          },
        ],
        senders: { teleop: sender },
      })

      await useOfflineQueueStore.getState().flush()

      expect(sender).toHaveBeenCalledWith({ linear: 0.5, angular: 0 })
      expect(mockDeleteBatch).toHaveBeenCalledWith([1])
      expect(useOfflineQueueStore.getState().items).toEqual([])
    })

    it('discards stale teleop commands (>5s old)', async () => {
      const sender = jest.fn().mockReturnValue(true)
      useOfflineQueueStore.setState({
        items: [
          {
            id: 1,
            type: 'teleop',
            payload: { linear: 1, angular: 0 },
            createdAt: Date.now() - 10_000,
            retries: 0,
          },
        ],
        senders: { teleop: sender },
      })

      await useOfflineQueueStore.getState().flush()

      // Should NOT call sender — command is stale
      expect(sender).not.toHaveBeenCalled()
      // Should delete the stale item
      expect(mockDeleteBatch).toHaveBeenCalledWith([1])
    })

    it('keeps goal_pose commands regardless of age', async () => {
      const sender = jest.fn().mockReturnValue(true)
      useOfflineQueueStore.setState({
        items: [
          {
            id: 2,
            type: 'goal_pose',
            payload: { x: 1, y: 2, theta: 0 },
            createdAt: Date.now() - 60_000,
            retries: 0,
          },
        ],
        senders: { goal_pose: sender },
      })

      await useOfflineQueueStore.getState().flush()

      expect(sender).toHaveBeenCalledWith({ x: 1, y: 2, theta: 0 })
    })

    it('discards commands after max retries', async () => {
      const sender = jest.fn().mockReturnValue(false)
      useOfflineQueueStore.setState({
        items: [
          {
            id: 3,
            type: 'teleop',
            payload: { linear: 1, angular: 0 },
            createdAt: Date.now(),
            retries: 8,
          },
        ],
        senders: { teleop: sender },
      })

      await useOfflineQueueStore.getState().flush()

      expect(sender).not.toHaveBeenCalled()
      expect(mockDeleteBatch).toHaveBeenCalledWith([3])
    })

    it('does nothing when already flushing', async () => {
      useOfflineQueueStore.setState({
        flushing: true,
        items: [{ id: 1, type: 'teleop', payload: {}, createdAt: Date.now(), retries: 0 }],
      })

      await useOfflineQueueStore.getState().flush()

      expect(mockDeleteBatch).not.toHaveBeenCalled()
    })
  })

  describe('clear', () => {
    it('clears IDB and memory', async () => {
      useOfflineQueueStore.setState({
        items: [{ id: 1, type: 'teleop', payload: {}, createdAt: Date.now(), retries: 0 }],
      })

      await useOfflineQueueStore.getState().clear()

      expect(mockClear).toHaveBeenCalled()
      expect(useOfflineQueueStore.getState().items).toEqual([])
    })
  })
})
