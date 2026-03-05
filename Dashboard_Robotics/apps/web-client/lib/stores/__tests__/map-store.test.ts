/**
 * Map Store Tests
 *
 * Tests for 2D map state management.
 */

import { useMapStore } from '../map-store'

// =============================================================================
// Test Helpers
// =============================================================================

function createTestWaypoint(overrides = {}) {
  return {
    id: 'wp-001',
    x: 5,
    y: 3,
    name: 'Waypoint A',
    type: 'patrol' as const,
    ...overrides,
  }
}

function createTestZone(overrides = {}) {
  return {
    id: 'zone-001',
    x: 0,
    y: 0,
    width: 10,
    height: 8,
    name: 'Zone A',
    type: 'patrol' as const,
    ...overrides,
  }
}

// =============================================================================
// Tests
// =============================================================================

describe('useMapStore', () => {
  beforeEach(() => {
    // Reset store
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

  describe('initial state', () => {
    it('should have empty waypoints map', () => {
      const { waypoints } = useMapStore.getState()
      expect(waypoints.size).toBe(0)
    })

    it('should have empty zones map', () => {
      const { zones } = useMapStore.getState()
      expect(zones.size).toBe(0)
    })

    it('should have no selected robot', () => {
      const { selectedRobotId } = useMapStore.getState()
      expect(selectedRobotId).toBeNull()
    })

    it('should have default viewport settings', () => {
      const { viewportCenter, viewportZoom, showGrid } = useMapStore.getState()
      expect(viewportCenter).toEqual({ x: 0, y: 0 })
      expect(viewportZoom).toBe(1)
      expect(showGrid).toBe(true)
    })
  })

  describe('waypoints', () => {
    it('should add waypoint', () => {
      const waypoint = createTestWaypoint()
      useMapStore.getState().addWaypoint(waypoint)

      const result = useMapStore.getState().getWaypoint('wp-001')
      expect(result).toEqual(waypoint)
    })

    it('should remove waypoint', () => {
      const waypoint = createTestWaypoint()
      useMapStore.getState().addWaypoint(waypoint)
      useMapStore.getState().removeWaypoint('wp-001')

      expect(useMapStore.getState().getWaypoint('wp-001')).toBeUndefined()
    })

    it('should update waypoint', () => {
      const waypoint = createTestWaypoint()
      useMapStore.getState().addWaypoint(waypoint)
      useMapStore.getState().updateWaypoint('wp-001', { x: 10, y: 15 })

      const result = useMapStore.getState().getWaypoint('wp-001')
      expect(result?.x).toBe(10)
      expect(result?.y).toBe(15)
      expect(result?.name).toBe('Waypoint A')
    })

    it('should get all waypoints', () => {
      useMapStore.getState().addWaypoint(createTestWaypoint({ id: 'wp-001' }))
      useMapStore.getState().addWaypoint(createTestWaypoint({ id: 'wp-002' }))

      const all = useMapStore.getState().getAllWaypoints()
      expect(all.length).toBe(2)
    })
  })

  describe('zones', () => {
    it('should add zone', () => {
      const zone = createTestZone()
      useMapStore.getState().addZone(zone)

      const result = useMapStore.getState().getZone('zone-001')
      expect(result).toEqual(zone)
    })

    it('should remove zone', () => {
      const zone = createTestZone()
      useMapStore.getState().addZone(zone)
      useMapStore.getState().removeZone('zone-001')

      expect(useMapStore.getState().getZone('zone-001')).toBeUndefined()
    })
  })

  describe('selection', () => {
    it('should select robot', () => {
      useMapStore.getState().selectRobot('robot-001')
      expect(useMapStore.getState().selectedRobotId).toBe('robot-001')
    })

    it('should deselect robot', () => {
      useMapStore.getState().selectRobot('robot-001')
      useMapStore.getState().selectRobot(null)
      expect(useMapStore.getState().selectedRobotId).toBeNull()
    })
  })

  describe('viewport', () => {
    it('should update viewport center', () => {
      useMapStore.getState().setViewportCenter({ x: 10, y: 20 })
      expect(useMapStore.getState().viewportCenter).toEqual({ x: 10, y: 20 })
    })

    it('should update viewport zoom', () => {
      useMapStore.getState().setViewportZoom(2.5)
      expect(useMapStore.getState().viewportZoom).toBe(2.5)
    })

    it('should toggle grid visibility', () => {
      useMapStore.getState().setShowGrid(false)
      expect(useMapStore.getState().showGrid).toBe(false)
    })

    it('should toggle trails visibility', () => {
      useMapStore.getState().setShowTrails(true)
      expect(useMapStore.getState().showTrails).toBe(true)
    })
  })
})
