import { describe, expect, it } from 'vitest'

import type { Equipment, Exercise, ExerciseContraindication, ExerciseEquipment, MovementPattern, ProgressionEdge, UserExerciseLevel } from '@/types/domain'
import { buildLibrary } from '@/generators/workout/library'
import { buildProgressionMap, findClosestToPromotion } from './progressionMap'

function pattern(overrides: Partial<MovementPattern> & Pick<MovementPattern, 'id' | 'sortOrder'>): MovementPattern {
  return { slug: `pattern-${overrides.id}`, name: `Pattern ${overrides.id}`, category: 'push', ...overrides }
}

function exercise(overrides: Partial<Exercise> & Pick<Exercise, 'id' | 'patternId' | 'level'>): Exercise {
  return {
    slug: `exercise-${overrides.id}`,
    name: `Exercise ${overrides.id}`,
    metricType: 'reps',
    repMin: 8,
    repMax: 12,
    holdMinS: null,
    holdMaxS: null,
    distanceMinM: null,
    distanceMaxM: null,
    isUnilateral: false,
    demoUrl: null,
    cues: null,
    isActive: true,
    ...overrides,
  }
}

function level(overrides: Partial<UserExerciseLevel> & Pick<UserExerciseLevel, 'patternId' | 'exerciseId'>): UserExerciseLevel {
  return {
    userId: 'user-1',
    consecutiveSuccess: 0,
    consecutiveFailure: 0,
    lastEvaluatedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const NO_EQUIPMENT: Equipment[] = []
const NO_EXERCISE_EQUIPMENT: ExerciseEquipment[] = []
const NO_CONTRAINDICATIONS: ExerciseContraindication[] = []
const NO_EDGES: ProgressionEdge[] = []

describe('buildProgressionMap', () => {
  it('marks exercises below the current level completed, at it current, above locked', () => {
    const patterns = [pattern({ id: 1, sortOrder: 1 })]
    const exercises = [
      exercise({ id: 10, patternId: 1, level: 1 }),
      exercise({ id: 11, patternId: 1, level: 2 }),
      exercise({ id: 12, patternId: 1, level: 3 }),
    ]
    const library = buildLibrary({ patterns, exercises, edges: NO_EDGES, equipment: NO_EQUIPMENT, exerciseEquipment: NO_EXERCISE_EQUIPMENT, contraindications: NO_CONTRAINDICATIONS })
    const levels = [level({ patternId: 1, exerciseId: 11 })] // currently on the level-2 exercise

    const result = buildProgressionMap(library, levels)

    expect(result).toHaveLength(1)
    expect(result[0].nodes.map((n) => n.status)).toEqual(['completed', 'current', 'locked'])
  })

  it('treats rung 1 as current when there is no user_exercise_levels row yet for a pattern', () => {
    const patterns = [pattern({ id: 2, sortOrder: 1 })]
    const exercises = [exercise({ id: 20, patternId: 2, level: 1 }), exercise({ id: 21, patternId: 2, level: 2 })]
    const library = buildLibrary({ patterns, exercises, edges: NO_EDGES, equipment: NO_EQUIPMENT, exerciseEquipment: NO_EXERCISE_EQUIPMENT, contraindications: NO_CONTRAINDICATIONS })

    const result = buildProgressionMap(library, [])

    expect(result[0].nodes.map((n) => n.status)).toEqual(['current', 'locked'])
  })

  it('orders patterns by sortOrder regardless of insertion order', () => {
    // Deliberately inserted in reverse of sortOrder — this is the case that
    // would silently pass if buildProgressionMap trusted Map iteration
    // order instead of sorting explicitly.
    const patterns = [pattern({ id: 2, sortOrder: 2 }), pattern({ id: 1, sortOrder: 1 })]
    const exercises = [exercise({ id: 10, patternId: 1, level: 1 }), exercise({ id: 20, patternId: 2, level: 1 })]
    const library = buildLibrary({ patterns, exercises, edges: NO_EDGES, equipment: NO_EQUIPMENT, exerciseEquipment: NO_EXERCISE_EQUIPMENT, contraindications: NO_CONTRAINDICATIONS })

    const result = buildProgressionMap(library, [])

    expect(result.map((p) => p.patternId)).toEqual([1, 2])
  })
})

describe('findClosestToPromotion', () => {
  const patterns = [pattern({ id: 1, sortOrder: 2 }), pattern({ id: 2, sortOrder: 1 })]
  const exercises = [
    exercise({ id: 10, patternId: 1, level: 1 }),
    exercise({ id: 11, patternId: 1, level: 2 }), // pattern 1 has a level 2 to promote to
    exercise({ id: 20, patternId: 2, level: 1 }), // pattern 2's only rung — nowhere to promote to
  ]
  const edges: ProgressionEdge[] = [{ fromExerciseId: 10, toExerciseId: 11, kind: 'progression' }]
  const library = buildLibrary({ patterns, exercises, edges, equipment: NO_EQUIPMENT, exerciseEquipment: NO_EXERCISE_EQUIPMENT, contraindications: NO_CONTRAINDICATIONS })

  it('picks the pattern with the highest consecutiveSuccess', () => {
    const levels = [level({ patternId: 1, exerciseId: 10, consecutiveSuccess: 1 })]
    expect(findClosestToPromotion(patterns, levels, library)).toEqual({ patternId: 1, patternName: 'Pattern 1', consecutiveSuccess: 1 })
  })

  it('breaks ties by sortOrder (lower wins)', () => {
    const levels = [
      level({ patternId: 1, exerciseId: 10, consecutiveSuccess: 1 }), // sortOrder 2
    ]
    // Give pattern 2 a promotable rung for this one test so the tie is real.
    const exercisesWithTie = [...exercises, exercise({ id: 21, patternId: 2, level: 2 })]
    const edgesWithTie: ProgressionEdge[] = [...edges, { fromExerciseId: 20, toExerciseId: 21, kind: 'progression' }]
    const libraryWithTie = buildLibrary({ patterns, exercises: exercisesWithTie, edges: edgesWithTie, equipment: NO_EQUIPMENT, exerciseEquipment: NO_EXERCISE_EQUIPMENT, contraindications: NO_CONTRAINDICATIONS })
    const tiedLevels = [...levels, level({ patternId: 2, exerciseId: 20, consecutiveSuccess: 1 })]

    expect(findClosestToPromotion(patterns, tiedLevels, libraryWithTie)).toEqual({ patternId: 2, patternName: 'Pattern 2', consecutiveSuccess: 1 })
  })

  it('returns null when there are no rows at all', () => {
    expect(findClosestToPromotion(patterns, [], library)).toBeNull()
  })

  it('returns null when every streak is zero', () => {
    const levels = [level({ patternId: 1, exerciseId: 10, consecutiveSuccess: 0 })]
    expect(findClosestToPromotion(patterns, levels, library)).toBeNull()
  })

  it('excludes a pattern already on its final rung even with a positive streak', () => {
    // Pattern 2's only exercise (id 20) has no outgoing progression edge in
    // the base `edges` fixture — promotionOf must return null for it.
    const levels = [level({ patternId: 2, exerciseId: 20, consecutiveSuccess: 1 })]
    expect(findClosestToPromotion(patterns, levels, library)).toBeNull()
  })
})
