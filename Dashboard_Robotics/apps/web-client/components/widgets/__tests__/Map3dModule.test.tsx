/**
 * Map3dModule Tests
 *
 * Tests for the 3D map visualization component using Three.js.
 */

import { render, screen, act } from '@testing-library/react'
import { Map3dModule } from '../Map3dModule'
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

describe('Map3dModule', () => {
  describe('rendering', () => {
    it('should render with correct testid', () => {
      render(<Map3dModule windowId="test-window" />)

      expect(screen.getByTestId('module-map-3d-test-window')).toBeInTheDocument()
    })

    it('should render Three.js canvas', () => {
      render(<Map3dModule windowId="test-window" />)

      expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument()
    })

    it('should show empty state when no robots', () => {
      render(<Map3dModule windowId="test-window" />)

      expect(screen.getByText('No robots connected')).toBeInTheDocument()
    })

    it('should show stats overlay', () => {
      render(<Map3dModule windowId="test-window" />)

      expect(screen.getByText('3D MAP')).toBeInTheDocument()
    })
  })

  describe('with robots', () => {
    const mockRobot = {
      id: 'robot-1',
      name: 'Alpha',
      status: 'online' as const,
      battery: 75,
      position: { x: 1.5, y: 2.3, z: 0 },
      velocity: 0.5,
      lastSeen: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    it('should show robot count', () => {
      act(() => {
        useRobotStore.getState().setRobot(mockRobot)
      })

      render(<Map3dModule windowId="test-window" />)

      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('should not show empty state when robots exist', () => {
      act(() => {
        useRobotStore.getState().setRobot(mockRobot)
      })

      render(<Map3dModule windowId="test-window" />)

      expect(screen.queryByText('No robots connected')).not.toBeInTheDocument()
    })

    it('should show multiple robots', () => {
      act(() => {
        const store = useRobotStore.getState()
        store.setRobot(mockRobot)
        store.setRobot({
          ...mockRobot,
          id: 'robot-2',
          name: 'Beta',
          position: { x: 5, y: 5, z: 0 },
        })
      })

      render(<Map3dModule windowId="test-window" />)

      expect(screen.getByText('2')).toBeInTheDocument()
    })
  })

  describe('controls', () => {
    it('should render view controls', () => {
      render(<Map3dModule windowId="test-window" />)

      expect(screen.getByText('Top')).toBeInTheDocument()
      expect(screen.getByText('Front')).toBeInTheDocument()
      expect(screen.getByText('Reset')).toBeInTheDocument()
    })
  })
})
