import { describe, expect, it } from 'vitest'

import { buildSetLogsForItem, selectNextSession, sessionStatusFor } from './workoutLogging'
import type { PlanItem, PlanSession } from '@/types/domain'

function repItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: 'item-1',
    sessionId: 'session-1',
    orderIndex: 0,
    exerciseId: 42,
    sets: 3,
    targetRepMin: 8,
    targetRepMax: 12,
    targetSeconds: null,
    restSeconds: 90,
    tempo: null,
    supersetGroup: null,
    isAmrapLastSet: false,
    note: null,
    ...overrides,
  }
}

function session(overrides: Partial<PlanSession> = {}): PlanSession {
  return { id: 's', planId: 'p', weekNumber: 1, dayIndex: 0, name: 'Full Body', weekType: 'build', estMinutes: 30, ...overrides }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('buildSetLogsForItem', () => {
  it('creates one set log per prescribed set, each defaulted to the top of the rep range', () => {
    const logs = buildSetLogsForItem(repItem({ sets: 3, targetRepMax: 12 }), 'log-1')
    expect(logs).toHaveLength(3)
    expect(logs.map((l) => l.setNumber)).toEqual([1, 2, 3])
    for (const log of logs) {
      expect(log.reps).toBe(12)
      expect(log.seconds).toBeNull()
      expect(log.workoutLogId).toBe('log-1')
      expect(log.planItemId).toBe('item-1')
      expect(log.exerciseId).toBe(42)
      expect(log.id).toMatch(UUID_RE)
    }
  })

  it('gives every set log a distinct id', () => {
    const logs = buildSetLogsForItem(repItem({ sets: 4 }), 'log-1')
    expect(new Set(logs.map((l) => l.id)).size).toBe(4)
  })

  it('defaults a hold-type item to the full target duration, not a rep count', () => {
    const logs = buildSetLogsForItem(repItem({ sets: 2, targetRepMin: null, targetRepMax: null, targetSeconds: 30 }), 'log-1')
    expect(logs).toHaveLength(2)
    for (const log of logs) {
      expect(log.seconds).toBe(30)
      expect(log.reps).toBeNull()
    }
  })

  it('falls back to targetRepMin when a rep item has no targetRepMax (e.g. an AMRAP top set)', () => {
    const [log] = buildSetLogsForItem(repItem({ sets: 1, targetRepMin: 6, targetRepMax: null }), 'log-1')
    expect(log.reps).toBe(6)
  })
})

describe('sessionStatusFor', () => {
  it('is completed once every item has a logged set', () => {
    expect(sessionStatusFor(3, 3)).toBe('completed')
  })

  it('is partial while some items are still unchecked', () => {
    expect(sessionStatusFor(1, 3)).toBe('partial')
  })
})

describe('selectNextSession', () => {
  it('returns the earliest session in week/day order when nothing is completed', () => {
    const sessions = [session({ id: 'w2d0', weekNumber: 2, dayIndex: 0 }), session({ id: 'w1d1', weekNumber: 1, dayIndex: 1 }), session({ id: 'w1d0', weekNumber: 1, dayIndex: 0 })]
    expect(selectNextSession(sessions, new Set())?.id).toBe('w1d0')
  })

  it('skips completed sessions even out of order, without jumping past an incomplete earlier one', () => {
    const sessions = [session({ id: 'w1d0', weekNumber: 1, dayIndex: 0 }), session({ id: 'w1d1', weekNumber: 1, dayIndex: 1 }), session({ id: 'w1d2', weekNumber: 1, dayIndex: 2 })]
    // w1d0 done, w1d2 ALSO done (e.g. logged out of order), w1d1 still open.
    const completed = new Set(['w1d0', 'w1d2'])
    expect(selectNextSession(sessions, completed)?.id).toBe('w1d1')
  })

  it('returns null once every session is completed — the whole block is done', () => {
    const sessions = [session({ id: 'w1d0' })]
    expect(selectNextSession(sessions, new Set(['w1d0']))).toBeNull()
  })

  it('returns null for an empty plan', () => {
    expect(selectNextSession([], new Set())).toBeNull()
  })
})
