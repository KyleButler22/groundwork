import { describe, expect, it } from 'vitest'

import {
  testContraindications,
  testEdges,
  testEquipment,
  testExerciseEquipment,
  testExercises,
  testPatterns,
} from '@/generators/__fixtures__/testLibrary'

import { buildLibrary, canPerform, contraindicated, lateralOf, promotionOf, regressionOf } from './library'

const library = buildLibrary({
  patterns: testPatterns,
  exercises: testExercises,
  edges: testEdges,
  equipment: testEquipment,
  exerciseEquipment: testExerciseEquipment,
  contraindications: testContraindications,
})

describe('buildLibrary', () => {
  it('sorts each pattern exercises by level ascending', () => {
    const push = library.exercisesByPattern.get(1)!
    expect(push.map((e) => e.slug)).toEqual(['test_push_1', 'test_push_2', 'test_push_3', 'test_push_4'])
  })
})

describe('canPerform', () => {
  it('is true with no equipment requirement at all', () => {
    expect(canPerform(library, 1, new Set())).toBe(true) // push L1, no requirement
  })

  it('is false when a required single (group 0) item is missing', () => {
    expect(canPerform(library, 3, new Set())).toBe(false) // push L3 needs bench
    expect(canPerform(library, 3, new Set([1]))).toBe(true) // owns bench
  })

  it('requires EVERY group-0 row, not just one', () => {
    // pull L2 needs bar only, but this asserts group-0 rows across
    // different exercises are each independently required — see the
    // alternative-group semantics comment in library.ts.
    expect(canPerform(library, 6, new Set([1]))).toBe(false) // owns bench, not bar
    expect(canPerform(library, 6, new Set([2]))).toBe(true) // owns bar
  })

  it('an alternative group (non-zero) is satisfied by ANY ONE member', () => {
    expect(canPerform(library, 9, new Set())).toBe(false) // core L2 needs bench OR bar
    expect(canPerform(library, 9, new Set([1]))).toBe(true) // bench alone is enough
    expect(canPerform(library, 9, new Set([2]))).toBe(true) // bar alone is enough
  })
})

describe('contraindicated', () => {
  it('excludes on an "avoid" severity', () => {
    expect(contraindicated(library, 4, new Set([1]))).toBe(true) // push L4 vs wrist
    expect(contraindicated(library, 4, new Set([2]))).toBe(false) // shoulder not flagged
  })

  it('excludes on a "caution" severity too — not just "avoid"', () => {
    // This is the load-bearing assertion for the interpretation documented
    // in library.ts: a warning-only exclusion would be the exact pattern
    // docs/schema.md rejects for the equivalent allergen case.
    expect(contraindicated(library, 7, new Set([2]))).toBe(true) // pull L3 vs shoulder, caution
  })

  it('is false when nothing is flagged', () => {
    expect(contraindicated(library, 4, new Set())).toBe(false)
  })
})

describe('regressionOf', () => {
  it('steps back one rung via the reverse of a progression edge', () => {
    expect(regressionOf(library, 4)).toBe(3)
    expect(regressionOf(library, 3)).toBe(2)
    expect(regressionOf(library, 2)).toBe(1)
  })

  it('returns null at the floor of a ladder', () => {
    expect(regressionOf(library, 1)).toBeNull()
  })
})

describe('promotionOf', () => {
  it('steps forward one rung when there is exactly one outgoing edge', () => {
    expect(promotionOf(library, 1)).toEqual({ exerciseId: 2, ambiguous: false })
  })

  it('reports no target at the ceiling of a ladder, without ambiguity', () => {
    expect(promotionOf(library, 4)).toEqual({ exerciseId: null, ambiguous: false })
    expect(promotionOf(library, 7)).toEqual({ exerciseId: null, ambiguous: false })
    expect(promotionOf(library, 9)).toEqual({ exerciseId: null, ambiguous: false })
  })
})

describe('lateralOf', () => {
  it('returns null when no lateral edges exist (true of the whole fixture, and of the real seed data today)', () => {
    const rng = () => 0.5
    for (const e of testExercises) {
      expect(lateralOf(library, e.id, rng)).toBeNull()
    }
  })
})
