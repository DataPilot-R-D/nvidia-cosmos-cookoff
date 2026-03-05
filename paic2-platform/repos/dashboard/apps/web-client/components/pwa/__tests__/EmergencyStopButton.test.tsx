import { render, screen, fireEvent } from '@testing-library/react'
import { EmergencyStopButton } from '../EmergencyStopButton'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import { useCommandStore } from '@/lib/stores/command-store'
import { useAuthStore } from '@/lib/stores/auth-store'

describe('EmergencyStopButton', () => {
  beforeEach(() => {
    useCommandStore.getState().setEmergencyStop(false)
    // Grant estop permission (admin role)
    useAuthStore.setState({
      user: { id: 'u-admin', email: 'admin@robot.cc', name: 'Admin', role: 'admin' },
      isAuthenticated: true,
      hasHydrated: true,
    })
  })

  it('renders the E-STOP button', () => {
    render(<EmergencyStopButton />)
    expect(screen.getByTestId('mobile-estop')).toBeInTheDocument()
  })

  it('sends stop command when connected', () => {
    const mockSend = jest.fn().mockReturnValue(true)
    useWebSocketStore.setState({ status: 'connected', sendTeleopCommand: mockSend } as any)

    render(<EmergencyStopButton />)
    fireEvent.click(screen.getByTestId('mobile-estop'))

    expect(mockSend).toHaveBeenCalledWith(0, 0)
    expect(useCommandStore.getState().emergencyStop).toBe(true)
  })

  it('shows alert when disconnected (never queues)', () => {
    useWebSocketStore.setState({ status: 'disconnected' })
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {})

    render(<EmergencyStopButton />)
    fireEvent.click(screen.getByTestId('mobile-estop'))

    expect(alertSpy).toHaveBeenCalledWith('NO CONNECTION - MANUAL INTERVENTION REQUIRED')
    expect(useCommandStore.getState().emergencyStop).toBe(false)
    alertSpy.mockRestore()
  })
})
