/**
 * ZoneEditorModule Tests
 *
 * @see Issue #31 — T3.2 Zone Editor v1 FE
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ZoneEditorModule } from '../ZoneEditorModule'

// Mock MiniMap
jest.mock('../shared/MiniMap', () => ({
  MiniMap: ({ zones, mode }: { zones: unknown[]; mode: string }) => (
    <div data-testid="mini-map" data-mode={mode} data-zones={JSON.stringify(zones)} />
  ),
}))

const mockZones = [
  {
    id: 'z-1',
    name: 'Patrol Alpha',
    type: 'patrol',
    polygon: [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
    color: '#3b82f6',
    maxRobots: 2,
    speedLimit: 1.5,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'z-2',
    name: 'Restricted Bay',
    type: 'restricted',
    polygon: [
      [5, 5],
      [6, 5],
      [6, 6],
      [5, 5],
    ],
    color: '#ef4444',
    maxRobots: null,
    speedLimit: null,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
  {
    id: 'z-3',
    name: 'Staging Area',
    type: 'staging',
    polygon: [],
    color: '#eab308',
    maxRobots: null,
    speedLimit: null,
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-01-03T00:00:00Z',
  },
]

const mockConstraints = [
  { id: 'c-1', type: 'speed-limit', zoneId: 'z-1', params: { maxSpeed: 0.5 }, description: null },
  { id: 'c-2', type: 'no-entry', zoneId: 'z-2', params: {}, description: null },
]

const mockFetch = jest.fn()
beforeAll(() => {
  global.fetch = mockFetch
})
afterEach(() => {
  mockFetch.mockClear()
})

function setupFetch() {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes('/api/zones')) {
      return Promise.resolve({ ok: true, json: async () => mockZones })
    }
    if (url.includes('/api/constraints')) {
      return Promise.resolve({ ok: true, json: async () => mockConstraints })
    }
    return Promise.resolve({ ok: true, json: async () => ({}) })
  })
}

describe('ZoneEditorModule', () => {
  it('renders zone list after fetch', async () => {
    setupFetch()
    render(<ZoneEditorModule windowId="test-1" />)

    await waitFor(() => {
      expect(screen.getByText('Patrol Alpha')).toBeInTheDocument()
    })
    expect(screen.getByText('Restricted Bay')).toBeInTheDocument()
    expect(screen.getByText('Staging Area')).toBeInTheDocument()
  })

  it('shows staging zone type', async () => {
    setupFetch()
    render(<ZoneEditorModule windowId="test-2" />)

    await waitFor(() => {
      expect(screen.getByText(/staging/)).toBeInTheDocument()
    })
  })

  it('displays constraint icons on zones', async () => {
    setupFetch()
    render(<ZoneEditorModule windowId="test-3" />)

    await waitFor(() => {
      expect(screen.getByTestId('zone-constraints-z-1')).toBeInTheDocument()
    })
    expect(screen.getByTestId('zone-constraints-z-1').textContent).toContain('🐢')
    expect(screen.getByTestId('zone-constraints-z-2').textContent).toContain('🚫')
  })

  it('toggles zone visibility', async () => {
    setupFetch()
    render(<ZoneEditorModule windowId="test-4" />)

    await waitFor(() => {
      expect(screen.getByTestId('zone-toggle-z-1')).toBeInTheDocument()
    })

    const toggleBtn = screen.getByTestId('zone-toggle-z-1')
    fireEvent.click(toggleBtn)

    // Zone item should have opacity-40
    const zoneItem = screen.getByTestId('zone-item-z-1')
    expect(zoneItem.className).toContain('opacity-40')
  })

  it('opens new zone form', async () => {
    setupFetch()
    render(<ZoneEditorModule windowId="test-5" />)

    await waitFor(() => {
      expect(screen.getByText('+ New Zone')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('+ New Zone'))
    expect(screen.getByPlaceholderText('Zone name')).toBeInTheDocument()
  })

  it('shows zone type selector with staging option', async () => {
    setupFetch()
    render(<ZoneEditorModule windowId="test-6" />)

    await waitFor(() => {
      expect(screen.getByText('+ New Zone')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('+ New Zone'))

    const select = screen.getByDisplayValue('patrol')
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value)
    expect(options).toContain('staging')
  })

  it('shows MiniMap with zones', async () => {
    setupFetch()
    render(<ZoneEditorModule windowId="test-7" />)

    await waitFor(() => {
      expect(screen.getByTestId('mini-map')).toBeInTheDocument()
    })
  })

  it('handles fetch error', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('/api/zones')) return Promise.resolve({ ok: false, status: 500 })
      return Promise.resolve({ ok: true, json: async () => [] })
    })

    render(<ZoneEditorModule windowId="test-8" />)

    await waitFor(() => {
      expect(screen.getByText(/HTTP 500/)).toBeInTheDocument()
    })
  })

  it('has edit and delete buttons per zone', async () => {
    setupFetch()
    render(<ZoneEditorModule windowId="test-9" />)

    await waitFor(() => {
      expect(screen.getByText('Patrol Alpha')).toBeInTheDocument()
    })

    const editBtns = screen.getAllByText('Edit')
    const delBtns = screen.getAllByText('Del')
    expect(editBtns.length).toBe(3)
    expect(delBtns.length).toBe(3)
  })
})
