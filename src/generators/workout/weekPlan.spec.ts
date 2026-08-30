import { describe, expect, it } from 'vitest'

import { buildLibrary } from './library'
import type { ResolvedPrescription } from './prescription'
import { anyPatternAtOrAboveLevel, resolveWeekTarget, weekSets, weekType } from './weekPlan'
import { testEdges, testEquipment, testExerciseEquipment, testContraindications, testExercises, testPatterns } from '@/generators/__fixtures__/testLibrary'
import type { UserExerciseLevel } from '@/types/domain'

describe('weekType', () => {
  it('is "build" for weeks 1-3 regardless of any trigger', () => {
    expect(weekType(1, true, 100)).toBe('build')
    expect(weekType(2, true, 100)).toBe('build')
    expect(weekType(3, true, 100)).toBe('build')
  })

  it('is "deload" at week 4 when any pattern reached level 5', () => {
    expect(weekType(4, true, 0)).toBe('deload')
  })

  it('is "deload" at week 4 after 8+ weeks trained, even with no high-level pattern', () => {
    expect(weekType(4, false, 8)).toBe('deload')
    expect(weekType(4, false, 12)).toBe('deload')
  })

  it('is "peak" at week 4 when neither trigger has fired', () => {
    expect(weekType(4, false, 4)).toBe('peak')
  })
})

describe('anyPatternAtOrAboveLevel', () => {
  const library = buildLibrary({
    patterns: testPatterns,
    exercises: testExercises,
    edges: testEdges,
    equipment: testEquipment,
    exerciseEquipment: testExerciseEquipment,
    contraindications: testContraindications,
  })

  function levelAt(exerciseId: number): UserExerciseLevel[] {
    return [{ userId: 'u', patternId: 1, exerciseId, consecutiveSuccess: 0, consecutiveFailure: 0, lastEvaluatedAt: null, updatedAt: '' }]
  }

  it('is true when a level meets the threshold', () => {
    expect(anyPatternAtOrAboveLevel(library, levelAt(4), 4)).toBe(true) // push L4 = level 4.0
  })

  it('is false when every level is below the threshold', () => {
    expect(anyPatternAtOrAboveLevel(library, levelAt(2), 4)).toBe(false) // push L2 = level 2.0
  })
})

describe('weekSets', () => {
  it('holds steady for weeks 1 and 2', () => {
    expect(weekSets(3, 1, 'build', 4)).toBe(3)
    expect(weekSets(3, 2, 'build', 4)).toBe(3)
  })

  it('adds one set in week 3, capped at maxSets', () => {
    expect(weekSets(3, 3, 'build', 4)).toBe(4)
    expect(weekSets(4, 3, 'build', 4)).toBe(4) // already at the ceiling — no-op, not an error
  })

  it('roughly halves volume on a deload week, floored at 1', () => {
    expect(weekSets(4, 4, 'deload', 4)).toBe(2)
    expect(weekSets(1, 4, 'deload', 4)).toBe(1)
  })

  it('does NOT floor a deload at a fixed goal’s minSets — that would cancel the deload', () => {
    // muscle_gain-shaped: minSets === maxSets === 4. A deload must still
    // be allowed to drop below 4, or "deload" is meaningless for any
    // fixed-sets goal.
    expect(weekSets(4, 4, 'deload', 4)).toBe(2)
  })

  it('treats a peak week 4 as a second hard week, same as week 3', () => {
    expect(weekSets(3, 4, 'peak', 4)).toBe(4)
  })
})

describe('resolveWeekTarget', () => {
  const repsRx: ResolvedPrescription = {
    metricType: 'reps',
    repMin: 8,
    repMax: 12,
    holdMinS: null,
    holdMaxS: null,
    restSeconds: 90,
    minSets: 3,
    maxSets: 4,
  }

  it('creeps the rep target from the bottom to the top of the range across weeks 1-3', () => {
    // span = 4: week1 [8,10], week2 [9,11], week3 [10,12] — hand-verified
    // against creepRange's own formula before asserting (lo+span/2,
    // lo+span/4..hi-span/4, hi-span/2..hi).
    expect(resolveWeekTarget(repsRx, 3, 1, 'build')).toMatchObject({ targetRepMin: 8, targetRepMax: 10 })
    expect(resolveWeekTarget(repsRx, 3, 2, 'build')).toMatchObject({ targetRepMin: 9, targetRepMax: 11 })
    expect(resolveWeekTarget(repsRx, 3, 3, 'build')).toMatchObject({ targetRepMin: 10, targetRepMax: 12 })
  })

  it('week 4 repeats week 1’s band on deload, week 3’s on peak', () => {
    expect(resolveWeekTarget(repsRx, 3, 4, 'deload')).toMatchObject({ targetRepMin: 8, targetRepMax: 10 })
    expect(resolveWeekTarget(repsRx, 3, 4, 'peak')).toMatchObject({ targetRepMin: 10, targetRepMax: 12 })
  })

  it('never returns a rep target when the prescription is a hold', () => {
    const holdRx: ResolvedPrescription = { ...repsRx, metricType: 'time_seconds', repMin: null, repMax: null, holdMinS: 20, holdMaxS: 40 }
    const week1 = resolveWeekTarget(holdRx, 3, 1, 'build')
    expect(week1.targetRepMin).toBeNull()
    expect(week1.targetRepMax).toBeNull()
    expect(week1.targetSeconds).toBe(20)
  })

  it('creeps a hold target lo -> mid -> hi across weeks 1-3', () => {
    const holdRx: ResolvedPrescription = { ...repsRx, metricType: 'time_seconds', repMin: null, repMax: null, holdMinS: 20, holdMaxS: 40 }
    expect(resolveWeekTarget(holdRx, 3, 1, 'build').targetSeconds).toBe(20)
    expect(resolveWeekTarget(holdRx, 3, 2, 'build').targetSeconds).toBe(30)
    expect(resolveWeekTarget(holdRx, 3, 3, 'build').targetSeconds).toBe(40)
  })

  it('always applies weekSets regardless of metric type', () => {
    const holdRx: ResolvedPrescription = { ...repsRx, metricType: 'time_seconds', repMin: null, repMax: null, holdMinS: 20, holdMaxS: 40 }
    expect(resolveWeekTarget(holdRx, 3, 3, 'build').sets).toBe(4)
  })
})
