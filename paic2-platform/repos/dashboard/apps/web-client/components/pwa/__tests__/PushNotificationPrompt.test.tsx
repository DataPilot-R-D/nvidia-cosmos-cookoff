import { render, screen, fireEvent, act } from '@testing-library/react'
import { PushNotificationPrompt } from '../PushNotificationPrompt'

describe('PushNotificationPrompt', () => {
  const originalNotification = global.Notification

  beforeEach(() => {
    // Mock Notification API
    Object.defineProperty(global, 'Notification', {
      value: {
        permission: 'default',
        requestPermission: jest.fn().mockResolvedValue('granted'),
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(global, 'Notification', {
      value: originalNotification,
      writable: true,
      configurable: true,
    })
  })

  it('shows prompt when permission is default', () => {
    render(<PushNotificationPrompt />)
    expect(screen.getByTestId('push-notification-prompt')).toBeInTheDocument()
  })

  it('hides prompt when permission is granted', () => {
    ;(global.Notification as any).permission = 'granted'
    render(<PushNotificationPrompt />)
    expect(screen.queryByTestId('push-notification-prompt')).toBeNull()
  })

  it('calls requestPermission on Enable click', async () => {
    render(<PushNotificationPrompt />)
    await act(async () => {
      fireEvent.click(screen.getByTestId('push-enable-button'))
    })
    expect(Notification.requestPermission).toHaveBeenCalled()
  })

  it('hides on Later click', () => {
    render(<PushNotificationPrompt />)
    fireEvent.click(screen.getByText('Later'))
    expect(screen.queryByTestId('push-notification-prompt')).toBeNull()
  })
})
