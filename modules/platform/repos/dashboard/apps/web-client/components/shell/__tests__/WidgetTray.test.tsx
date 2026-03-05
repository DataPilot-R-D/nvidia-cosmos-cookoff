/**
 * WidgetTray Component Tests
 *
 * TDD tests for Widget Tray (FAB + Drag & Drop):
 * - FAB click toggles tray visibility
 * - Tray contains draggable module icons
 * - Modules can be dragged (drag events)
 * - Glass styling on tray
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { WidgetTray } from '../WidgetTray'

// Mock the module registry
jest.mock('@/components/widgets', () => ({
  getAllModuleDefinitions: jest.fn(() => [
    { type: 'robot-status', label: 'Robot Status', description: 'Real-time robot monitoring' },
    { type: 'ai-chat', label: 'AI Chat', description: 'Conversational AI assistant' },
    { type: 'camera', label: 'Camera', description: 'Video feed display' },
    { type: 'map-3d', label: '3D Map', description: 'Interactive 3D environment' },
    { type: 'map-2d', label: '2D Map', description: 'Top-down floor plan' },
    { type: 'lidar', label: 'Lidar Scan', description: 'Point cloud visualization' },
    { type: 'controls', label: 'Controls', description: 'Robot command center' },
  ]),
  isValidModuleType: jest.fn(() => true),
}))

describe('WidgetTray', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ===========================================================================
  // FAB Rendering Tests
  // ===========================================================================

  describe('FAB Button', () => {
    it('renders FAB button with orange background', () => {
      render(<WidgetTray />)

      const fab = screen.getByTestId('fab-add-panel')
      expect(fab).toBeInTheDocument()
      expect(fab).toHaveClass('bg-orange-500')
    })

    it('FAB has plus icon', () => {
      render(<WidgetTray />)

      const fab = screen.getByTestId('fab-add-panel')
      expect(fab.querySelector('svg')).toBeInTheDocument()
    })

    it('FAB is positioned in bottom-right corner', () => {
      render(<WidgetTray />)

      const fab = screen.getByTestId('fab-add-panel')
      expect(fab).toHaveClass('fixed', 'bottom-6', 'right-6')
    })
  })

  // ===========================================================================
  // Tray Toggle Tests
  // ===========================================================================

  describe('Tray Visibility Toggle', () => {
    it('tray is hidden by default', () => {
      render(<WidgetTray />)

      expect(screen.queryByTestId('widget-tray')).not.toBeInTheDocument()
    })

    it('clicking FAB opens the tray', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      const fab = screen.getByTestId('fab-add-panel')
      await user.click(fab)

      expect(screen.getByTestId('widget-tray')).toBeInTheDocument()
    })

    it('clicking FAB again closes the tray', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      const fab = screen.getByTestId('fab-add-panel')
      await user.click(fab) // open
      expect(screen.getByTestId('widget-tray')).toBeInTheDocument()

      await user.click(fab) // close
      await waitFor(() => {
        expect(screen.queryByTestId('widget-tray')).not.toBeInTheDocument()
      })
    })

    it('FAB rotates icon when tray is open', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      const fab = screen.getByTestId('fab-add-panel')
      const icon = fab.querySelector('svg')

      expect(icon).not.toHaveClass('rotate-45')

      await user.click(fab)
      expect(icon).toHaveClass('rotate-45')
    })

    it('tray closes on Escape key', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      await user.click(screen.getByTestId('fab-add-panel'))
      expect(screen.getByTestId('widget-tray')).toBeInTheDocument()

      await user.keyboard('{Escape}')
      await waitFor(() => {
        expect(screen.queryByTestId('widget-tray')).not.toBeInTheDocument()
      })
    })
  })

  // ===========================================================================
  // Tray Styling Tests (Glass)
  // ===========================================================================

  describe('Tray Styling', () => {
    it('tray has glass styling', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      await user.click(screen.getByTestId('fab-add-panel'))

      const tray = screen.getByTestId('widget-tray')
      expect(tray).toHaveClass('glass-dark')
    })

    it('tray is positioned above FAB', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      await user.click(screen.getByTestId('fab-add-panel'))

      const tray = screen.getByTestId('widget-tray')
      expect(tray).toHaveClass('fixed', 'bottom-24', 'right-6')
    })
  })

  // ===========================================================================
  // Draggable Module Items Tests
  // ===========================================================================

  describe('Draggable Module Items', () => {
    it('renders all module icons in tray', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      await user.click(screen.getByTestId('fab-add-panel'))

      expect(screen.getByTestId('tray-item-robot-status')).toBeInTheDocument()
      expect(screen.getByTestId('tray-item-ai-chat')).toBeInTheDocument()
      expect(screen.getByTestId('tray-item-camera')).toBeInTheDocument()
      expect(screen.getByTestId('tray-item-map-3d')).toBeInTheDocument()
      expect(screen.getByTestId('tray-item-map-2d')).toBeInTheDocument()
      expect(screen.getByTestId('tray-item-lidar')).toBeInTheDocument()
      expect(screen.getByTestId('tray-item-controls')).toBeInTheDocument()
    })

    it('module items are draggable', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      await user.click(screen.getByTestId('fab-add-panel'))

      const item = screen.getByTestId('tray-item-camera')
      expect(item).toHaveAttribute('draggable', 'true')
    })

    it('sets correct moduleType data on dragStart', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      await user.click(screen.getByTestId('fab-add-panel'))

      const item = screen.getByTestId('tray-item-camera')

      const dataTransfer = {
        setData: jest.fn(),
        effectAllowed: '',
        setDragImage: jest.fn(),
      }

      fireEvent.dragStart(item, { dataTransfer })

      expect(dataTransfer.setData).toHaveBeenCalledWith('moduleType', 'camera')
      expect(dataTransfer.effectAllowed).toBe('copy')
    })

    it('module item has tooltip with description', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      await user.click(screen.getByTestId('fab-add-panel'))

      const item = screen.getByTestId('tray-item-camera')
      expect(item).toHaveAttribute('title', 'Video feed display')
    })

    it('module item shows label text', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      await user.click(screen.getByTestId('fab-add-panel'))

      const tray = screen.getByTestId('widget-tray')
      expect(tray).toHaveTextContent('Camera')
      expect(tray).toHaveTextContent('AI Chat')
    })
  })

  // ===========================================================================
  // Visual Feedback Tests
  // ===========================================================================

  describe('Visual Feedback', () => {
    it('adds dragging class during drag', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      await user.click(screen.getByTestId('fab-add-panel'))

      const item = screen.getByTestId('tray-item-camera')

      fireEvent.dragStart(item, {
        dataTransfer: { setData: jest.fn(), setDragImage: jest.fn() },
      })

      expect(item).toHaveClass('dragging')
    })

    it('removes dragging class on dragEnd', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      await user.click(screen.getByTestId('fab-add-panel'))

      const item = screen.getByTestId('tray-item-camera')

      fireEvent.dragStart(item, {
        dataTransfer: { setData: jest.fn(), setDragImage: jest.fn() },
      })
      expect(item).toHaveClass('dragging')

      fireEvent.dragEnd(item)
      expect(item).not.toHaveClass('dragging')
    })

    it('each item has icon', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      await user.click(screen.getByTestId('fab-add-panel'))

      const item = screen.getByTestId('tray-item-camera')
      expect(item.querySelector('svg')).toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Accessibility Tests
  // ===========================================================================

  describe('Accessibility', () => {
    it('FAB has aria-expanded attribute', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      const fab = screen.getByTestId('fab-add-panel')
      expect(fab).toHaveAttribute('aria-expanded', 'false')

      await user.click(fab)
      expect(fab).toHaveAttribute('aria-expanded', 'true')
    })

    it('tray items have aria-label', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      await user.click(screen.getByTestId('fab-add-panel'))

      const item = screen.getByTestId('tray-item-camera')
      expect(item).toHaveAttribute('aria-label', 'Click or drag Camera widget')
    })

    it('tray has role menu', async () => {
      const user = userEvent.setup()
      render(<WidgetTray />)

      await user.click(screen.getByTestId('fab-add-panel'))

      const tray = screen.getByTestId('widget-tray')
      expect(tray).toHaveAttribute('role', 'menu')
    })
  })
})
