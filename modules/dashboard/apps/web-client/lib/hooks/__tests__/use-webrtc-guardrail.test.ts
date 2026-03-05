/**
 * useWebRTCGuardrail Hook Tests
 *
 * @see Issue #21 — T1.10 Performance guardrail
 */

import { renderHook, act } from '@testing-library/react'
import { useWebRTCConnectionStore } from '@/lib/stores/webrtc-connection-store'
import { useWebRTCGuardrail } from '../use-webrtc-guardrail'

beforeEach(() => {
  useWebRTCConnectionStore.getState().reset()
})

describe('useWebRTCGuardrail', () => {
  it('returns initial state', () => {
    const { result } = renderHook(() => useWebRTCGuardrail())
    expect(result.current.activeCount).toBe(0)
    expect(result.current.maxConnections).toBe(4)
    expect(result.current.isAtLimit).toBe(false)
    expect(result.current.canConnect).toBe(true)
  })

  it('reflects acquire/release', () => {
    const { result } = renderHook(() => useWebRTCGuardrail())
    act(() => {
      result.current.acquire('cam-1')
    })
    expect(result.current.activeCount).toBe(1)
    act(() => {
      result.current.release('cam-1')
    })
    expect(result.current.activeCount).toBe(0)
  })

  it('reflects limit state', () => {
    const { result } = renderHook(() => useWebRTCGuardrail())
    act(() => {
      result.current.acquire('a')
      result.current.acquire('b')
      result.current.acquire('c')
      result.current.acquire('d')
    })
    expect(result.current.isAtLimit).toBe(true)
    expect(result.current.canConnect).toBe(false)
  })
})
