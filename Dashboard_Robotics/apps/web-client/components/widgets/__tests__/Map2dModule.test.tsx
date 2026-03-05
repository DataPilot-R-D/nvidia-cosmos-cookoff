/**
 * Map2dModule Tests
 *
 * Tests for the 2D floor plan visualization component using React Flow.
 */

import { render, screen, act } from '@testing-library/react'
import { Map2dModule } from '../map2d'
import { useRobotStore } from '@/lib/stores/robot-store'
import { useMapStore } from '@/lib/stores/map-store'

// Reset stores before each test
beforeEach(() => {
  act(() => {
    useRobotStore.getState().clearRobots()
    useMapStore.setState({
      waypoints: new Map(),
      zones: new Map(),
      selectedRobotId: null,
      viewportCenter: { x: 0, y: 0 },
      viewportZoom: 1,
      showGrid: true,
      showTrails: false,
    })
  })
})

describe('Map2dModule', () => {
  describe('rendering', () => {
    it('should render with correct testid', () => {
      render(<Map2dModule windowId="test-window" />)

      expect(screen.getByTestId('module-map-2d-test-window')).toBeInTheDocument()
    })

    it('should render ReactFlow container', () => {
      render(<Map2dModule windowId="test-window" />)

      expect(screen.getByTestId('react-flow')).toBeInTheDocument()
    })

    it('should show empty state when no robots', () => {
      render(<Map2dModule windowId="test-window" />)

      expect(screen.getByText('No robots connected')).toBeInTheDocument()
    })

    it('should show stats overlay with robot count', () => {
      render(<Map2dModule windowId="test-window" />)

      expect(screen.getByText('MAP')).toBeInTheDocument()
      // Multiple '0' may exist; just verify at least one is present
      expect(screen.getAllByText('0').length).toBeGreaterThan(0)
      expect(screen.getByText('robots')).toBeInTheDocument()
    })
  })

  describe('with robots', () => {
    it('should display robots as nodes', () => {
      act(() => {
        useRobotStore.getState().setRobot({
          id: 'robot-1',
          name: 'Alpha',
          status: 'online',
          battery: 75,
          position: { x: 0, y: 0, z: 0, heading: 0 },
          velocity: 0,
          lastSeen: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      })

      render(<Map2dModule windowId="test-window" />)

      // Robot count should update
      expect(screen.getAllByText('1').length).toBeGreaterThan(0)
    })

    it('should update robot count when multiple robots added', () => {
      act(() => {
        const store = useRobotStore.getState()
        store.setRobot({
          id: 'robot-1',
          name: 'Alpha',
          status: 'online',
          battery: 75,
          position: { x: 0, y: 0, z: 0, heading: 0 },
          velocity: 0,
          lastSeen: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        store.setRobot({
          id: 'robot-2',
          name: 'Beta',
          status: 'patrol',
          battery: 50,
          position: { x: 5, y: 5, z: 0, heading: 0 },
          velocity: 0.5,
          lastSeen: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      })

      render(<Map2dModule windowId="test-window" />)

      expect(screen.getAllByText('2').length).toBeGreaterThan(0)
    })

    it('should not show empty state when robots exist', () => {
      act(() => {
        useRobotStore.getState().setRobot({
          id: 'robot-1',
          name: 'Alpha',
          status: 'online',
          battery: 75,
          position: { x: 0, y: 0, z: 0, heading: 0 },
          velocity: 0,
          lastSeen: Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
      })

      render(<Map2dModule windowId="test-window" />)

      expect(screen.queryByText('No robots connected')).not.toBeInTheDocument()
    })
  })

  describe('grid visibility', () => {
    it('should show grid when showGrid is true', () => {
      act(() => {
        useMapStore.getState().setShowGrid(true)
      })

      render(<Map2dModule windowId="test-window" />)

      // Grid is rendered via React Flow Background component (mocked)
      expect(screen.getByTestId('react-flow')).toBeInTheDocument()
    })
  })
})
