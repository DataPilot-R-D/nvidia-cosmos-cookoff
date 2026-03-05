/**
 * Evidence Bundle Tests
 *
 * @see Issue #35 — T4.1 Evidence bundle v1 BE
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Database } from 'bun:sqlite'
import { createEvidence, getBundle, listEvidence } from '../evidence/model'
import { createEvidenceDb } from '../evidence/db'

function makeDb(): Database {
  return createEvidenceDb(':memory:')
}

describe('Evidence Types', () => {
  let db: Database
  beforeEach(() => {
    db = makeDb()
  })
  afterEach(() => {
    db.close()
  })

  it('creates event type evidence', () => {
    const e = createEvidence(db, {
      type: 'event',
      title: 'Motion Detected',
      incidentId: 'inc-1',
      capturedAt: '2026-02-19T10:00:00Z',
    })
    expect(e.type).toBe('event')
    expect(e.incidentId).toBe('inc-1')
  })

  it('creates video_clip with pointer (mediaUrl + offsets)', () => {
    const e = createEvidence(db, {
      type: 'video_clip',
      title: 'Clip from entrance',
      incidentId: 'inc-1',
      cameraSourceId: 'cam-entrance',
      mediaUrl: 'rtsp://server/warehouse-entrance',
      startOffset: 120,
      endOffset: 180,
    })
    expect(e.mediaUrl).toBe('rtsp://server/warehouse-entrance')
    expect(e.startOffset).toBe(120)
    expect(e.endOffset).toBe(180)
    expect(e.cameraSourceId).toBe('cam-entrance')
  })

  it('creates snapshot evidence', () => {
    const e = createEvidence(db, {
      type: 'snapshot',
      title: 'Frame capture',
      incidentId: 'inc-1',
      mediaUrl: '/snapshots/inc-1-frame.jpg',
    })
    expect(e.type).toBe('snapshot')
  })

  it('creates audit_entry evidence', () => {
    const e = createEvidence(db, {
      type: 'audit_entry',
      title: 'E-STOP triggered',
      incidentId: 'inc-1',
      metadata: { auditId: 42, action: 'estop' },
    })
    expect(e.type).toBe('audit_entry')
    expect(JSON.parse(e.metadata as string)).toEqual({ auditId: 42, action: 'estop' })
  })

  it('creates sensor_log evidence', () => {
    const e = createEvidence(db, {
      type: 'sensor_log',
      title: 'IMU spike',
      incidentId: 'inc-1',
      robotId: 'robot-1',
      metadata: { sensor: 'imu', value: 9.8 },
    })
    expect(e.robotId).toBe('robot-1')
  })
})

describe('Evidence Bundle', () => {
  let db: Database
  beforeEach(() => {
    db = makeDb()
    // Create evidence items for incident inc-1
    createEvidence(db, {
      type: 'event',
      title: 'Alert triggered',
      incidentId: 'inc-1',
      capturedAt: '2026-02-19T10:00:00Z',
    })
    createEvidence(db, {
      type: 'video_clip',
      title: 'Video from cam-1',
      incidentId: 'inc-1',
      cameraSourceId: 'cam-1',
      capturedAt: '2026-02-19T10:00:05Z',
      mediaUrl: 'rtsp://server/cam-1',
      startOffset: 0,
      endOffset: 30,
    })
    createEvidence(db, {
      type: 'snapshot',
      title: 'Frame',
      incidentId: 'inc-1',
      cameraSourceId: 'cam-2',
      capturedAt: '2026-02-19T10:00:10Z',
    })
    createEvidence(db, {
      type: 'audit_entry',
      title: 'ESTOP',
      incidentId: 'inc-1',
      capturedAt: '2026-02-19T10:00:15Z',
    })
    // Different incident
    createEvidence(db, {
      type: 'note',
      title: 'Unrelated',
      incidentId: 'inc-2',
    })
  })
  afterEach(() => {
    db.close()
  })

  it('returns bundle with all items for incident', () => {
    const bundle = getBundle(db, 'inc-1')
    expect(bundle.incidentId).toBe('inc-1')
    expect(bundle.items).toHaveLength(4)
  })

  it('does not include items from other incidents', () => {
    const bundle = getBundle(db, 'inc-1')
    expect(bundle.items.every((i) => i.incidentId === 'inc-1')).toBe(true)
  })

  it('summary has correct total', () => {
    const bundle = getBundle(db, 'inc-1')
    expect(bundle.summary.total).toBe(4)
  })

  it('summary has byType breakdown', () => {
    const bundle = getBundle(db, 'inc-1')
    expect(bundle.summary.byType.event).toBe(1)
    expect(bundle.summary.byType.video_clip).toBe(1)
    expect(bundle.summary.byType.snapshot).toBe(1)
    expect(bundle.summary.byType.audit_entry).toBe(1)
  })

  it('summary has time range', () => {
    const bundle = getBundle(db, 'inc-1')
    expect(bundle.summary.timeRange).not.toBeNull()
    expect(bundle.summary.timeRange!.earliest).toBe('2026-02-19T10:00:00Z')
    expect(bundle.summary.timeRange!.latest).toBe('2026-02-19T10:00:15Z')
  })

  it('summary lists unique cameras', () => {
    const bundle = getBundle(db, 'inc-1')
    expect(bundle.summary.cameras).toContain('cam-1')
    expect(bundle.summary.cameras).toContain('cam-2')
    expect(bundle.summary.cameras).toHaveLength(2)
  })

  it('returns empty bundle for non-existent incident', () => {
    const bundle = getBundle(db, 'inc-999')
    expect(bundle.items).toHaveLength(0)
    expect(bundle.summary.total).toBe(0)
    expect(bundle.summary.timeRange).toBeNull()
  })
})
