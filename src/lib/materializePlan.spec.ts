import { describe, expect, it } from 'vitest'

import { materializePlan } from './materializePlan'
import type { PlanItem, PlanSession, WorkoutPlan } from '@/types/domain'

function draftPlan(): WorkoutPlan {
  return {
    id: 'draft-plan',
    userId: 'u1',
    name: 'test plan',
    splitType: 'full_body',
    daysPerWeek: 1,
    weeks: 4,
    startsOn: '2026-09-01',
    status: 'active',
    generatorVersion: 'test',
    seed: 1,
    updatedAt: '',
  }
}

function draftSession(id: string): PlanSession {
  return { id, planId: 'draft-plan', weekNumber: 1, dayIndex: 0, name: 'Full Body', weekType: 'build', estMinutes: 30 }
}

function draftItem(id: string, sessionId: string): PlanItem {
  return {
    id,
    sessionId,
    orderIndex: 0,
    exerciseId: 1,
    sets: 3,
    targetRepMin: 8,
    targetRepMax: 12,
    targetSeconds: null,
    restSeconds: 90,
    tempo: null,
    supersetGroup: null,
    isAmrapLastSet: false,
    note: null,
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('materializePlan', () => {
  it('replaces every synthetic id with a real UUID', () => {
    const result = materializePlan({
      plan: draftPlan(),
      sessions: [draftSession('draft-w1-d0')],
      items: [draftItem('draft-w1-d0-0', 'draft-w1-d0')],
    })
    expect(result.plan.id).toMatch(UUID_RE)
    expect(result.sessions[0].id).toMatch(UUID_RE)
    expect(result.items[0].id).toMatch(UUID_RE)
    expect(result.plan.id).not.toBe('draft-plan')
  })

  it('keeps every foreign key pointing at the correct remapped row', () => {
    const result = materializePlan({
      plan: draftPlan(),
      sessions: [draftSession('draft-w1-d0'), draftSession('draft-w1-d1')],
      items: [draftItem('draft-w1-d0-0', 'draft-w1-d0'), draftItem('draft-w1-d1-0', 'draft-w1-d1')],
    })
    expect(result.sessions.every((s) => s.planId === result.plan.id)).toBe(true)
    expect(result.items[0].sessionId).toBe(result.sessions[0].id)
    expect(result.items[1].sessionId).toBe(result.sessions[1].id)
    expect(result.items[0].sessionId).not.toBe(result.items[1].sessionId)
  })

  it('gives every row a DISTINCT id, never reusing one by accident', () => {
    const result = materializePlan({
      plan: draftPlan(),
      sessions: [draftSession('draft-w1-d0'), draftSession('draft-w2-d0')],
      items: [],
    })
    expect(result.sessions[0].id).not.toBe(result.sessions[1].id)
  })

  it('throws rather than silently dropping an item whose session is missing from the draft', () => {
    expect(() =>
      materializePlan({
        plan: draftPlan(),
        sessions: [draftSession('draft-w1-d0')],
        items: [draftItem('draft-orphan-0', 'draft-w9-d9')],
      }),
    ).toThrow(/references session draft-w9-d9/)
  })
})
