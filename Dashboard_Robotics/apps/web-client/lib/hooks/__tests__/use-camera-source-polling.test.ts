import { act, renderHook } from '@testing-library/react'
import { useCameraSourceStore } from '@/lib/stores/camera-source-store'
import { useCameraSourcePolling } from '../use-camera-source-polling'

describe('useCameraSourcePolling', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    useCameraSourceStore.getState().stopPolling()
    useCameraSourceStore.getState().reset()
  })

  afterEach(() => {
    useCameraSourceStore.getState().stopPolling()
    jest.useRealTimers()
  })

  it('fetches on mount and continues polling', async () => {
    const fetchSpy = jest.spyOn(useCameraSourceStore.getState(), 'fetchSources')

    renderHook(() => useCameraSourcePolling())
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000)
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)

    fetchSpy.mockRestore()
  })

  it('stops polling on unmount', async () => {
    const fetchSpy = jest.spyOn(useCameraSourceStore.getState(), 'fetchSources')

    const { unmount } = renderHook(() => useCameraSourcePolling())
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    unmount()
    await act(async () => {
      await jest.advanceTimersByTimeAsync(20_000)
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    fetchSpy.mockRestore()
  })
})
