/**
 * GenericWindow Component Tests
 *
 * TDD tests for Universal Window System
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { GenericWindow } from '../GenericWindow'

describe('GenericWindow', () => {
  // ===========================================================================
  // Rendering Tests
  // ===========================================================================

  describe('Rendering', () => {
    it('renders with default empty state', () => {
      render(<GenericWindow windowId="test-1" />)

      expect(screen.getByTestId('generic-window-test-1')).toBeInTheDocument()
      expect(screen.getByTestId('window-title-bar-test-1')).toBeInTheDocument()
      expect(screen.getByTestId('window-content-test-1')).toBeInTheDocument()
    })

    it('renders title as "New Window" when module is empty', () => {
      render(<GenericWindow windowId="test-1" />)

      expect(screen.getByText('New Window')).toBeInTheDocument()
    })

    it('renders "Select Module" message when empty', () => {
      render(<GenericWindow windowId="test-1" />)

      expect(screen.getByText('Select Module')).toBeInTheDocument()
    })

    it('renders with specified initial module', () => {
      render(<GenericWindow windowId="test-1" initialModule="robot-status" />)

      // Title bar should show module name
      const titleBar = screen.getByTestId('window-title-bar-test-1')
      expect(titleBar).toHaveTextContent('Robot Status')
      expect(screen.getByTestId('module-robot-status-test-1')).toBeInTheDocument()
    })

    it('renders close button by default', () => {
      render(<GenericWindow windowId="test-1" />)

      expect(screen.getByTestId('window-close-test-1')).toBeInTheDocument()
    })

    it('hides close button when closable is false', () => {
      render(<GenericWindow windowId="test-1" closable={false} />)

      expect(screen.queryByTestId('window-close-test-1')).not.toBeInTheDocument()
    })

    it('applies custom className', () => {
      render(<GenericWindow windowId="test-1" className="custom-class" />)

      expect(screen.getByTestId('generic-window-test-1')).toHaveClass('custom-class')
    })

    it('applies custom style', () => {
      render(<GenericWindow windowId="test-1" style={{ gridColumn: 'span 2' }} />)

      expect(screen.getByTestId('generic-window-test-1')).toHaveStyle({
        gridColumn: 'span 2',
      })
    })

    it('has proper ARIA attributes', () => {
      render(<GenericWindow windowId="test-1" />)

      const window = screen.getByTestId('generic-window-test-1')
      expect(window).toHaveAttribute('role', 'region')
      expect(window).toHaveAttribute('aria-label', 'New Window')
    })
  })

  // ===========================================================================
  // Module Selector Tests
  // ===========================================================================

  describe('Module Selector', () => {
    it('renders module selector button', () => {
      render(<GenericWindow windowId="test-1" />)

      expect(screen.getByTestId('window-module-btn-test-1')).toBeInTheDocument()
    })

    it('shows "Select" label when no module is selected', () => {
      render(<GenericWindow windowId="test-1" />)

      const button = screen.getByTestId('window-module-btn-test-1')
      expect(button).toHaveTextContent('Select')
    })

    it('opens menu on button click', async () => {
      const user = userEvent.setup()
      render(<GenericWindow windowId="test-1" />)

      const button = screen.getByTestId('window-module-btn-test-1')
      await user.click(button)

      expect(screen.getByTestId('window-module-menu-test-1')).toBeInTheDocument()
    })

    it('closes menu on second button click', async () => {
      const user = userEvent.setup()
      render(<GenericWindow windowId="test-1" />)

      const button = screen.getByTestId('window-module-btn-test-1')
      await user.click(button)
      expect(screen.getByTestId('window-module-menu-test-1')).toBeInTheDocument()

      await user.click(button)
      await waitFor(() => {
        expect(screen.queryByTestId('window-module-menu-test-1')).not.toBeInTheDocument()
      })
    })

    it('displays all available modules in menu', async () => {
      const user = userEvent.setup()
      render(<GenericWindow windowId="test-1" />)

      await user.click(screen.getByTestId('window-module-btn-test-1'))

      expect(screen.getByTestId('module-option-robot-status')).toBeInTheDocument()
      expect(screen.getByTestId('module-option-ai-chat')).toBeInTheDocument()
      expect(screen.getByTestId('module-option-camera')).toBeInTheDocument()
      expect(screen.getByTestId('module-option-map-3d')).toBeInTheDocument()
      expect(screen.getByTestId('module-option-map-2d')).toBeInTheDocument()
      expect(screen.getByTestId('module-option-lidar')).toBeInTheDocument()
      expect(screen.getByTestId('module-option-controls')).toBeInTheDocument()
    })

    it('highlights currently selected module in menu', async () => {
      const user = userEvent.setup()
      render(<GenericWindow windowId="test-1" initialModule="robot-status" />)

      await user.click(screen.getByTestId('window-module-btn-test-1'))

      const selectedOption = screen.getByTestId('module-option-robot-status')
      expect(selectedOption).toHaveClass('window-dropdown-item-active')
    })

    it('changes module on selection', async () => {
      const user = userEvent.setup()
      render(<GenericWindow windowId="test-1" />)

      // Open menu and select robot-status
      await user.click(screen.getByTestId('window-module-btn-test-1'))
      await user.click(screen.getByTestId('module-option-robot-status'))

      // Menu should close
      expect(screen.queryByTestId('window-module-menu-test-1')).not.toBeInTheDocument()

      // Title in title bar should update (check the window title span)
      const titleBar = screen.getByTestId('window-title-bar-test-1')
      expect(titleBar).toHaveTextContent('Robot Status')

      // Module component should render
      expect(screen.getByTestId('module-robot-status-test-1')).toBeInTheDocument()
    })

    it('closes menu on Escape key', async () => {
      const user = userEvent.setup()
      render(<GenericWindow windowId="test-1" />)

      await user.click(screen.getByTestId('window-module-btn-test-1'))
      expect(screen.getByTestId('window-module-menu-test-1')).toBeInTheDocument()

      await user.keyboard('{Escape}')
      await waitFor(() => {
        expect(screen.queryByTestId('window-module-menu-test-1')).not.toBeInTheDocument()
      })
    })

    it('closes menu on click outside', async () => {
      const user = userEvent.setup()
      render(
        <div>
          <GenericWindow windowId="test-1" />
          <div data-testid="outside">Outside</div>
        </div>
      )

      await user.click(screen.getByTestId('window-module-btn-test-1'))
      expect(screen.getByTestId('window-module-menu-test-1')).toBeInTheDocument()

      // Click outside
      fireEvent.mouseDown(screen.getByTestId('outside'))
      await waitFor(() => {
        expect(screen.queryByTestId('window-module-menu-test-1')).not.toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // Callback Tests
  // ===========================================================================

  describe('Callbacks', () => {
    it('calls onClose when close button is clicked', async () => {
      const user = userEvent.setup()
      const onClose = jest.fn()
      render(<GenericWindow windowId="test-1" onClose={onClose} />)

      await user.click(screen.getByTestId('window-close-test-1'))

      expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('calls onModuleChange when module is changed', async () => {
      const user = userEvent.setup()
      const onModuleChange = jest.fn()
      render(<GenericWindow windowId="test-1" onModuleChange={onModuleChange} />)

      await user.click(screen.getByTestId('window-module-btn-test-1'))
      await user.click(screen.getByTestId('module-option-ai-chat'))

      expect(onModuleChange).toHaveBeenCalledTimes(1)
      expect(onModuleChange).toHaveBeenCalledWith('test-1', 'ai-chat')
    })

    it('does not throw when callbacks are not provided', async () => {
      const user = userEvent.setup()
      render(<GenericWindow windowId="test-1" />)

      // Should not throw
      await user.click(screen.getByTestId('window-close-test-1'))
      await user.click(screen.getByTestId('window-module-btn-test-1'))
      await user.click(screen.getByTestId('module-option-robot-status'))
    })
  })

  // ===========================================================================
  // Module Content Tests
  // ===========================================================================

  describe('Module Content', () => {
    it('renders empty module content by default', () => {
      render(<GenericWindow windowId="test-1" />)

      expect(screen.getByTestId('module-empty-test-1')).toBeInTheDocument()
    })

    it('renders robot-status module content', () => {
      render(<GenericWindow windowId="test-1" initialModule="robot-status" />)

      expect(screen.getByTestId('module-robot-status-test-1')).toBeInTheDocument()
    })

    it('renders ai-chat module content', () => {
      render(<GenericWindow windowId="test-1" initialModule="ai-chat" />)

      expect(screen.getByTestId('module-ai-chat-test-1')).toBeInTheDocument()
    })

    it('renders camera module content', () => {
      render(<GenericWindow windowId="test-1" initialModule="camera" />)

      expect(screen.getByTestId('module-camera-test-1')).toBeInTheDocument()
    })

    it('renders map-3d module content', () => {
      render(<GenericWindow windowId="test-1" initialModule="map-3d" />)

      expect(screen.getByTestId('module-map-3d-test-1')).toBeInTheDocument()
    })

    it('renders map-2d module content', () => {
      render(<GenericWindow windowId="test-1" initialModule="map-2d" />)

      expect(screen.getByTestId('module-map-2d-test-1')).toBeInTheDocument()
    })

    it('renders lidar module content', () => {
      render(<GenericWindow windowId="test-1" initialModule="lidar" />)

      expect(screen.getByTestId('module-lidar-test-1')).toBeInTheDocument()
    })

    it('renders controls module content', () => {
      render(<GenericWindow windowId="test-1" initialModule="controls" />)

      expect(screen.getByTestId('module-controls-test-1')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Drag Handle Tests
  // ===========================================================================

  describe('Drag Handle', () => {
    it('title bar has widget-drag-handle class for grid integration', () => {
      render(<GenericWindow windowId="test-1" />)

      const titleBar = screen.getByTestId('window-title-bar-test-1')
      expect(titleBar).toHaveClass('widget-drag-handle')
    })
  })

  // ===========================================================================
  // ForwardRef Tests
  // ===========================================================================

  describe('ForwardRef', () => {
    it('forwards ref to root element', () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement>
      render(<GenericWindow ref={ref} windowId="test-1" />)

      expect(ref.current).toBe(screen.getByTestId('generic-window-test-1'))
    })
  })

  // ===========================================================================
  // High-Contrast Liquid Glass Styling Tests
  // ===========================================================================

  describe('Glass Styling', () => {
    it('window frame has glass-window class', () => {
      render(<GenericWindow windowId="test-1" />)

      const window = screen.getByTestId('generic-window-test-1')
      expect(window).toHaveClass('glass-window')
    })

    it('title bar has glass-header class (darker glass)', () => {
      render(<GenericWindow windowId="test-1" />)

      const titleBar = screen.getByTestId('window-title-bar-test-1')
      expect(titleBar).toHaveClass('glass-header')
    })

    it('title text is white (high contrast)', () => {
      render(<GenericWindow windowId="test-1" />)

      const titleBar = screen.getByTestId('window-title-bar-test-1')
      const title = titleBar.querySelector('.window-title')
      expect(title).toHaveClass('text-white')
    })

    it('close button icon is white', () => {
      render(<GenericWindow windowId="test-1" />)

      const closeBtn = screen.getByTestId('window-close-test-1')
      expect(closeBtn).toHaveClass('text-white')
    })

    it('module selector button icon is white', () => {
      render(<GenericWindow windowId="test-1" />)

      const moduleBtn = screen.getByTestId('window-module-btn-test-1')
      expect(moduleBtn).toHaveClass('text-white')
    })

    it('content area has glass-body class (lighter glass)', () => {
      render(<GenericWindow windowId="test-1" />)

      const content = screen.getByTestId('window-content-test-1')
      expect(content).toHaveClass('glass-body')
    })
  })
})
