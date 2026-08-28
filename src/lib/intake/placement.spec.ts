import { describe, expect, it } from 'vitest'

import { buildLibrary } from '@/generators/workout/library'
import {
  testContraindications,
  testEdges,
  testEquipment,
  testExerciseEquipment,
  testExercises,
  testPatterns,
} from '@/generators/__fixtures__/testLibrary'

import {
  biasDown,
  computeTestedLevels,
  corePlankLevel,
  horizontalPushLevel,
  resolveStartingLevels,
  squatLevel,
  UNTESTED_PATTERN_DEFAULT_LEVEL,
  verticalPullLevel,
  verticalPushLevel,
} from './placement'

describe('horizontalPushLevel', () => {
  it('matches every doc bucket boundary', () => {
    expect(horizontalPushLevel(0, 0)).toBe(1) // 0 knee
    expect(horizontalPushLevel(1, 0)).toBe(2) // 1-8 knee
    expect(horizontalPushLevel(8, 0)).toBe(2)
    expect(horizontalPushLevel(9, 0)).toBe(3) // 9+ knee
    expect(horizontalPushLevel(0, 2)).toBe(3) // 0-2 full
    expect(horizontalPushLevel(0, 3)).toBe(4) // 3-8 full
    expect(horizontalPushLevel(0, 8)).toBe(4)
    expect(horizontalPushLevel(0, 9)).toBe(5) // 9-15
    expect(horizontalPushLevel(0, 15)).toBe(5)
    expect(horizontalPushLevel(0, 16)).toBe(6) // 16-25
    expect(horizontalPushLevel(0, 25)).toBe(6)
    expect(horizontalPushLevel(0, 26)).toBe(7) // 26+
    expect(horizontalPushLevel(0, 100)).toBe(7)
  })

  it('a high full-rep count is never shadowed by a knee-rep answer', () => {
    expect(horizontalPushLevel(50, 30)).toBe(7)
  })
})

describe('verticalPullLevel', () => {
  it('uses pull-up count once any pull-ups are possible', () => {
    expect(verticalPullLevel(1, 0)).toBe(4)
    expect(verticalPullLevel(3, 0)).toBe(4)
    expect(verticalPullLevel(4, 0)).toBe(5)
    expect(verticalPullLevel(8, 0)).toBe(5)
    expect(verticalPullLevel(9, 0)).toBe(6)
    expect(verticalPullLevel(14, 0)).toBe(6)
    expect(verticalPullLevel(15, 0)).toBe(8)
  })

  it('falls back to hang duration at zero pull-ups', () => {
    expect(verticalPullLevel(0, 0)).toBe(1)
    expect(verticalPullLevel(0, 14)).toBe(1)
    expect(verticalPullLevel(0, 15)).toBe(2)
    expect(verticalPullLevel(0, 29)).toBe(2)
    expect(verticalPullLevel(0, 30)).toBe(3)
  })
})

describe('squatLevel', () => {
  it('matches every doc bucket boundary', () => {
    expect(squatLevel(0)).toBe(1)
    expect(squatLevel(10)).toBe(1)
    expect(squatLevel(11)).toBe(2)
    expect(squatLevel(25)).toBe(2)
    expect(squatLevel(26)).toBe(3)
    expect(squatLevel(40)).toBe(3)
    expect(squatLevel(41)).toBe(4)
    expect(squatLevel(1000)).toBe(4)
  })
})

describe('corePlankLevel', () => {
  it('matches the re-pointed bucket boundaries', () => {
    expect(corePlankLevel(0)).toBe(2)
    expect(corePlankLevel(19)).toBe(2)
    expect(corePlankLevel(20)).toBe(3)
    expect(corePlankLevel(45)).toBe(3)
    expect(corePlankLevel(46)).toBe(4)
    expect(corePlankLevel(75)).toBe(4)
    expect(corePlankLevel(76)).toBe(6)
  })
})

