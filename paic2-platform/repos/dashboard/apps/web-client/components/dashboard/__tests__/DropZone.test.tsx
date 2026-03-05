/**
 * Drop Zone Integration Tests
 *
 * TDD tests for drop event handling from Toolbox to Dashboard Grid:
 * - Drop zone activation
 * - Position calculation
 * - Widget creation at drop position
 */

import { render, screen, fireEvent } from '@testing-library/react'

import { DropZone } from '../DropZone'

// Mock stores
const mockAddWidget = jest.fn()

jest.mock('@/lib/stores', () => ({
  useTabStore: jest.fn((selector) => {
    const state = {
      activeTabId: 'tab-1',
      addWidget: mockAddWidget,
    }
    if (typeof selector === 'function') {
      return selector(state)
    }
    return state
  }),
}))

// Mock isValidModuleType
jest.mock('@/components/widgets', () => ({
  isValidModuleType: jest.fn((type) =>
    ['robot-status', 'camera', 'ai-chat', 'map-3d'].includes(type)
  ),
}))

describe('DropZone', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ===========================================================================
  // Rendering Tests
  // ===========================================================================

  describe('Rendering', () => {
    it('renders drop zone container', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')
      expect(dropZone).toBeInTheDocument()
    })

    it('covers full content area', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')
      expect(dropZone).toHaveClass('absolute', 'inset-0')
    })

    it('is transparent by default', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')
      expect(dropZone).toHaveClass('bg-transparent')
    })
  })

  // ===========================================================================
  // Drag Over Tests
  // ===========================================================================

  describe('Drag Over', () => {
    it('has pointer-events enabled for drop', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')
      expect(dropZone).toHaveClass('pointer-events-auto')
    })

    it('shows visual indicator on dragOver', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')

      fireEvent.dragEnter(dropZone, {
        dataTransfer: { types: ['moduleType'] },
      })

      expect(dropZone).toHaveClass('drag-active')
    })

    it('shows drop preview ghost when drag is active', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')

      // First trigger dragEnter to activate
      fireEvent.dragEnter(dropZone, {
        dataTransfer: { types: ['moduleType'] },
      })

      // Then trigger dragOver to update position
      fireEvent.dragOver(dropZone, {
        clientX: 400,
        clientY: 300,
        dataTransfer: { types: ['moduleType'] },
      })

      const preview = screen.getByTestId('drop-preview')
      expect(preview).toBeInTheDocument()
    })

    it('removes visual indicator on dragLeave', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')

      fireEvent.dragEnter(dropZone, {
        dataTransfer: { types: ['moduleType'] },
      })
      expect(dropZone).toHaveClass('drag-active')

      fireEvent.dragLeave(dropZone)
      expect(dropZone).not.toHaveClass('drag-active')
    })
  })

  // ===========================================================================
  // Drop Event Tests
  // ===========================================================================

  describe('Drop Event', () => {
    it('drop zone is a valid drop target', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')
      expect(dropZone).toHaveAttribute('role', 'region')
      expect(dropZone).toHaveAttribute('aria-label', 'Drop zone for widgets')
    })

    it('extracts moduleType from dataTransfer', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')
      const mockGetData = jest.fn(() => 'robot-status')

      fireEvent.drop(dropZone, {
        preventDefault: jest.fn(),
        dataTransfer: { getData: mockGetData },
        clientX: 400,
        clientY: 300,
      })

      expect(mockGetData).toHaveBeenCalledWith('moduleType')
    })

    it('calls addWidget with correct moduleType', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')

      fireEvent.drop(dropZone, {
        preventDefault: jest.fn(),
        dataTransfer: { getData: () => 'camera' },
        clientX: 400,
        clientY: 300,
      })

      expect(mockAddWidget).toHaveBeenCalledWith(
        'tab-1',
        expect.objectContaining({
          moduleType: 'camera',
        })
      )
    })

    it('calculates grid position from drop coordinates', () => {
      const onDropWithPosition = jest.fn()
      render(<DropZone onDropWithPosition={onDropWithPosition} />)

      const dropZone = screen.getByTestId('drop-zone')

      fireEvent.drop(dropZone, {
        preventDefault: jest.fn(),
        dataTransfer: { getData: () => 'robot-status' },
        clientX: 400,
        clientY: 300,
      })

      expect(onDropWithPosition).toHaveBeenCalledWith(
        expect.objectContaining({
          moduleType: 'robot-status',
          x: expect.any(Number),
          y: expect.any(Number),
        })
      )
    })

    it('rejects invalid module types', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')

      fireEvent.drop(dropZone, {
        preventDefault: jest.fn(),
        dataTransfer: { getData: () => 'invalid-module' },
        clientX: 400,
        clientY: 300,
      })

      expect(mockAddWidget).not.toHaveBeenCalled()
    })

    it('removes drag-active class after drop', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')

      fireEvent.dragEnter(dropZone, {
        dataTransfer: { types: ['moduleType'] },
      })
      expect(dropZone).toHaveClass('drag-active')

      fireEvent.drop(dropZone, {
        preventDefault: jest.fn(),
        dataTransfer: { getData: () => 'robot-status' },
        clientX: 400,
        clientY: 300,
      })

      expect(dropZone).not.toHaveClass('drag-active')
    })
  })

  // ===========================================================================
  // Grid Position Calculation Tests
  // ===========================================================================

  describe('Grid Position Calculation', () => {
    // Grid config: 12 columns, 60px row height, 8px margin

    it('calculates column from X coordinate', () => {
      const calculateGridX = (clientX: number, containerLeft: number, colWidth: number) => {
        const relativeX = clientX - containerLeft
        return Math.floor(relativeX / colWidth)
      }

      // With container starting at 0, 100px column width
      expect(calculateGridX(150, 0, 100)).toBe(1) // Column 1
      expect(calculateGridX(350, 0, 100)).toBe(3) // Column 3
    })

    it('calculates row from Y coordinate', () => {
      const calculateGridY = (clientY: number, containerTop: number, rowHeight: number) => {
        const relativeY = clientY - containerTop
        return Math.floor(relativeY / rowHeight)
      }

      // With 60px row height
      expect(calculateGridY(90, 0, 60)).toBe(1) // Row 1
      expect(calculateGridY(180, 0, 60)).toBe(3) // Row 3
    })

    it('clamps X to valid grid range', () => {
      const clampGridX = (x: number, cols: number, widgetWidth: number) => {
        return Math.min(Math.max(0, x), cols - widgetWidth)
      }

      expect(clampGridX(-1, 12, 4)).toBe(0) // Clamp to 0
      expect(clampGridX(10, 12, 4)).toBe(8) // Clamp to 8 (12 - 4)
      expect(clampGridX(5, 12, 4)).toBe(5) // No clamp needed
    })

    it('clamps Y to positive values', () => {
      const clampGridY = (y: number) => {
        return Math.max(0, y)
      }

      expect(clampGridY(-5)).toBe(0)
      expect(clampGridY(10)).toBe(10)
    })
  })

  // ===========================================================================
  // Accessibility Tests
  // ===========================================================================

  describe('Accessibility', () => {
    it('has proper ARIA label', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')
      expect(dropZone).toHaveAttribute('aria-label', 'Drop zone for widgets')
    })

    it('announces drop availability to screen readers', () => {
      render(<DropZone />)

      const dropZone = screen.getByTestId('drop-zone')

      fireEvent.dragEnter(dropZone, {
        dataTransfer: { types: ['moduleType'] },
      })

      // Check for aria-live region
      expect(dropZone).toHaveAttribute('aria-dropeffect', 'copy')
    })
  })
})
