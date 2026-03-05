/**
 * MachineUsageModule Tests
 *
 * Tests for the Machine Usage monitoring component.
 *
 * @see plan.md Checkpoint 3: UI Integration
 */

import { render, screen, act } from '@testing-library/react'
import { MachineUsageModule } from '../MachineUsageModule'
import { useMachineStatsStore } from '@/lib/stores/machine-stats-store'
import type { MachineStatsMessage } from '@workspace/shared-types'

// Mock stats message factory
const createMockStats = (
  overrides?: Partial<MachineStatsMessage['data']>
): MachineStatsMessage => ({
  type: 'server:stats',
  timestamp: Date.now(),
  messageId: 'test-message-id',
  data: {
    serverId: 'test-server',
    cpu: {
      usage: 45,
      cores: 8,
      model: 'Intel Xeon',
      ...overrides?.cpu,
    },
    memory: {
      used: 8 * 1024 * 1024 * 1024, // 8 GB
      total: 16 * 1024 * 1024 * 1024, // 16 GB
      percent: 50,
      ...overrides?.memory,
    },
    gpu: overrides?.gpu,
    disk: overrides?.disk,
    network: overrides?.network,
    ...overrides,
  },
})

// Reset stores before each test
beforeEach(() => {
  act(() => {
    useMachineStatsStore.getState().clearHistory()
  })
})

describe('MachineUsageModule', () => {
  describe('rendering', () => {
    it('should render with correct testid', () => {
      render(<MachineUsageModule windowId="test-window" />)

      expect(screen.getByTestId('module-machine-usage-test-window')).toBeInTheDocument()
    })

    it('should show empty state when no stats received', () => {
      render(<MachineUsageModule windowId="test-window" />)

      expect(screen.getByText('Waiting for server stats...')).toBeInTheDocument()
    })
  })

  describe('stats display', () => {
    it('should display CPU usage', () => {
      act(() => {
        useMachineStatsStore.getState().updateStats(
          createMockStats({
            cpu: { usage: 67, cores: 4, model: 'AMD EPYC' },
          })
        )
      })

      render(<MachineUsageModule windowId="test-window" />)

      expect(screen.getByText('CPU')).toBeInTheDocument()
      expect(screen.getByText('67.0%')).toBeInTheDocument()
    })

    it('should display RAM usage', () => {
      act(() => {
        useMachineStatsStore.getState().updateStats(
          createMockStats({
            memory: { used: 8e9, total: 16e9, percent: 50 },
          })
        )
      })

      render(<MachineUsageModule windowId="test-window" />)

      expect(screen.getByText('RAM')).toBeInTheDocument()
      expect(screen.getByText('50.0%')).toBeInTheDocument()
    })

    it('should display server ID badge', () => {
      act(() => {
        useMachineStatsStore.getState().updateStats(createMockStats())
      })

      render(<MachineUsageModule windowId="test-window" />)

      expect(screen.getByText('test-server')).toBeInTheDocument()
    })

    it('should display GPU when available', () => {
      act(() => {
        useMachineStatsStore.getState().updateStats(
          createMockStats({
            gpu: {
              usage: 35,
              memoryUsed: 4e9,
              memoryTotal: 8e9,
              name: 'NVIDIA T4',
              temperature: 42,
            },
          })
        )
      })

      render(<MachineUsageModule windowId="test-window" />)

      expect(screen.getByText('GPU')).toBeInTheDocument()
      expect(screen.getByText('35.0%')).toBeInTheDocument()
      expect(screen.getByText('NVIDIA T4')).toBeInTheDocument()
    })

    it('should display disk when available', () => {
      act(() => {
        useMachineStatsStore.getState().updateStats(
          createMockStats({
            disk: {
              used: 100e9,
              total: 500e9,
              percent: 20,
              mount: '/',
            },
          })
        )
      })

      render(<MachineUsageModule windowId="test-window" />)

      expect(screen.getByText('Disk')).toBeInTheDocument()
      expect(screen.getByText('20.0%')).toBeInTheDocument()
    })
  })

  describe('threshold colors', () => {
    it('should show cyan color for normal usage (< 60%)', () => {
      act(() => {
        useMachineStatsStore.getState().updateStats(
          createMockStats({
            cpu: { usage: 45, cores: 8 },
          })
        )
      })

      render(<MachineUsageModule windowId="test-window" />)

      const cpuBar = screen.getByTestId('usage-bar-cpu')
      expect(cpuBar).toHaveStyle({ backgroundColor: '#00ffff' })
    })

    it('should show amber color for warning usage (60-85%)', () => {
      act(() => {
        useMachineStatsStore.getState().updateStats(
          createMockStats({
            cpu: { usage: 70, cores: 8 },
          })
        )
      })

      render(<MachineUsageModule windowId="test-window" />)

      const cpuBar = screen.getByTestId('usage-bar-cpu')
      expect(cpuBar).toHaveStyle({ backgroundColor: '#ffaa00' })
    })

    it('should show red color for danger usage (>= 85%)', () => {
      act(() => {
        useMachineStatsStore.getState().updateStats(
          createMockStats({
            cpu: { usage: 92, cores: 8 },
          })
        )
      })

      render(<MachineUsageModule windowId="test-window" />)

      const cpuBar = screen.getByTestId('usage-bar-cpu')
      expect(cpuBar).toHaveStyle({ backgroundColor: '#ff4444' })
    })
  })

  describe('connection status', () => {
    it('should show LIVE when receiving stats', () => {
      act(() => {
        useMachineStatsStore.getState().updateStats(createMockStats())
      })

      render(<MachineUsageModule windowId="test-window" />)

      expect(screen.getByText('LIVE')).toBeInTheDocument()
    })

    it('should show OFFLINE when not receiving', () => {
      act(() => {
        useMachineStatsStore.getState().updateStats(createMockStats())
        useMachineStatsStore.getState().setReceiving(false)
      })

      render(<MachineUsageModule windowId="test-window" />)

      expect(screen.getByText('OFFLINE')).toBeInTheDocument()
    })
  })

  describe('store integration', () => {
    it('should update when store changes', () => {
      const { rerender } = render(<MachineUsageModule windowId="test-window" />)

      // Initially empty
      expect(screen.getByText('Waiting for server stats...')).toBeInTheDocument()

      // Update store
      act(() => {
        useMachineStatsStore.getState().updateStats(
          createMockStats({
            cpu: { usage: 55, cores: 4 },
          })
        )
      })

      rerender(<MachineUsageModule windowId="test-window" />)

      // Should now show stats
      expect(screen.getByText('55.0%')).toBeInTheDocument()
    })

    it('should accumulate history in store', () => {
      act(() => {
        useMachineStatsStore
          .getState()
          .updateStats(createMockStats({ cpu: { usage: 10, cores: 4 } }))
        useMachineStatsStore
          .getState()
          .updateStats(createMockStats({ cpu: { usage: 20, cores: 4 } }))
        useMachineStatsStore
          .getState()
          .updateStats(createMockStats({ cpu: { usage: 30, cores: 4 } }))
      })

      const { history } = useMachineStatsStore.getState()
      expect(history.length).toBe(3)
    })
  })
})
