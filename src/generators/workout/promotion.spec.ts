import { describe, expect, it } from 'vitest'

import {
  testContraindications,
  testEdges,
  testEquipment,
  testExerciseEquipment,
  testExercises,
  testPatterns,
} from '@/generators/__fixtures__/testLibrary'
import type { PlanItem, SetLog, UserExerciseLevel } from '@/types/domain'

import { buildLibrary } from './library'
import { applyWorkoutLog, type PromotionInput } from './promotion'

const library = buildLibrary({
  patterns: testPatterns,
  exercises: testExercises,
  edges: testEdges,
  equipment: testEquipment,
  exerciseEquipment: testExerciseEquipment,
  contraindications: testContraindications,
})

function levelAt(patternId: number, exerciseId: number, overrides: Partial<UserExerciseLevel> = {}): UserExerciseLevel {
  return {
    userId: 'u1',
    patternId,
    exerciseId,
    consecutiveSuccess: 0,
    consecutiveFailure: 0,
    lastEvaluatedAt: null,
    ...overrides,
  }
}

// push L2 (id2): reps 6-12. One plan item prescribing that exercise.
const repsItem: PlanItem = {
  id: 'item-1',
  sessionId: 's1',
  orderIndex: 0,
  exerciseId: 2,
  sets: 3,
  targetRepMin: 6,
  targetRepMax: 12,
  targetSeconds: null,
  restSeconds: 90,
  tempo: null,
  supersetGroup: null,
  isAmrapLastSet: false,
  note: null,
}

// pull L1 (id5): a hold, 15-30s. Prescribed target here: 20s.
const holdItem: PlanItem = {
  ...repsItem,
  id: 'item-2',
  exerciseId: 5,
  targetRepMin: null,
  targetRepMax: null,
  targetSeconds: 20,
}

function setLog(planItemId: string, exerciseId: number, overrides: Partial<SetLog>): SetLog {
  return {
    id: `set-${Math.random()}`,
    workoutLogId: 'w1',
    planItemId,
    exerciseId,
    setNumber: 1,
    reps: null,
    seconds: null,
    addedWeightKg: null,
    assistBand: null,
    rpe: null,
    ...overrides,
  }
}

function run(overrides: Partial<PromotionInput>): ReturnType<typeof applyWorkoutLog> {
  return applyWorkoutLog({
    library,
    levels: [],
    setLogs: [],
    planItems: [repsItem, holdItem],
    weekType: 'build',
    now: '2026-08-28T00:00:00.000Z',
    ...overrides,
  })
}

