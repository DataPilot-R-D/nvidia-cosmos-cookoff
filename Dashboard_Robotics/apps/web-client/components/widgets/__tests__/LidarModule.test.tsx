/**
 * LidarModule Tests
 */

import { render, screen } from '@testing-library/react'
import { LidarModule } from '../LidarModule'
import { useTopicStore } from '@/lib/stores/topic-store'
import { useLidarStore } from '@/lib/stores/lidar-store'

function createPointBuffer() {
  return {
    positions: new Float32Array([0, 0, 0]),
    intensities: new Uint8Array([0]),
    scanIndices: new Uint32Array([0]),
    capacity: 1,
    count: 1,
    writeHead: 0,
    version: 1,
  }
}

describe('LidarModule', () => {
  beforeEach(() => {
    useTopicStore.setState({
      topics: [],
      subscriptions: new Set(),
      loading: false,
      error: null,
      lastUpdated: null,
      filterQuery: '',
    })

    // Provide scan data even when topic discovery is empty
    useLidarStore.setState({
      scans: new Map([
        [
          'robot0',
          {
            config: { topic: '/scan', frameId: 'base_link' },
            points: [{ x: 0, y: 0, z: 0, intensity: 0, age: 0 }],
            pointBuffer: createPointBuffer(),
            accumulatedPoints: [],
            totalScanCount: 1,
            scanCount: 1,
            lastFpsUpdate: Date.now(),
            fps: 5,
            lastScanTime: Date.now(),
          },
        ],
      ]),
      subscriptions: new Set(),
    } as any)
  })

  it('should not show "No Signal" badge when scan data is present', () => {
    render(<LidarModule windowId="test-window" />)

    expect(screen.queryByTestId('no-lidar-signal')).not.toBeInTheDocument()
  })
})
