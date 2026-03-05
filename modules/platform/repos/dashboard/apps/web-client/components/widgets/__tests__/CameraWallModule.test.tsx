import { render, screen, fireEvent } from '@testing-library/react'
import { CameraWallModule } from '../CameraWallModule'
import { useCameraStore } from '@/lib/stores/camera-store'
import type { CameraEntity } from '@workspace/shared-types'

// Mock useCameraStream
jest.mock('@/lib/hooks/use-camera-stream', () => ({
  useCameraStream: () => ({
    camera: null,
    modePreference: 'auto' as const,
    setModePreference: jest.fn(),
    activeMode: null,
    streamUrl: null,
    status: 'stopped' as const,
    streamState: 'idle' as const,
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    retryWebRTC: jest.fn(),
    fps: null,
    latency: null,
    frameDataUrl: null,
    rawData: null,
    frameMetadata: null,
    mediaStream: null,
    isFallback: false,
    retryCount: 0,
    error: null,
  }),
}))

function makeCam(id: string, name: string): CameraEntity {
  return {
    id,
    robotId: 'robot0',
    name,
    status: 'active',
    topic: `/robot0/${name}`,
    capabilities: {
      supportsWebRTC: true,
      supportsHLS: false,
      supportsPTZ: false,
      maxResolution: { width: 640, height: 480 },
      maxFps: 30,
    },
    webrtcEnabled: false,
  }
}

describe('CameraWallModule', () => {
  beforeEach(() => {
    useCameraStore.getState().clearCameras()
    localStorage.clear()
  })

  it('shows placeholder when no cameras available', () => {
    render(<CameraWallModule windowId="test-1" />)
    expect(screen.getByText('Camera Wall')).toBeInTheDocument()
    expect(screen.getByText(/Waiting for camera sources/)).toBeInTheDocument()
  })

  it('renders 2x2 grid with cameras', () => {
    const store = useCameraStore.getState()
    store.addCamera(makeCam('sim.warehouse.entrance', 'entrance'))
    store.addCamera(makeCam('sim.warehouse.dock', 'dock'))
    store.addCamera(makeCam('cctv.office.lobby', 'lobby'))
    store.addCamera(makeCam('cctv.office.parking', 'parking'))

    render(<CameraWallModule windowId="test-2" />)

    expect(screen.getByTestId('camera-tile-sim.warehouse.entrance')).toBeInTheDocument()
    expect(screen.getByTestId('camera-tile-sim.warehouse.dock')).toBeInTheDocument()
    expect(screen.getByTestId('camera-tile-cctv.office.lobby')).toBeInTheDocument()
    expect(screen.getByTestId('camera-tile-cctv.office.parking')).toBeInTheDocument()
  })

  it('enters focus mode on tile click', () => {
    const store = useCameraStore.getState()
    store.addCamera(makeCam('sim.entrance', 'entrance'))
    store.addCamera(makeCam('sim.dock', 'dock'))

    render(<CameraWallModule windowId="test-3" />)

    fireEvent.click(screen.getByTestId('camera-tile-sim.entrance'))
    expect(screen.getByText('← Back to wall')).toBeInTheDocument()
  })

  it('exits focus mode with back button', () => {
    const store = useCameraStore.getState()
    store.addCamera(makeCam('sim.entrance', 'entrance'))
    store.addCamera(makeCam('sim.dock', 'dock'))

    render(<CameraWallModule windowId="test-4" />)

    fireEvent.click(screen.getByTestId('camera-tile-sim.entrance'))
    expect(screen.getByText('← Back to wall')).toBeInTheDocument()

    fireEvent.click(screen.getByText('← Back to wall'))
    expect(screen.queryByText('← Back to wall')).not.toBeInTheDocument()
  })

  it('persists selection to localStorage', () => {
    const store = useCameraStore.getState()
    store.addCamera(makeCam('sim.cam1', 'cam1'))

    render(<CameraWallModule windowId="test-5" />)

    const stored = localStorage.getItem('camera-wall-selection')
    expect(stored).toBeTruthy()
    const parsed = JSON.parse(stored!)
    expect(parsed).toContain('sim.cam1')
  })

  it('classifies sim vs cctv sources', () => {
    const store = useCameraStore.getState()
    store.addCamera(makeCam('sim.warehouse.cam', 'sim-cam'))
    store.addCamera(makeCam('cctv.office.cam', 'office-cam'))

    render(<CameraWallModule windowId="test-6" />)

    // SIM badge
    expect(screen.getByText('SIM')).toBeInTheDocument()
    // CCTV badge
    expect(screen.getByText('CCTV')).toBeInTheDocument()
  })
})
