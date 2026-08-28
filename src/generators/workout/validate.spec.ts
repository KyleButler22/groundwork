import { describe, expect, it } from 'vitest'

import {
  testContraindications,
  testEdges,
  testEquipment,
  testExerciseEquipment,
  testExercises,
  testPatterns,
} from '@/generators/__fixtures__/testLibrary'
import type { PlanItem, PlanSession } from '@/types/domain'

import { buildLibrary } from './library'
import type { SessionTemplate } from './splits'
import { type ValidationInput, validatePlan } from './validate'

const library = buildLibrary({
  patterns: testPatterns,
  exercises: testExercises,
  edges: testEdges,
  equipment: testEquipment,
  exerciseEquipment: testExerciseEquipment,
  contraindications: testContraindications,
})

const template: SessionTemplate = {
  name: 'Test Session',
  slots: [
    { patternSlug: 'test_push', required: true, priority: 1 },
    { patternSlug: 'test_pull', required: true, priority: 2 },
    { patternSlug: 'test_core', required: false, priority: 3 },
  ],
}

function session(id: string, weekNumber: number): PlanSession {
  return { id, planId: 'p1', weekNumber, dayIndex: 0, name: 'Test Session', weekType: 'build', estMinutes: 30 }
}

function item(sessionId: string, exerciseId: number, overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: `${sessionId}-${exerciseId}-${Math.random()}`,
    sessionId,
    orderIndex: 0,
    exerciseId,
    sets: 4,
    targetRepMin: 6,
    targetRepMax: 10,
    targetSeconds: null,
    restSeconds: 90,
    tempo: null,
    supersetGroup: null,
    isAmrapLastSet: false,
    note: null,
    ...overrides,
  }
}

// Two identical sessions/week, each with push (id1) + pull (id5) at 4 sets
// -> 8 sets/week per pattern (right at the floor) and frequency 2/2 for
// both — a genuinely clean baseline with zero violations.
function cleanInput(overrides: Partial<ValidationInput> = {}): ValidationInput {
  const sessions = [session('s1', 1), session('s2', 1)]
  const items = [
    item('s1', 1, { targetRepMax: 10 }),
    item('s1', 5, { targetSeconds: 20, targetRepMin: null, targetRepMax: null }),
    item('s2', 1, { targetRepMax: 10 }),
    item('s2', 5, { targetSeconds: 20, targetRepMin: null, targetRepMax: null }),
  ]
  return {
    library,
    sessions,
    items,
    templateBySessionId: new Map([
      ['s1', template],
      ['s2', template],
    ]),
    ownedEquipment: new Set(),
    flaggedRegions: new Set(),
    sessionMinutes: 30,
    daysPerWeek: 2,
    ...overrides,
  }
}

describe('validatePlan — clean plan', () => {
  it('produces zero violations for a well-formed plan', () => {
    expect(validatePlan(cleanInput())).toEqual([])
  })
})

describe('validatePlan — individual checks', () => {
  it('flags a session that exceeds its time budget', () => {
    const input = cleanInput()
    // sessionMinutes 5 -> usable = 300 - 540 = -240; anything at all overflows.
    const violations = validatePlan({ ...input, sessionMinutes: 5 })
    expect(violations.some((v) => v.code === 'over_time_budget')).toBe(true)
  })

  it('does NOT flag an over-budget week 3 or peak week 4 — weekPlan.ts already accepts that trade-off', () => {
    const input = cleanInput({ sessionMinutes: 5 }) // guarantee an overflow if the check ran
    const week3 = { ...session('s1', 3), weekType: 'build' as const }
    const week4Peak = { ...session('s1', 4), weekType: 'peak' as const }
    const week4Deload = { ...session('s1', 4), weekType: 'deload' as const }

    expect(validatePlan({ ...input, sessions: [week3] }).some((v) => v.code === 'over_time_budget')).toBe(false)
    expect(validatePlan({ ...input, sessions: [week4Peak] }).some((v) => v.code === 'over_time_budget')).toBe(false)
    // A deload week got no such allowance and should still be checked.
    expect(validatePlan({ ...input, sessions: [week4Deload] }).some((v) => v.code === 'over_time_budget')).toBe(true)
  })

  it('flags the same exercise appearing twice in one session', () => {
    const input = cleanInput()
    const dup = [...input.items, item('s1', 1)] // exercise 1 already in s1
    const violations = validatePlan({ ...input, items: dup })
    expect(violations.some((v) => v.code === 'duplicate_exercise')).toBe(true)
  })

  it('flags a contraindicated exercise for a flagged region', () => {
    const input = cleanInput({ flaggedRegions: new Set([1]) }) // wrist flagged
    const withBadExercise = [...input.items, item('s1', 4, { targetRepMax: 8 })] // push L4, wrist-avoid
    const violations = validatePlan({ ...input, items: withBadExercise })
    expect(violations.some((v) => v.code === 'contraindicated_exercise')).toBe(true)
  })

  it('flags an exercise whose equipment requirement is not met', () => {
    const input = cleanInput({ ownedEquipment: new Set() })
    const withUnequippedExercise = [...input.items, item('s1', 3, { targetRepMax: 12 })] // push L3 needs a bench
    const violations = validatePlan({ ...input, items: withUnequippedExercise })
    expect(violations.some((v) => v.code === 'unmet_equipment')).toBe(true)
  })

  it('flags a required slot missing from a session', () => {
    const input = cleanInput()
    const missingPull = input.items.filter((i) => i.exerciseId !== 5) // drop all pull items
    const violations = validatePlan({ ...input, items: missingPull })
    expect(violations.filter((v) => v.code === 'missing_required_slot')).toHaveLength(2) // s1 and s2 both missing it
  })

  it('flags a pattern with fewer than 8 weekly sets', () => {
    const input = cleanInput()
    const thinWeek = input.items.map((i) => (i.exerciseId === 1 ? { ...i, sets: 1 } : i)) // push: 1+1=2 sets/week
    const violations = validatePlan({ ...input, items: thinWeek })
    expect(violations.some((v) => v.code === 'weekly_sets_out_of_range')).toBe(true)
  })

  it('flags a pattern with more than 25 weekly sets', () => {
    const input = cleanInput()
    const heavyWeek = input.items.map((i) => (i.exerciseId === 1 ? { ...i, sets: 20 } : i)) // push: 20+20=40 sets/week
    const violations = validatePlan({ ...input, items: heavyWeek })
    expect(violations.some((v) => v.code === 'weekly_sets_out_of_range')).toBe(true)
  })

  it('flags a pattern that misses its required weekly frequency', () => {
    const input = cleanInput()
    const onlyOneSessionHasPush = input.items.filter((i) => !(i.sessionId === 's2' && i.exerciseId === 1))
    const violations = validatePlan({ ...input, items: onlyOneSessionHasPush })
    expect(violations.some((v) => v.code === 'pattern_frequency_shortfall')).toBe(true)
  })

  it('flags a 7-day plan for leaving no rest day', () => {
    const input = cleanInput({ daysPerWeek: 7 })
    const violations = validatePlan(input)
    expect(violations.some((v) => v.code === 'no_rest_day')).toBe(true)
  })

  it('does not flag frequency or weekly-sets for an OPTIONAL slot that got dropped', () => {
    // test_core is optional in `template` and never appears in the clean
    // baseline at all — that must never be a violation.
    const violations = validatePlan(cleanInput())
    expect(violations.some((v) => v.message.includes('test_core'))).toBe(false)
  })
})
