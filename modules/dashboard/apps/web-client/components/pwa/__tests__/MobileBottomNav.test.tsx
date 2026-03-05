import { render, screen, fireEvent } from '@testing-library/react'
import { MobileBottomNav } from '../MobileBottomNav'

describe('MobileBottomNav', () => {
  it('renders all nav tabs', () => {
    render(<MobileBottomNav activeTab="dashboard" onTabChange={() => {}} />)
    expect(screen.getByTestId('mobile-bottom-nav')).toBeInTheDocument()
    expect(screen.getByTestId('nav-tab-dashboard')).toBeInTheDocument()
    expect(screen.getByTestId('nav-tab-controls')).toBeInTheDocument()
    expect(screen.getByTestId('nav-tab-camera')).toBeInTheDocument()
    expect(screen.getByTestId('nav-tab-map')).toBeInTheDocument()
    expect(screen.getByTestId('nav-tab-settings')).toBeInTheDocument()
  })

  it('highlights the active tab', () => {
    render(<MobileBottomNav activeTab="controls" onTabChange={() => {}} />)
    const controlsTab = screen.getByTestId('nav-tab-controls')
    expect(controlsTab).toHaveAttribute('aria-current', 'page')
  })

  it('calls onTabChange when a tab is clicked', () => {
    const handler = jest.fn()
    render(<MobileBottomNav activeTab="dashboard" onTabChange={handler} />)
    fireEvent.click(screen.getByTestId('nav-tab-map'))
    expect(handler).toHaveBeenCalledWith('map')
  })
})
