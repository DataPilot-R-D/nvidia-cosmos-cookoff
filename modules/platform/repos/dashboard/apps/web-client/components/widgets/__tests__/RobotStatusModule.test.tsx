/**
 * RobotStatusModule Tests
 *
 * Tests for the Robot Status monitoring component.
 */

import { render, screen, act, fireEvent } from '@testing-library/react'
import { RobotStatusModule } from '../RobotStatusModule'
import { useRobotStore } from '@/lib/stores/robot-store'

// Reset stores before each test
beforeEach(() => {
  act(() => {
    useRobotStore.getState().clearRobots()
  })
})

describe('RobotStatusModule', () => {
  describe('rendering', () => {
    it('should render with correct testid', () => {
      render(<RobotStatusModule windowId="test-window" />)

      expect(screen.getByTestId('module-robot-status-test-window')).toBeInTheDocument()
    })

    it('should show empty state when no robots', () => {
      render(<RobotStatusModule windowId="test-window" />)

      expect(screen.getByText('No robots connected')).toBeInTheDocument()
    })

    it('should show robot count label', () => {
      render(<RobotStatusModule windowId="test-window" />)

      expect(screen.getByText('FLEET')).toBeInTheDocument()
    })
  })

  describe('robot selection', () => {
    it('should show robot selector when robots exist', () => {
      act(() => {
        useRobotStore.getState().setRobot({
          id: 'robot-1',
          name: 'Alpha',
          status: 'online',
          battery: 75,
          position: { x: 1.5, y: 2.3, z: 0 },
          velocity: 0.5,
          lastSeen: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      })

      render(<RobotStatusModule windowId="test-window" />)

      expect(screen.getByText('Alpha')).toBeInTheDocument()
    })

    it('should auto-select first robot', () => {
      act(() => {
        useRobotStore.getState().setRobot({
          id: 'robot-1',
          name: 'Alpha',
          status: 'online',
          battery: 75,
          position: { x: 1.5, y: 2.3, z: 0 },
          velocity: 0.5,
          lastSeen: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      })

      render(<RobotStatusModule windowId="test-window" />)

      // Should display robot details
      expect(screen.getByText('75%')).toBeInTheDocument()
    })
  })

  describe('status display', () => {
    const mockRobot = {
      id: 'robot-1',
      name: 'Alpha',
      status: 'online' as const,
      battery: 85,
      position: { x: 1.5, y: 2.3, z: 0 },
      velocity: 0.5,
      lastSeen: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    it('should display battery percentage', () => {
      act(() => {
        useRobotStore.getState().setRobot(mockRobot)
      })

      render(<RobotStatusModule windowId="test-window" />)

      expect(screen.getByText('85%')).toBeInTheDocument()
    })

    it('should display status badge', () => {
      act(() => {
        useRobotStore.getState().setRobot(mockRobot)
      })

      render(<RobotStatusModule windowId="test-window" />)

      expect(screen.getByText('ONLINE')).toBeInTheDocument()
    })

    it('should display position coordinates', () => {
      act(() => {
        useRobotStore.getState().setRobot(mockRobot)
      })

      render(<RobotStatusModule windowId="test-window" />)

      expect(screen.getByText(/X:/)).toBeInTheDocument()
      expect(screen.getByText(/Y:/)).toBeInTheDocument()
    })

    it('should display velocity', () => {
      act(() => {
        useRobotStore.getState().setRobot(mockRobot)
      })

      render(<RobotStatusModule windowId="test-window" />)

      expect(screen.getByText(/0\.5/)).toBeInTheDocument()
    })
  })

  describe('status colors', () => {
    it('should show green color for online status', () => {
      act(() => {
        useRobotStore.getState().setRobot({
          id: 'robot-1',
          name: 'Alpha',
          status: 'online',
          battery: 75,
          position: { x: 0, y: 0, z: 0 },
          velocity: 0,
          lastSeen: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      })

      render(<RobotStatusModule windowId="test-window" />)

      const statusBadge = screen.getByTestId('status-badge')
      expect(statusBadge).toHaveClass('bg-[#00ff00]')
    })

    it('should show red color for alert status', () => {
      act(() => {
        useRobotStore.getState().setRobot({
          id: 'robot-1',
          name: 'Alpha',
          status: 'alert',
          battery: 75,
          position: { x: 0, y: 0, z: 0 },
          velocity: 0,
          lastSeen: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      })

      render(<RobotStatusModule windowId="test-window" />)

      const statusBadge = screen.getByTestId('status-badge')
      expect(statusBadge).toHaveClass('bg-[#ff0000]')
    })
  })

  describe('battery indicator', () => {
    it('should show green battery when above 20%', () => {
      act(() => {
        useRobotStore.getState().setRobot({
          id: 'robot-1',
          name: 'Alpha',
          status: 'online',
          battery: 50,
          position: { x: 0, y: 0, z: 0 },
          velocity: 0,
          lastSeen: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      })

      render(<RobotStatusModule windowId="test-window" />)

      const batteryBar = screen.getByTestId('battery-bar')
      expect(batteryBar).toHaveStyle({ backgroundColor: '#00ff00' })
    })

    it('should show red battery when below 20%', () => {
      act(() => {
        useRobotStore.getState().setRobot({
          id: 'robot-1',
          name: 'Alpha',
          status: 'online',
          battery: 15,
          position: { x: 0, y: 0, z: 0 },
          velocity: 0,
          lastSeen: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      })

      render(<RobotStatusModule windowId="test-window" />)

      const batteryBar = screen.getByTestId('battery-bar')
      expect(batteryBar).toHaveStyle({ backgroundColor: '#ff0000' })
    })
  })

  describe('multiple robots', () => {
    it('should allow switching between robots', () => {
      act(() => {
        const store = useRobotStore.getState()
        store.setRobot({
          id: 'robot-1',
          name: 'Alpha',
          status: 'online',
          battery: 75,
          position: { x: 0, y: 0, z: 0 },
          velocity: 0,
          lastSeen: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        store.setRobot({
          id: 'robot-2',
          name: 'Beta',
          status: 'patrol',
          battery: 50,
          position: { x: 5, y: 5, z: 0 },
          velocity: 1.2,
          lastSeen: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      })

      render(<RobotStatusModule windowId="test-window" />)

      // Should show first robot by default
      expect(screen.getByText('75%')).toBeInTheDocument()

      // Click on Beta to select it
      const betaButton = screen.getByText('Beta')
      fireEvent.click(betaButton)

      // Should now show Beta's data
      expect(screen.getByText('50%')).toBeInTheDocument()
      expect(screen.getByText('PATROL')).toBeInTheDocument()
    })
  })
})
