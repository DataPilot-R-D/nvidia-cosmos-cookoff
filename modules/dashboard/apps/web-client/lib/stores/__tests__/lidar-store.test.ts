/**
 * LIDAR Store Tests
 *
 * Tests for LIDAR point cloud state management.
 */

import { useLidarStore } from '../lidar-store'
import type { LidarPoint, LidarScanConfig } from '@workspace/shared-types'

// =============================================================================
// Test Helpers
// =============================================================================

function createTestConfig(overrides: Partial<LidarScanConfig> = {}): LidarScanConfig {
  return {
    header: {
      timestamp: Date.now(),
      frameId: 'lidar_link',
      robotId: 'robot-001',
    },
    pointCount: 360,
    rangeMin: 0.1,
    rangeMax: 30.0,
    angleMin: -Math.PI,
    angleMax: Math.PI,
    angleIncrement: 0.01745, // ~1 degree
    ...overrides,
  }
}

function createTestPoints(count: number = 100): LidarPoint[] {
  const points: LidarPoint[] = []
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2
    points.push({
      x: Math.cos(angle) * 5,
      y: Math.sin(angle) * 5,
      z: 0,
      intensity: Math.floor((i / count) * 255),
    })
  }
  return points
}

// =============================================================================
// Tests
// =============================================================================

describe('useLidarStore', () => {
  beforeEach(() => {
    // Reset store
    useLidarStore.setState({
      scans: new Map(),
      subscriptions: new Set(),
    })
  })

  describe('initial state', () => {
    it('should have empty scans map', () => {
      const { scans } = useLidarStore.getState()
      expect(scans.size).toBe(0)
    })

    it('should have empty subscriptions set', () => {
      const { subscriptions } = useLidarStore.getState()
      expect(subscriptions.size).toBe(0)
    })
  })

  describe('addScan', () => {
    it('should add scan for robot', () => {
      const config = createTestConfig()
      const points = createTestPoints()

      useLidarStore.getState().addScan('robot-001', config, points)

      const scan = useLidarStore.getState().getScan('robot-001')
      expect(scan).toBeDefined()
      expect(scan?.config).toEqual(config)
      expect(scan?.points.length).toBe(100)
    })

    it('should update existing scan', () => {
      const config1 = createTestConfig({ pointCount: 100 })
      const config2 = createTestConfig({ pointCount: 200 })
      const points = createTestPoints(100)

      useLidarStore.getState().addScan('robot-001', config1, points)
      useLidarStore.getState().addScan('robot-001', config2, points)

      const scan = useLidarStore.getState().getScan('robot-001')
      expect(scan?.config.pointCount).toBe(200)
    })

    it('should track scan count', () => {
      const config = createTestConfig()
      const points = createTestPoints()

      for (let i = 0; i < 5; i++) {
        useLidarStore.getState().addScan('robot-001', config, points)
      }

      const scan = useLidarStore.getState().getScan('robot-001')
      expect(scan?.scanCount).toBe(5)
    })

    it('should calculate FPS', () => {
      const config = createTestConfig()
      const points = createTestPoints()

      // Add scan
      useLidarStore.getState().addScan('robot-001', config, points)

      const scan = useLidarStore.getState().getScan('robot-001')
      expect(typeof scan?.fps).toBe('number')
    })
  })

  describe('clearScan', () => {
    it('should remove scan for robot', () => {
      const config = createTestConfig()
      const points = createTestPoints()

      useLidarStore.getState().addScan('robot-001', config, points)
      useLidarStore.getState().clearScan('robot-001')

      const scan = useLidarStore.getState().getScan('robot-001')
      expect(scan).toBeUndefined()
    })

    it('should not affect other robots', () => {
      const config = createTestConfig()
      const points = createTestPoints()

      useLidarStore.getState().addScan('robot-001', config, points)
      useLidarStore
        .getState()
        .addScan(
          'robot-002',
          { ...config, header: { ...config.header, robotId: 'robot-002' } },
          points
        )
      useLidarStore.getState().clearScan('robot-001')

      expect(useLidarStore.getState().getScan('robot-001')).toBeUndefined()
      expect(useLidarStore.getState().getScan('robot-002')).toBeDefined()
    })
  })

  describe('subscriptions', () => {
    it('should add subscription', () => {
      useLidarStore.getState().addSubscription('robot-001')

      expect(useLidarStore.getState().isSubscribed('robot-001')).toBe(true)
    })

    it('should remove subscription', () => {
      useLidarStore.getState().addSubscription('robot-001')
      useLidarStore.getState().removeSubscription('robot-001')

      expect(useLidarStore.getState().isSubscribed('robot-001')).toBe(false)
    })

    it('should track multiple subscriptions', () => {
      useLidarStore.getState().addSubscription('robot-001')
      useLidarStore.getState().addSubscription('robot-002')

      expect(useLidarStore.getState().isSubscribed('robot-001')).toBe(true)
      expect(useLidarStore.getState().isSubscribed('robot-002')).toBe(true)
    })
  })

  describe('getScan', () => {
    it('should return undefined for non-existent robot', () => {
      const scan = useLidarStore.getState().getScan('non-existent')
      expect(scan).toBeUndefined()
    })

    it('should return scan state for existing robot', () => {
      const config = createTestConfig()
      const points = createTestPoints()

      useLidarStore.getState().addScan('robot-001', config, points)

      const scan = useLidarStore.getState().getScan('robot-001')
      expect(scan).toBeDefined()
      expect(scan?.config.header.robotId).toBe('robot-001')
    })
  })

  describe('getAllScans', () => {
    it('should return all scans', () => {
      const config = createTestConfig()
      const points = createTestPoints()

      useLidarStore.getState().addScan('robot-001', config, points)
      useLidarStore
        .getState()
        .addScan(
          'robot-002',
          { ...config, header: { ...config.header, robotId: 'robot-002' } },
          points
        )

      const allScans = useLidarStore.getState().getAllScans()
      expect(allScans.length).toBe(2)
    })
  })

  describe('multiple robots', () => {
    it('should handle scans from multiple robots', () => {
      const config = createTestConfig()
      const points = createTestPoints()

      for (let i = 1; i <= 3; i++) {
        useLidarStore.getState().addScan(
          `robot-00${i}`,
          {
            ...config,
            header: { ...config.header, robotId: `robot-00${i}` },
          },
          points
        )
      }

      expect(useLidarStore.getState().scans.size).toBe(3)
    })
  })
})
