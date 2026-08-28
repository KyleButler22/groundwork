import { describe, expect, it } from 'vitest'

import {
  testContraindications,
  testEdges,
  testEquipment,
  testExerciseEquipment,
  testExercises,
  testPatterns,
} from '@/generators/__fixtures__/testLibrary'

import { buildLibrary } from './library'
import { selectExercise } from './selectExercise'

const library = buildLibrary({
  patterns: testPatterns,
  exercises: testExercises,
  edges: testEdges,
  equipment: testEquipment,
  exerciseEquipment: testExerciseEquipment,
  contraindications: testContraindications,
})

const noRng = () => 0.5 // fixture has no lateral edges, so this never actually gets called

describe('selectExercise', () => {
  it('returns the starting exercise unchanged when nothing blocks it', () => {
    const result = selectExercise(library, 1, new Set(), new Set(), noRng)
    expect(result).toEqual({ exerciseId: 1, substitutions: [] })
  })

  it('regresses for missing equipment, one rung at a time', () => {
    // push L3 needs a bench; without one, land on L2 (no requirement).
    const result = selectExercise(library, 3, new Set(), new Set(), noRng)
    expect(result.exerciseId).toBe(2)
    expect(result.substitutions).toEqual([{ from: 3, to: 2, reason: 'equipment' }])
  })

  it('keeps regressing through multiple equipment-gated rungs', () => {
    // push L4 needs a bench too; without one, both L4 and L3 are skipped.
    const result = selectExercise(library, 4, new Set(), new Set(), noRng)
    expect(result.exerciseId).toBe(2)
    expect(result.substitutions).toEqual([
      { from: 4, to: 3, reason: 'equipment' },
      { from: 3, to: 2, reason: 'equipment' },
    ])
  })

  it('does not regress when the owned equipment satisfies the rung', () => {
    const result = selectExercise(library, 4, new Set([1]), new Set(), noRng)
    expect(result).toEqual({ exerciseId: 4, substitutions: [] })
  })

  it('regresses for an avoid-severity contraindication when no lateral exists', () => {
    // push L4 is flagged avoid for wrist. Equipment is satisfied (owns
    // bench), so the substitution is purely for the injury.
    const result = selectExercise(library, 4, new Set([1]), new Set([1]), noRng)
    expect(result.exerciseId).toBe(3)
    expect(result.substitutions).toEqual([{ from: 4, to: 3, reason: 'injury_regression' }])
  })

  it('also regresses for a caution-severity contraindication, not just avoid', () => {
    // pull L3 is flagged caution (not avoid) for shoulder.
    const result = selectExercise(library, 7, new Set([2]), new Set([2]), noRng)
    expect(result.exerciseId).toBe(6)
    expect(result.substitutions).toEqual([{ from: 7, to: 6, reason: 'injury_regression' }])
  })

  it('re-validates after an equipment regression, landing correctly on a second, different problem', () => {
    // L4 is gated on a DIFFERENT item (bar) than any requirement on L3,
    // and L3 is separately flagged for wrist — so the first hop must be
    // for equipment and the second must be for the injury, proving the
    // loop re-checks both gates after every move rather than trusting a
    // single pass (the doc's pseudocode shows one check of each, not a
    // loop).
    const compoundLibrary = buildLibrary({
      patterns: testPatterns,
      exercises: testExercises,
      edges: testEdges,
      equipment: testEquipment,
      exerciseEquipment: [{ exerciseId: 4, equipmentId: 2, alternativeGroup: 0 }],
      contraindications: [{ exerciseId: 3, regionId: 1, severity: 'avoid' }],
    })
    const result = selectExercise(compoundLibrary, 4, new Set(), new Set([1]), noRng)
    expect(result.exerciseId).toBe(2)
    expect(result.substitutions).toEqual([
      { from: 4, to: 3, reason: 'equipment' },
      { from: 3, to: 2, reason: 'injury_regression' },
    ])
  })

  it('returns null when the entire ladder below is contraindicated with no lateral', () => {
    const tinyLibrary = buildLibrary({
      patterns: testPatterns,
      exercises: testExercises,
      edges: testEdges,
      equipment: testEquipment,
      exerciseEquipment: testExerciseEquipment,
      // Flag the FLOOR of the push ladder — nowhere left to regress to.
      contraindications: [{ exerciseId: 1, regionId: 1, severity: 'avoid' }],
    })
    const result = selectExercise(tinyLibrary, 1, new Set(), new Set([1]), noRng)
    expect(result.exerciseId).toBeNull()
  })

  it('returns null when equipment can never be satisfied all the way to the floor', () => {
    // Gate every rung from the start down to and including the floor —
    // regressionOf(1) is null (see library.spec.ts), so this must bottom
    // out at null rather than stopping early at the first ungated rung.
    const allGatedLibrary = buildLibrary({
      patterns: testPatterns,
      exercises: testExercises,
      edges: testEdges,
      equipment: testEquipment,
      exerciseEquipment: [
        { exerciseId: 3, equipmentId: 1, alternativeGroup: 0 },
        { exerciseId: 2, equipmentId: 1, alternativeGroup: 0 },
        { exerciseId: 1, equipmentId: 1, alternativeGroup: 0 },
      ],
      contraindications: [],
    })
    const result = selectExercise(allGatedLibrary, 3, new Set(), new Set(), noRng)
    expect(result.exerciseId).toBeNull()
    expect(result.substitutions).toEqual([
      { from: 3, to: 2, reason: 'equipment' },
      { from: 2, to: 1, reason: 'equipment' },
    ])
  })
})
