/**
 * Toolbox Component Tests
 *
 * TDD tests for Sidebar Toolbox with Drag & Drop:
 * - Draggable module items
 * - Drop event handling
 * - Visual feedback during drag
 */

import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Toolbox } from '../Toolbox'

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

describe('Toolbox', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ===========================================================================
  // Rendering Tests
  // ===========================================================================

  describe('Rendering', () => {
    it('renders toolbox container', () => {
      render(<Toolbox />)

      const toolbox = screen.getByTestId('toolbox')
      expect(toolbox).toBeInTheDocument()
    })

    it('renders toolbox header with title', () => {
      render(<Toolbox />)

      expect(screen.getByText('Toolbox')).toBeInTheDocument()
    })

    it('renders all available modules', () => {
      render(<Toolbox />)

      expect(screen.getByText('Robot Status')).toBeInTheDocument()
      expect(screen.getByText('AI Chat')).toBeInTheDocument()
      expect(screen.getByText('Camera')).toBeInTheDocument()
      expect(screen.getByText('3D Map')).toBeInTheDocument()
      expect(screen.getByText('2D Map')).toBeInTheDocument()
      expect(screen.getByText('Lidar Scan')).toBeInTheDocument()
      expect(screen.getByText('Controls')).toBeInTheDocument()
    })

    it('each module item has data-module-type attribute', () => {
      render(<Toolbox />)

      const robotStatusItem = screen.getByTestId('toolbox-item-robot-status')
      expect(robotStatusItem).toHaveAttribute('data-module-type', 'robot-status')
    })
  })

  // ===========================================================================
  // Drag & Drop Tests
  // ===========================================================================

  describe('Drag & Drop', () => {
    it('module items are draggable', () => {
      render(<Toolbox />)

      const item = screen.getByTestId('toolbox-item-robot-status')
      expect(item).toHaveAttribute('draggable', 'true')
    })

    it('sets correct data on dragStart', () => {
      render(<Toolbox />)

      const item = screen.getByTestId('toolbox-item-robot-status')

      const dataTransfer = {
        setData: jest.fn(),
        effectAllowed: '',
        setDragImage: jest.fn(),
      }

      fireEvent.dragStart(item, { dataTransfer })

      expect(dataTransfer.setData).toHaveBeenCalledWith('moduleType', 'robot-status')
      expect(dataTransfer.effectAllowed).toBe('copy')
    })

    it('adds dragging class on dragStart', () => {
      render(<Toolbox />)

      const item = screen.getByTestId('toolbox-item-camera')

      fireEvent.dragStart(item, {
        dataTransfer: { setData: jest.fn(), setDragImage: jest.fn() },
      })

      expect(item).toHaveClass('dragging')
    })

    it('removes dragging class on dragEnd', () => {
      render(<Toolbox />)

      const item = screen.getByTestId('toolbox-item-camera')

      fireEvent.dragStart(item, {
        dataTransfer: { setData: jest.fn(), setDragImage: jest.fn() },
      })
      expect(item).toHaveClass('dragging')

      fireEvent.dragEnd(item)
      expect(item).not.toHaveClass('dragging')
    })

    it('each item has unique key based on module type', () => {
      render(<Toolbox />)

      const items = screen.getAllByTestId(/^toolbox-item-/)
      const dataModuleTypes = items.map((item) => item.getAttribute('data-module-type'))

      // All should be unique
      const uniqueTypes = new Set(dataModuleTypes)
      expect(uniqueTypes.size).toBe(dataModuleTypes.length)
    })
  })

  // ===========================================================================
  // Visual Feedback Tests
  // ===========================================================================

  describe('Visual Feedback', () => {
    it('shows module icon in draggable item', () => {
      render(<Toolbox />)

      const item = screen.getByTestId('toolbox-item-robot-status')
      const icon = item.querySelector('svg')
      expect(icon).toBeInTheDocument()
    })

    it('shows module description as tooltip', () => {
      render(<Toolbox />)

      const item = screen.getByTestId('toolbox-item-robot-status')
      expect(item).toHaveAttribute('title', 'Real-time robot monitoring')
    })

    it('has grab cursor on hover', () => {
      render(<Toolbox />)

      const item = screen.getByTestId('toolbox-item-robot-status')
      expect(item).toHaveClass('cursor-grab')
    })
  })

  // ===========================================================================
  // Collapsed State Tests
  // ===========================================================================

  describe('Collapsed State', () => {
    it('renders compact view when collapsed', () => {
      render(<Toolbox isCollapsed />)

      const toolbox = screen.getByTestId('toolbox')
      expect(toolbox).toHaveClass('collapsed')
    })

    it('does not render labels when collapsed', () => {
      render(<Toolbox isCollapsed />)

      // Labels should not be rendered (not just hidden)
      const item = screen.getByTestId('toolbox-item-robot-status')
      expect(item.querySelector('.toolbox-item-label')).not.toBeInTheDocument()
    })
  })

  // ===========================================================================
  // Accessibility Tests
  // ===========================================================================

  describe('Accessibility', () => {
    it('has proper ARIA role', () => {
      render(<Toolbox />)

      const toolbox = screen.getByTestId('toolbox')
      expect(toolbox).toHaveAttribute('role', 'list')
    })

    it('each item has proper ARIA role', () => {
      render(<Toolbox />)

      const item = screen.getByTestId('toolbox-item-robot-status')
      expect(item).toHaveAttribute('role', 'listitem')
    })

    it('has aria-grabbed attribute during drag', () => {
      render(<Toolbox />)

      const item = screen.getByTestId('toolbox-item-camera')

      expect(item).toHaveAttribute('aria-grabbed', 'false')

      fireEvent.dragStart(item, {
        dataTransfer: { setData: jest.fn(), setDragImage: jest.fn() },
      })

      expect(item).toHaveAttribute('aria-grabbed', 'true')
    })

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup()
      render(<Toolbox />)

      const firstItem = screen.getByTestId('toolbox-item-robot-status')

      await user.tab()
      expect(firstItem).toHaveFocus()

      await user.tab()
      expect(screen.getByTestId('toolbox-item-ai-chat')).toHaveFocus()
    })
  })
})
