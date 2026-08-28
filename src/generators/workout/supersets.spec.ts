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
import { canPair, pairForSuperset, type SupersetCandidate } from './supersets'

const library = buildLibrary({
  patterns: testPatterns,
  exercises: testExercises,
  edges: testEdges,
  equipment: testEquipment,
  exerciseEquipment: testExerciseEquipment,
  contraindications: testContraindications,
})

const push1: SupersetCandidate = { slotId: 'push', patternId: 1, exerciseId: 1 } // no equipment
const pull1: SupersetCandidate = { slotId: 'pull', patternId: 2, exerciseId: 5 } // no equipment
const core1: SupersetCandidate = { slotId: 'core', patternId: 3, exerciseId: 8 } // no equipment
const skill1: SupersetCandidate = { slotId: 'skill', patternId: 4, exerciseId: 10 }
const push2: SupersetCandidate = { slotId: 'push2', patternId: 1, exerciseId: 2 } // same category as push1

describe('canPair', () => {
  it('allows different-category pairs (antagonistic or unrelated)', () => {
    expect(canPair(library, push1, pull1)).toBe(true)
    expect(canPair(library, push1, core1)).toBe(true)
    expect(canPair(library, pull1, core1)).toBe(true)
  })

  it('blocks two patterns from the SAME category', () => {
    expect(canPair(library, push1, push2)).toBe(false)
  })

  it('never pairs the skill category with anything, even a different category', () => {
    expect(canPair(library, skill1, push1)).toBe(false)
    expect(canPair(library, skill1, pull1)).toBe(false)
  })

  it('blocks a pair once either exercise is level 7 or above', () => {
    const hardPush: SupersetCandidate = { slotId: 'hardpush', patternId: 1, exerciseId: 9999 }
    const libraryWithHardExercise = buildLibrary({
      patterns: testPatterns,
      exercises: [...testExercises, { ...testExercises[0], id: 9999, slug: 'hard', level: 7 }],
      edges: testEdges,
      equipment: testEquipment,
      exerciseEquipment: testExerciseEquipment,
      contraindications: testContraindications,
    })
    expect(canPair(libraryWithHardExercise, hardPush, pull1)).toBe(false)
  })

  it('is co-locatable when neither needs equipment', () => {
    expect(canPair(library, push1, pull1)).toBe(true) // both id 1 and 5 are unequipped
  })

  it('is co-locatable when both need the SAME equipment', () => {
    const bothNeedBar: SupersetCandidate[] = [
      { slotId: 'a', patternId: 2, exerciseId: 6 }, // pull L2, needs bar
      { slotId: 'b', patternId: 3, exerciseId: 8 },
    ]
    // core (id 8) needs nothing, so this only really tests the "one side
    // unequipped" branch again — construct a same-bar pair explicitly.
    const sameBarLibrary = buildLibrary({
      patterns: testPatterns,
      exercises: testExercises,
      edges: testEdges,
      equipment: testEquipment,
      exerciseEquipment: [
        { exerciseId: 6, equipmentId: 2, alternativeGroup: 0 },
        { exerciseId: 8, equipmentId: 2, alternativeGroup: 0 }, // core "borrows" the bar too, for this test
      ],
      contraindications: [],
    })
    expect(canPair(sameBarLibrary, bothNeedBar[0], bothNeedBar[1])).toBe(true)
  })

  it('is NOT co-locatable when both need equipment but share none', () => {
    const disjointLibrary = buildLibrary({
      patterns: testPatterns,
      exercises: testExercises,
      edges: testEdges,
      equipment: testEquipment,
      exerciseEquipment: [
        { exerciseId: 6, equipmentId: 2, alternativeGroup: 0 }, // pull needs bar
        { exerciseId: 8, equipmentId: 1, alternativeGroup: 0 }, // core needs bench
      ],
      contraindications: [],
    })
    const pull2: SupersetCandidate = { slotId: 'pull2', patternId: 2, exerciseId: 6 }
    expect(canPair(disjointLibrary, pull2, core1)).toBe(false)
  })
})

describe('pairForSuperset', () => {
  it('pairs compatible candidates and leaves the rest unpaired', () => {
    const result = pairForSuperset(library, [push1, pull1, core1, skill1])
    expect(result.pairs).toHaveLength(1)
    expect(result.pairs[0]).toEqual({ a: push1, b: pull1 })
    // core1 has nobody left to pair with once push/pull are taken; skill
    // never pairs with anything.
    expect(result.unpaired.map((c) => c.slotId).sort()).toEqual(['core', 'skill'])
  })

  it('pairs everyone when the list divides evenly into compatible pairs', () => {
    const result = pairForSuperset(library, [push1, pull1])
    expect(result.pairs).toHaveLength(1)
    expect(result.unpaired).toHaveLength(0)
  })

  it('pairs nobody when nothing is compatible', () => {
    const result = pairForSuperset(library, [push1, push2])
    expect(result.pairs).toHaveLength(0)
    expect(result.unpaired).toEqual([push1, push2])
  })

  it('is a no-op on an empty or single-item list', () => {
    expect(pairForSuperset(library, [])).toEqual({ pairs: [], unpaired: [] })
    expect(pairForSuperset(library, [push1])).toEqual({ pairs: [], unpaired: [push1] })
  })
})
