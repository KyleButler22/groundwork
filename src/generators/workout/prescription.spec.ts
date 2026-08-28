import { describe, expect, it } from 'vitest'

import {
  testContraindications,
  testEdges,
  testEquipment,
  testExerciseEquipment,
  testExercises,
  testPatterns,
} from '@/generators/__fixtures__/testLibrary'
import type { Exercise } from '@/types/domain'

import { buildLibrary } from './library'
import { intersectRange, resolvePrescription } from './prescription'

const library = buildLibrary({
  patterns: testPatterns,
  exercises: testExercises,
  edges: testEdges,
  equipment: testEquipment,
  exerciseEquipment: testExerciseEquipment,
  contraindications: testContraindications,
})

describe('intersectRange', () => {
  it('takes the tighter bound on each side', () => {
    expect(intersectRange(6, 12, 8, 15)).toEqual({ min: 8, max: 12 })
  })

  it('returns null when the ranges do not overlap at all', () => {
    expect(intersectRange(10, 15, 4, 8)).toBeNull()
  })

  it('allows a single-point range (min === max)', () => {
    expect(intersectRange(3, 6, 6, 12)).toEqual({ min: 6, max: 6 })
  })
})

describe('resolvePrescription', () => {
  it('resolves a reps exercise directly when the ranges already overlap', () => {
    // muscle_gain: 6-12. test_push_1: 8-15. Intersection: 8-12.
    const result = resolvePrescription(library, 1, 'muscle_gain')
    expect(result).toEqual({
      exerciseId: 1,
      prescription: {
        metricType: 'reps',
        repMin: 8,
        repMax: 12,
        holdMinS: null,
        holdMaxS: null,
        restSeconds: 120,
        minSets: 4,
        maxSets: 4,
      },
    })
  })

  it('resolves a hold (time_seconds) exercise the same way', () => {
    // muscle_gain hold range: 20-40. test_pull_1: 15-30. Intersection: 20-30.
    const result = resolvePrescription(library, 5, 'muscle_gain')
    expect(result?.prescription.metricType).toBe('time_seconds')
    expect(result?.prescription.holdMinS).toBe(20)
    expect(result?.prescription.holdMaxS).toBe(30)
    expect(result?.prescription.repMin).toBeNull()
  })

  it('regresses one rung when the starting exercise does not overlap the goal', () => {
    // fat_loss reps: 10-15. test_pull_3 (id7): 4-8 — no overlap at all.
    // test_pull_2 (id6): 6-12 — overlaps at 10-12.
    const result = resolvePrescription(library, 7, 'fat_loss')
    expect(result?.exerciseId).toBe(6)
    expect(result?.prescription.repMin).toBe(10)
    expect(result?.prescription.repMax).toBe(12)
  })

  it('returns null when no rung down to the floor ever overlaps the goal', () => {
    // Construct a goal-shaped range that overlaps NONE of the push ladder
    // by using an out-of-band prescription directly rather than a real
    // Goal — the point is testing the regress-to-null path, not a real
    // goal's numbers.
    const impossible = intersectRange(200, 300, 8, 15)
    expect(impossible).toBeNull() // sanity: these truly don't overlap

    // Real test: every push rung's rep range sits well inside 3-15, so to
    // exercise the "regress all the way to null" path for real, flag the
    // floor itself as unreachable by giving it an exercise rep range with
    // no possible overlap against every defined goal is impractical here —
    // instead prove the mechanism directly against a hand-built library
    // whose single exercise's range can never overlap any goal.
    const noOverlapLibrary = buildLibrary({
      patterns: testPatterns,
      exercises: [
        { ...testExercises[0], id: 100, slug: 'impossible', repMin: 100, repMax: 100 },
      ] as Exercise[],
      edges: [],
      equipment: testEquipment,
      exerciseEquipment: [],
      contraindications: [],
    })
    expect(resolvePrescription(noOverlapLibrary, 100, 'fat_loss')).toBeNull()
  })

  it('prescribes a distance_m exercise as-is, with no goal-based narrowing', () => {
    const distanceLibrary = buildLibrary({
      patterns: testPatterns,
      exercises: [
        {
          ...testExercises[0],
          id: 200,
          slug: 'walk',
          metricType: 'distance_m',
          repMin: null,
          repMax: null,
          distanceMinM: 2,
          distanceMaxM: 6,
        },
      ] as Exercise[],
      edges: [],
      equipment: testEquipment,
      exerciseEquipment: [],
      contraindications: [],
    })
    const result = resolvePrescription(distanceLibrary, 200, 'skill')
    expect(result?.exerciseId).toBe(200)
    expect(result?.prescription.metricType).toBe('distance_m')
    expect(result?.prescription.minSets).toBe(2) // still gets the goal's set count
    expect(result?.prescription.maxSets).toBe(3)
  })
})