describe('verticalPushLevel', () => {
  it('places "cannot hold at all" at the floor', () => {
    expect(verticalPushLevel(null)).toBe(1)
  })

  it('matches the re-pointed bucket boundaries', () => {
    expect(verticalPushLevel(0)).toBe(2)
    expect(verticalPushLevel(19)).toBe(2)
    expect(verticalPushLevel(20)).toBe(3)
    expect(verticalPushLevel(45)).toBe(3)
    expect(verticalPushLevel(46)).toBe(4)
  })
})

describe('biasDown', () => {
  it('subtracts one rung', () => {
    expect(biasDown(4)).toBe(3)
  })

  it('floors at level 1, never goes to 0 or negative', () => {
    expect(biasDown(1)).toBe(1)
  })
})

describe('computeTestedLevels', () => {
  it('returns an empty object when the tests were skipped', () => {
    expect(computeTestedLevels({ skipped: true, squat: { reps: 50 } })).toEqual({})
  })

  it('applies bias-down to every provided answer', () => {
    const levels = computeTestedLevels({
      skipped: false,
      horizontalPush: { kneeReps: 0, fullReps: 5 }, // tested level 4 -> biased 3
      squat: { reps: 30 }, // tested level 3 -> biased 2
    })
    expect(levels).toEqual({ horizontal_push: 3, squat: 2 })
  })

  it('only includes patterns that were actually answered', () => {
    const levels = computeTestedLevels({ skipped: false, core: { plankSeconds: 60 } })
    expect(Object.keys(levels)).toEqual(['core'])
  })
})

describe('resolveStartingLevels', () => {
  const library = buildLibrary({
    patterns: testPatterns,
    exercises: testExercises,
    edges: testEdges,
    equipment: testEquipment,
    exerciseEquipment: testExerciseEquipment,
    contraindications: testContraindications,
  })
  const noRng = () => 0.5

  it('places every pattern in the library, defaulting untested ones to level 2', () => {
    // testLibrary has 4 patterns (push/pull/core/skill); none match the
    // 5 doc-tested slugs, so every one should land on the default.
    const rows = resolveStartingLevels(library, 'u1', {}, new Set(), new Set(), noRng)
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      const exercise = library.exerciseById.get(row.exerciseId)!
      expect(exercise.level).toBeLessThanOrEqual(UNTESTED_PATTERN_DEFAULT_LEVEL)
    }
  })

  it('finds the real exercise at or below a tested level', () => {
    // test_push pattern (id 1): level 3 target should land on test_push_3 (id 3).
    const rows = resolveStartingLevels(library, 'u1', { test_push: 3 }, new Set([1]), new Set(), noRng)
    const pushRow = rows.find((r) => r.patternId === 1)!
    expect(pushRow.exerciseId).toBe(3)
  })

  it('gates the placement on owned equipment, same as the workout generator', () => {
    // test_push level 3 needs a bench. Without one, placement should
    // regress to test_push_2 (no requirement) via the SAME selectExercise
    // the generator uses.
    const rows = resolveStartingLevels(library, 'u1', { test_push: 3 }, new Set(), new Set(), noRng)
    const pushRow = rows.find((r) => r.patternId === 1)!
    expect(pushRow.exerciseId).toBe(2)
  })

  it('gates the placement on flagged injuries too', () => {
    // test_push_4 (wrist avoid) with wrist flagged should regress to test_push_3.
    const rows = resolveStartingLevels(library, 'u1', { test_push: 4 }, new Set([1]), new Set([1]), noRng)
    const pushRow = rows.find((r) => r.patternId === 1)!
    expect(pushRow.exerciseId).toBe(3)
  })

  it('stamps every row with the given userId and a lastEvaluatedAt', () => {
    const rows = resolveStartingLevels(library, 'test-user-42', {}, new Set(), new Set(), noRng)
    for (const row of rows) {
      expect(row.userId).toBe('test-user-42')
      expect(row.lastEvaluatedAt).not.toBeNull()
      expect(row.consecutiveSuccess).toBe(0)
      expect(row.consecutiveFailure).toBe(0)
    }
  })
})
