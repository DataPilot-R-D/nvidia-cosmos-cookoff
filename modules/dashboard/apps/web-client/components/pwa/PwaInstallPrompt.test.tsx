import { render, screen, fireEvent, act } from '@testing-library/react'
import { PwaInstallPrompt } from './PwaInstallPrompt'

describe('PwaInstallPrompt', () => {
  it('renders nothing initially (no beforeinstallprompt)', () => {
    const { container } = render(<PwaInstallPrompt />)
    expect(container.firstChild).toBeNull()
  })

  it('shows banner when beforeinstallprompt fires', () => {
    render(<PwaInstallPrompt />)

    act(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      ;(event as any).prompt = jest.fn().mockResolvedValue(undefined)
      ;(event as any).userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(event)
    })

    expect(screen.getByTestId('pwa-install-prompt')).toBeInTheDocument()
  })

  it('calls prompt() on Install click', async () => {
    render(<PwaInstallPrompt />)

    const promptFn = jest.fn().mockResolvedValue(undefined)
    act(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      ;(event as any).prompt = promptFn
      ;(event as any).userChoice = Promise.resolve({ outcome: 'accepted' })
      window.dispatchEvent(event)
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('pwa-install-button'))
    })

    expect(promptFn).toHaveBeenCalled()
  })

  it('hides on Later click', () => {
    render(<PwaInstallPrompt />)

    act(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true })
      ;(event as any).prompt = jest.fn().mockResolvedValue(undefined)
      ;(event as any).userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(event)
    })

    fireEvent.click(screen.getByText('Later'))
    expect(screen.queryByTestId('pwa-install-prompt')).toBeNull()
  })
})
