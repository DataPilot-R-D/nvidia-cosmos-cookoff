/**
 * WidgetWrapper Component Tests
 *
 * TDD tests for widget container that wraps content for React Grid Layout.
 * Must accept grid props and provide drag handles.
 *
 * @see plan.md Step 5: WidgetWrapper Component
 */

/// <reference types="@testing-library/jest-dom" />

import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { WidgetWrapper } from '../WidgetWrapper'

// =============================================================================
// Test Suite
// =============================================================================

describe('WidgetWrapper', () => {
  // ---------------------------------------------------------------------------
  // Rendering Tests
  // ---------------------------------------------------------------------------

  describe('Rendering', () => {
    it('renders children inside wrapper', () => {
      render(
        <WidgetWrapper title="Test Widget">
          <div data-testid="child-content">Child Content</div>
        </WidgetWrapper>
      )

      expect(screen.getByTestId('child-content')).toBeInTheDocument()
    })

    it('renders widget title', () => {
      render(
        <WidgetWrapper title="Robot Status">
          <div>Content</div>
        </WidgetWrapper>
      )

      expect(screen.getByText('Robot Status')).toBeInTheDocument()
    })

    it('renders with data-testid attribute', () => {
      render(
        <WidgetWrapper title="Test" widgetId="robot-status">
          <div>Content</div>
        </WidgetWrapper>
      )

      expect(screen.getByTestId('widget-robot-status')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Grid Layout Integration Tests
  // ---------------------------------------------------------------------------

  describe('Grid Layout Integration', () => {
    it('forwards className prop for grid layout', () => {
      render(
        <WidgetWrapper title="Test" className="react-grid-item custom-class">
          <div>Content</div>
        </WidgetWrapper>
      )

      const wrapper = screen.getByTestId('widget-wrapper')
      expect(wrapper).toHaveClass('react-grid-item')
      expect(wrapper).toHaveClass('custom-class')
    })

    it('forwards style prop for grid positioning', () => {
      const gridStyle = {
        transform: 'translate(100px, 200px)',
        width: 300,
        height: 200,
      }

      render(
        <WidgetWrapper title="Test" style={gridStyle}>
          <div>Content</div>
        </WidgetWrapper>
      )

      const wrapper = screen.getByTestId('widget-wrapper')
      expect(wrapper).toHaveStyle({ transform: 'translate(100px, 200px)' })
    })

    it('has drag handle region', () => {
      render(
        <WidgetWrapper title="Test">
          <div>Content</div>
        </WidgetWrapper>
      )

      const dragHandle = screen.getByTestId('widget-drag-handle')
      expect(dragHandle).toBeInTheDocument()
      expect(dragHandle).toHaveClass('widget-drag-handle')
    })

    it('renders resize handle when resizable', () => {
      render(
        <WidgetWrapper title="Test" resizable>
          <div>Content</div>
        </WidgetWrapper>
      )

      expect(screen.getByTestId('widget-resize-handle')).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Styling Tests - Pencil Design System
  // ---------------------------------------------------------------------------

  describe('Styling (Pencil Design System)', () => {
    it('applies card-tactical class to container', () => {
      render(
        <WidgetWrapper title="Test">
          <div>Content</div>
        </WidgetWrapper>
      )

      const wrapper = screen.getByTestId('widget-wrapper')
      expect(wrapper).toHaveClass('card-tactical')
    })

    it('applies text-tactical-label class to title', () => {
      render(
        <WidgetWrapper title="Robot Status">
          <div>Content</div>
        </WidgetWrapper>
      )

      const title = screen.getByText('Robot Status')
      expect(title).toHaveClass('text-tactical-label')
    })

    it('renders title with tactical label styling', () => {
      render(
        <WidgetWrapper title="Robot Status">
          <div>Content</div>
        </WidgetWrapper>
      )

      const title = screen.getByText('Robot Status')
      expect(title).toHaveClass('text-tactical-label')
    })

    it('has full height and width for grid item', () => {
      render(
        <WidgetWrapper title="Test">
          <div>Content</div>
        </WidgetWrapper>
      )

      const wrapper = screen.getByTestId('widget-wrapper')
      expect(wrapper).toHaveClass('h-full')
      expect(wrapper).toHaveClass('w-full')
    })

    it('content area fills remaining space', () => {
      render(
        <WidgetWrapper title="Test">
          <div>Content</div>
        </WidgetWrapper>
      )

      const content = screen.getByTestId('widget-content')
      expect(content).toHaveClass('flex-1')
      expect(content).toHaveClass('overflow-auto')
    })
  })

  // ---------------------------------------------------------------------------
  // Accessibility Tests
  // ---------------------------------------------------------------------------

  describe('Accessibility', () => {
    it('has accessible role for widget container', () => {
      render(
        <WidgetWrapper title="Robot Status">
          <div>Content</div>
        </WidgetWrapper>
      )

      const widget = screen.getByRole('region', { name: /robot status/i })
      expect(widget).toBeInTheDocument()
    })

    it('title is a heading element', () => {
      render(
        <WidgetWrapper title="Robot Status">
          <div>Content</div>
        </WidgetWrapper>
      )

      const heading = screen.getByRole('heading', { name: /robot status/i })
      expect(heading).toBeInTheDocument()
    })
  })

  // ---------------------------------------------------------------------------
  // Props Forwarding Tests
  // ---------------------------------------------------------------------------

  describe('Props Forwarding', () => {
    it('spreads additional props to container', () => {
      render(
        <WidgetWrapper title="Test" data-custom="value" aria-describedby="description">
          <div>Content</div>
        </WidgetWrapper>
      )

      const wrapper = screen.getByTestId('widget-wrapper')
      expect(wrapper).toHaveAttribute('data-custom', 'value')
      expect(wrapper).toHaveAttribute('aria-describedby', 'description')
    })

    it('passes ref to container element', () => {
      const ref = { current: null } as React.RefObject<HTMLDivElement>

      render(
        <WidgetWrapper title="Test" ref={ref}>
          <div>Content</div>
        </WidgetWrapper>
      )

      expect(ref.current).toBeInstanceOf(HTMLDivElement)
    })
  })
})