describe('applyWorkoutLog — reps', () => {
  it('does nothing at all on a deload week, even with a clean sweep', () => {
    const levels = [levelAt(1, 2, { consecutiveSuccess: 1 })]
    const result = run({
      levels,
      weekType: 'deload',
      setLogs: [setLog('item-1', 2, { reps: 12 }), setLog('item-1', 2, { reps: 12 })],
    })
    expect(result.levels).toEqual(levels)
    expect(result.events).toEqual([])
  })

  it('increments the success streak on a clean sweep of target_rep_max, without promoting on the first', () => {
    const levels = [levelAt(1, 2)]
    const result = run({ levels, setLogs: [setLog('item-1', 2, { reps: 12 }), setLog('item-1', 2, { reps: 13 })] })
    expect(result.levels).toEqual([levelAt(1, 2, { consecutiveSuccess: 1, lastEvaluatedAt: '2026-08-28T00:00:00.000Z' })])
    expect(result.events).toEqual([{ type: 'held', patternId: 1, exerciseId: 2 }])
  })

  it('promotes to the next rung on the SECOND consecutive clean sweep', () => {
    const levels = [levelAt(1, 2, { consecutiveSuccess: 1 })]
    const result = run({ levels, setLogs: [setLog('item-1', 2, { reps: 12 })] })
    expect(result.levels[0]).toMatchObject({ patternId: 1, exerciseId: 3, consecutiveSuccess: 0 })
    expect(result.events).toEqual([{ type: 'promoted', patternId: 1, from: 2, to: 3, ambiguousBranch: false }])
  })

  it('increments the failure streak when any set misses target_rep_min', () => {
    const levels = [levelAt(1, 2, { consecutiveFailure: 1 })]
    const result = run({ levels, setLogs: [setLog('item-1', 2, { reps: 4 })] }) // below min of 6
    expect(result.levels[0]).toMatchObject({ consecutiveFailure: 2, consecutiveSuccess: 0 })
    expect(result.events).toEqual([{ type: 'held', patternId: 1, exerciseId: 2 }])
  })

  it('regresses to the previous rung on the THIRD consecutive failure', () => {
    const levels = [levelAt(1, 2, { consecutiveFailure: 2 })]
    const result = run({ levels, setLogs: [setLog('item-1', 2, { reps: 4 })] })
    expect(result.levels[0]).toMatchObject({ exerciseId: 1, consecutiveFailure: 0 })
    expect(result.events).toEqual([{ type: 'regressed', patternId: 1, from: 2, to: 1 }])
  })

  it('an in-range session resets consecutiveSuccess but leaves consecutiveFailure untouched (docs/generator.md §7)', () => {
    // 8 reps: below target_rep_max (12) so not a clean sweep, but at or
    // above target_rep_min (6) so not a floor miss either — "in range".
    const levels = [levelAt(1, 2, { consecutiveSuccess: 1, consecutiveFailure: 2 })]
    const result = run({ levels, setLogs: [setLog('item-1', 2, { reps: 8 })] })
    expect(result.levels[0]).toMatchObject({ consecutiveSuccess: 0, consecutiveFailure: 2 })
  })

  it('emits ceiling_reached instead of promoting once there is no rung left to promote to', () => {
    // push L4 (id4) is the top of the push ladder.
    const ceilingItem: PlanItem = { ...repsItem, id: 'item-3', exerciseId: 4, targetRepMin: 4, targetRepMax: 8 }
    const levels = [levelAt(1, 4, { consecutiveSuccess: 1 })]
    const result = applyWorkoutLog({
      library,
      levels,
      setLogs: [setLog('item-3', 4, { reps: 8 })],
      planItems: [ceilingItem],
      weekType: 'build',
      now: 't',
    })
    expect(result.levels[0]).toMatchObject({ exerciseId: 4, consecutiveSuccess: 0 })
    expect(result.events).toEqual([{ type: 'ceiling_reached', patternId: 1, exerciseId: 4 }])
  })

  it('emits regression_floor_reached instead of regressing below the floor of a ladder', () => {
    // push L1 (id1) is the floor of the push ladder.
    const floorItem: PlanItem = { ...repsItem, id: 'item-4', exerciseId: 1, targetRepMin: 8, targetRepMax: 15 }
    const levels = [levelAt(1, 1, { consecutiveFailure: 2 })]
    const result = applyWorkoutLog({
      library,
      levels,
      setLogs: [setLog('item-4', 1, { reps: 3 })],
      planItems: [floorItem],
      weekType: 'build',
      now: 't',
    })
    expect(result.levels[0]).toMatchObject({ exerciseId: 1, consecutiveFailure: 0 })
    expect(result.events).toEqual([{ type: 'regression_floor_reached', patternId: 1, exerciseId: 1 }])
  })

  it('ignores a set with no plan_item_id and reports it rather than crashing', () => {
    const levels = [levelAt(1, 2)]
    const freestyle = setLog('item-1', 2, { reps: 10, planItemId: null })
    const result = run({ levels, setLogs: [freestyle] })
    expect(result.levels).toEqual(levels) // untouched — nothing to evaluate
    expect(result.events).toEqual([{ type: 'skipped_no_target', patternId: 1 }])
  })

  it('leaves a pattern with no recorded level untouched rather than crashing', () => {
    const result = run({ levels: [], setLogs: [setLog('item-1', 2, { reps: 12 })] })
    expect(result.levels).toEqual([])
    expect(result.events).toEqual([])
  })
})

describe('applyWorkoutLog — holds', () => {
  it('treats meeting or beating target_seconds as a clean sweep', () => {
    const levels = [levelAt(2, 5, { consecutiveSuccess: 1 })]
    const result = run({ levels, setLogs: [setLog('item-2', 5, { seconds: 20 })] })
    expect(result.levels[0]).toMatchObject({ exerciseId: 6, consecutiveSuccess: 0 }) // promoted
    expect(result.events).toEqual([{ type: 'promoted', patternId: 2, from: 5, to: 6, ambiguousBranch: false }])
  })

  it('treats well under target_seconds (below the failure fraction) as a floor miss', () => {
    // target 20s, HOLD_FAILURE_FRACTION 0.7 -> floor is 14s. 10s misses it.
    const levels = [levelAt(2, 5, { consecutiveFailure: 2 })]
    const result = run({ levels, setLogs: [setLog('item-2', 5, { seconds: 10 })] })
    // pull L1 (id5) is the floor of the pull ladder — nowhere to regress to.
    expect(result.levels[0]).toMatchObject({ consecutiveFailure: 0, exerciseId: 5 })
    expect(result.events[0].type).toBe('regression_floor_reached')
  })

  it('treats a hold between the failure floor and the full target as in-range', () => {
    // target 20s, floor 14s. 17s is neither a clean sweep nor a floor miss.
    const levels = [levelAt(2, 5, { consecutiveSuccess: 1, consecutiveFailure: 1 })]
    const result = run({ levels, setLogs: [setLog('item-2', 5, { seconds: 17 })] })
    expect(result.levels[0]).toMatchObject({ consecutiveSuccess: 0, consecutiveFailure: 1 })
  })
})
