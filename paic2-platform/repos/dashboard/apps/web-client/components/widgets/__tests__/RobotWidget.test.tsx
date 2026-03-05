/**
 * RobotWidget Component Tests
 *
 * TDD tests for robot status widget that displays data from the robot store.
 *
 * @see plan.md Step 5: WidgetWrapper Component / RobotWidget
 */

/// <reference types="@testing-library/jest-dom" />

import { render, screen, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useRobotStore } from '@/lib/stores/robot-store'
import { RobotWidget } from '../RobotWidget'
import type { RobotEntity, RobotStatus } from '@workspace/shared-types'

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a mock RobotEntity for testing
 */
function createMockRobot(overrides: Partial<RobotEntity> = {}): RobotEntity {
  const now = Date.now()
  return {
    id: 'robot-001',
    name: 'Security Bot Alpha',
    status: 'online' as RobotStatus,
    battery: 85,
    position: { x: 10.5, y: 20.3, z: 0 },
    velocity: 1.2,
    lastSeen: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

/**
 * Reset store to initial state before each test
 */
function resetStore() {
  useRobotStore.getState().clearRobots()
}

// =============================================================================
// Test Suite
// =============================================================================

describe('RobotWidget', () => {
  beforeEach(() => {
    resetStore()
  })

  // ---------------------------------------------------------------------------
  // Rendering Tests
  // ---------------------------------------------------------------------------

  describe('Rendering', () => {
    it('renders empty state when no robots in store', () => {
      render(<RobotWidget />)

      expect(screen.getByText(/no robots/i)).toBeInTheDocument()
    })

    it('renders robot name from store', () => {
      const robot = createMockRobot({ name: 'Patrol Unit X' })
      useRobotStore.getState().setRobot(robot)

      render(<RobotWidget />)

      expect(screen.getByText('Patrol Unit X')).toBeInTheDocument()
    })

    it('renders multiple robots when store has multiple', () => {
      const robot1 = createMockRobot({ id: 'robot-001', name: 'Alpha' })
      const robot2 = createMockRobot({ id: 'robot-002', name: 'Beta' })

      useRobotStore.getState().setRobot(robot1)
      useRobotStore.getState().setRobot(robot2)

      render(<RobotWidget />)

      expect(screen.getByText('Alpha')).toBeInTheDocument()
      expect(screen.getByText('Beta')).toBeInTheDocument()
    })

    it('renders widget title', () => {
      render(<RobotWidget />)

      expect(screen.getByText(/robot status/i)).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Status Display Tests
  // ---------------------------------------------------------------------------

  describe('Status Display', () => {
    it.each([
      ['online', 'status-online'],
      ['offline', 'status-offline'],
      ['patrol', 'status-patrol'],
      ['idle', 'status-idle'],
      ['alert', 'status-alert'],
    ] as [RobotStatus, string][])(
      'displays correct status indicator for %s status',
      (status, expectedClass) => {
        const robot = createMockRobot({ status })
        useRobotStore.getState().setRobot(robot)

        render(<RobotWidget />)

        const indicator = screen.getByTestId(`status-indicator-${robot.id}`)
        expect(indicator).toHaveClass(expectedClass)
      }
    )

    it('displays status text', () => {
      const robot = createMockRobot({ status: 'patrol' })
      useRobotStore.getState().setRobot(robot)

      render(<RobotWidget />)

      expect(screen.getByText(/patrol/i)).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Battery Display Tests
  // ---------------------------------------------------------------------------

  describe('Battery Display', () => {
    it('displays battery percentage', () => {
      const robot = createMockRobot({ battery: 75 })
      useRobotStore.getState().setRobot(robot)

      render(<RobotWidget />)

      expect(screen.getByText(/75%/)).toBeInTheDocument()
    })

    it('displays low battery warning when below 20%', () => {
      const robot = createMockRobot({ battery: 15 })
      useRobotStore.getState().setRobot(robot)

      render(<RobotWidget />)

      const batteryElement = screen.getByTestId(`battery-${robot.id}`)
      expect(batteryElement).toHaveClass('text-[#FF0000]')
    })

    it('displays warning color when battery between 20-40%', () => {
      const robot = createMockRobot({ battery: 30 })
      useRobotStore.getState().setRobot(robot)

      render(<RobotWidget />)

      const batteryElement = screen.getByTestId(`battery-${robot.id}`)
      expect(batteryElement).toHaveClass('text-[#FFAA00]')
    })

    it('displays normal color when battery above 40%', () => {
      const robot = createMockRobot({ battery: 85 })
      useRobotStore.getState().setRobot(robot)

      render(<RobotWidget />)

      const batteryElement = screen.getByTestId(`battery-${robot.id}`)
      expect(batteryElement).toHaveClass('text-[#CCCCCC]')
    })
  })

  // ---------------------------------------------------------------------------
  // Position Display Tests
  // ---------------------------------------------------------------------------

  describe('Position Display', () => {
    it('displays robot position coordinates', () => {
      const robot = createMockRobot({
        position: { x: 12.5, y: 34.7, z: 0 },
      })
      useRobotStore.getState().setRobot(robot)

      render(<RobotWidget />)

      expect(screen.getByText(/12\.5/)).toBeInTheDocument()
      expect(screen.getByText(/34\.7/)).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Velocity Display Tests
  // ---------------------------------------------------------------------------

  describe('Velocity Display', () => {
    it('displays robot velocity', () => {
      const robot = createMockRobot({ velocity: 1.5 })
      useRobotStore.getState().setRobot(robot)

      render(<RobotWidget />)

      expect(screen.getByText(/1\.5/)).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Reactivity Tests - CRITICAL TDD SCENARIO
  // ---------------------------------------------------------------------------

  describe('Store Reactivity', () => {
    it('updates display when robot is added to store', () => {
      const { rerender } = render(<RobotWidget />)

      // Initially no robots
      expect(screen.getByText(/no robots/i)).toBeInTheDocument()

      // Add robot to store
      act(() => {
        useRobotStore.getState().setRobot(createMockRobot({ name: 'New Robot' }))
      })

      rerender(<RobotWidget />)

      expect(screen.getByText('New Robot')).toBeInTheDocument()
      expect(screen.queryByText(/no robots/i)).not.toBeInTheDocument()
    })

    it('updates display when robot status changes in store', () => {
      const robot = createMockRobot({ id: 'robot-test', status: 'idle' })
      useRobotStore.getState().setRobot(robot)

      const { rerender } = render(<RobotWidget />)

      let indicator = screen.getByTestId('status-indicator-robot-test')
      expect(indicator).toHaveClass('status-idle')

      // Update robot status in store
      act(() => {
        useRobotStore.getState().updateRobot('robot-test', { status: 'patrol' })
      })

      rerender(<RobotWidget />)

      indicator = screen.getByTestId('status-indicator-robot-test')
      expect(indicator).toHaveClass('status-patrol')
    })

    it('updates display when robot battery changes in store', () => {
      const robot = createMockRobot({ id: 'robot-test', battery: 80 })
      useRobotStore.getState().setRobot(robot)

      const { rerender } = render(<RobotWidget />)

      expect(screen.getByText(/80%/)).toBeInTheDocument()

      // Update robot battery in store
      act(() => {
        useRobotStore.getState().updateRobot('robot-test', { battery: 15 })
      })

      rerender(<RobotWidget />)

      expect(screen.getByText(/15%/)).toBeInTheDocument()
    })

    it('removes robot from display when removed from store', () => {
      const robot = createMockRobot({ id: 'robot-to-remove', name: 'Temporary Bot' })
      useRobotStore.getState().setRobot(robot)

      const { rerender } = render(<RobotWidget />)

      expect(screen.getByText('Temporary Bot')).toBeInTheDocument()

      // Remove robot from store
      act(() => {
        useRobotStore.getState().removeRobot('robot-to-remove')
      })

      rerender(<RobotWidget />)

      expect(screen.queryByText('Temporary Bot')).not.toBeInTheDocument()
      expect(screen.getByText(/no robots/i)).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Styling Tests - Dark Tactical Theme
  // ---------------------------------------------------------------------------

  describe('Styling (Dark Tactical Theme)', () => {
    it('applies card-tactical class to container', () => {
      render(<RobotWidget />)

      const container = screen.getByTestId('robot-widget')
      expect(container).toHaveClass('card-tactical')
    })

    it('applies text-tactical-label class to title', () => {
      render(<RobotWidget />)

      const title = screen.getByText(/robot status/i)
      expect(title).toHaveClass('text-tactical-label')
    })

    it('applies uppercase styling to status text', () => {
      const robot = createMockRobot({ status: 'online' })
      useRobotStore.getState().setRobot(robot)

      render(<RobotWidget />)

      const statusText = screen.getByTestId(`status-text-${robot.id}`)
      expect(statusText).toHaveClass('uppercase')
    })
  })

  // ---------------------------------------------------------------------------
  // Last Seen Display Tests
  // ---------------------------------------------------------------------------

  describe('Last Seen Display', () => {
    it('displays last seen time', () => {
      const lastSeen = Date.now() - 60000 // 1 minute ago
      const robot = createMockRobot({ lastSeen })
      useRobotStore.getState().setRobot(robot)

      render(<RobotWidget />)

      // Should show some form of "last seen" information
      expect(screen.getByTestId(`last-seen-${robot.id}`)).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Accessibility Tests
  // ---------------------------------------------------------------------------

  describe('Accessibility', () => {
    it('has accessible role for the widget container', () => {
      render(<RobotWidget />)

      const container = screen.getByRole('region', { name: /robot status/i })
      expect(container).toBeInTheDocument()
    })

    it('has proper aria-label for status indicators', () => {
      const robot = createMockRobot({ status: 'online' })
      useRobotStore.getState().setRobot(robot)

      render(<RobotWidget />)

      const indicator = screen.getByTestId(`status-indicator-${robot.id}`)
      expect(indicator).toHaveAttribute('aria-label', expect.stringMatching(/online/i))
    })
  })
})
