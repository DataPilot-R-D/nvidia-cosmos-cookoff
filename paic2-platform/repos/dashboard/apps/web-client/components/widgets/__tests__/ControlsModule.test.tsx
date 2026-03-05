/**
 * ControlsModule Tests
 *
 * Tests for the robot control widget with joystick and command buttons.
 */

import { render, screen, act, fireEvent } from '@testing-library/react'
import { ControlsModule } from '../ControlsModule'
import { useRobotStore } from '@/lib/stores/robot-store'
import { useCommandStore } from '@/lib/stores/command-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import { useAuthStore } from '@/lib/stores/auth-store'

// Reset stores before each test
beforeEach(() => {
  act(() => {
    useRobotStore.getState().clearRobots()
    useCommandStore.getState().clearQueue()
    useCommandStore.getState().selectRobot(null)
    useCommandStore.getState().setEmergencyStop(false)
    useCommandStore.getState().resetVelocity()
    // E-STOP requires connected status (offline = manual intervention alert)
    useWebSocketStore.setState({ status: 'connected' })
    // Set admin role so RBAC doesn't block controls
    useAuthStore.setState({
      user: { id: 'u-admin', email: 'admin@robot.cc', name: 'Admin', role: 'admin' },
      token: 'test-token',
      isAuthenticated: true,
      hasHydrated: true,
    })
  })
})

describe('ControlsModule', () => {
  describe('rendering', () => {
    it('should render with correct testid', () => {
      render(<ControlsModule windowId="test-window" />)

      expect(screen.getByTestId('module-controls-test-window')).toBeInTheDocument()
    })

    it('should show no robot selected message when no robot', () => {
      render(<ControlsModule windowId="test-window" />)

      expect(screen.getByText('Select a robot')).toBeInTheDocument()
    })

    it('should render joystick area', () => {
      render(<ControlsModule windowId="test-window" />)

      expect(screen.getByTestId('joystick-area')).toBeInTheDocument()
    })
  })

  describe('command buttons', () => {
    const mockRobot = {
      id: 'robot-1',
      name: 'Alpha',
      status: 'online' as const,
      battery: 75,
      position: { x: 0, y: 0, z: 0 },
      velocity: 0,
      lastSeen: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    it('should render STOP button', () => {
      render(<ControlsModule windowId="test-window" />)

      expect(screen.getByRole('button', { name: /stop/i })).toBeInTheDocument()
    })

    it('should render AUTO button', () => {
      render(<ControlsModule windowId="test-window" />)

      expect(screen.getByRole('button', { name: /auto/i })).toBeInTheDocument()
    })

    it('should render DOCK button', () => {
      render(<ControlsModule windowId="test-window" />)

      expect(screen.getByRole('button', { name: /dock/i })).toBeInTheDocument()
    })

    it('should have STOP button always enabled', () => {
      render(<ControlsModule windowId="test-window" />)

      const stopButton = screen.getByRole('button', { name: /stop/i })
      expect(stopButton).not.toBeDisabled()
    })

    it('should have other buttons disabled when no robot selected', () => {
      render(<ControlsModule windowId="test-window" />)

      const autoButton = screen.getByRole('button', { name: /auto/i })
      const dockButton = screen.getByRole('button', { name: /dock/i })

      expect(autoButton).toBeDisabled()
      expect(dockButton).toBeDisabled()
    })

    it('should enable buttons when robot selected', () => {
      act(() => {
        useRobotStore.getState().setRobot(mockRobot)
        useCommandStore.getState().selectRobot('robot-1')
      })

      render(<ControlsModule windowId="test-window" />)

      const autoButton = screen.getByRole('button', { name: /auto/i })
      const dockButton = screen.getByRole('button', { name: /dock/i })

      expect(autoButton).not.toBeDisabled()
      expect(dockButton).not.toBeDisabled()
    })
  })

  describe('command actions', () => {
    const mockRobot = {
      id: 'robot-1',
      name: 'Alpha',
      status: 'online' as const,
      battery: 75,
      position: { x: 0, y: 0, z: 0 },
      velocity: 0,
      lastSeen: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    it('should set emergency stop when STOP clicked', () => {
      act(() => {
        useRobotStore.getState().setRobot(mockRobot)
        useCommandStore.getState().selectRobot('robot-1')
      })

      render(<ControlsModule windowId="test-window" />)

      const stopButton = screen.getByRole('button', { name: /stop/i })
      fireEvent.click(stopButton)

      expect(useCommandStore.getState().emergencyStop).toBe(true)
    })

    it('should enqueue patrol command when AUTO clicked', () => {
      act(() => {
        useRobotStore.getState().setRobot(mockRobot)
        useCommandStore.getState().selectRobot('robot-1')
      })

      render(<ControlsModule windowId="test-window" />)

      const autoButton = screen.getByRole('button', { name: /auto/i })
      fireEvent.click(autoButton)

      const queue = useCommandStore.getState().commandQueue
      expect(queue).toHaveLength(1)
      expect(queue[0].action).toBe('patrol')
    })

    it('should enqueue return_home command when DOCK clicked', () => {
      act(() => {
        useRobotStore.getState().setRobot(mockRobot)
        useCommandStore.getState().selectRobot('robot-1')
      })

      render(<ControlsModule windowId="test-window" />)

      const dockButton = screen.getByRole('button', { name: /dock/i })
      fireEvent.click(dockButton)

      const queue = useCommandStore.getState().commandQueue
      expect(queue).toHaveLength(1)
      expect(queue[0].action).toBe('return_home')
    })
  })

  describe('emergency stop state', () => {
    it('should show emergency stop indicator when active', () => {
      act(() => {
        useCommandStore.getState().setEmergencyStop(true)
      })

      render(<ControlsModule windowId="test-window" />)

      expect(screen.getByTestId('emergency-stop-indicator')).toBeInTheDocument()
    })

    it('should allow clearing emergency stop', () => {
      act(() => {
        useCommandStore.getState().setEmergencyStop(true)
      })

      render(<ControlsModule windowId="test-window" />)

      const resumeButton = screen.getByRole('button', { name: /resume/i })
      fireEvent.click(resumeButton)

      expect(useCommandStore.getState().emergencyStop).toBe(false)
    })
  })

  describe('robot selector', () => {
    it('should show robot dropdown when robots exist', () => {
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

      render(<ControlsModule windowId="test-window" />)

      expect(screen.getByText('Alpha')).toBeInTheDocument()
    })
  })
})
