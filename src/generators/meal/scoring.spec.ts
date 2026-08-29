import { describe, expect, it } from 'vitest'

import { testMealLibrary } from '@/generators/__fixtures__/testMealLibrary'
import type { UserRecipeFeedback } from '@/types/domain'

import {
  bestAchievableScale,
  DEFAULT_WEIGHTS,
  macroFit,
  meetsVarietyFloor,
  newIngredientCount,
  overlapValue,
  pickBestScored,
  preferenceScore,
  recency,
  scoreCandidate,
  SERVING_SCALE_MAX,
  SERVING_SCALE_MIN,
  VARIETY_FLOOR,
} from './scoring'

describe('bestAchievableScale', () => {
  it('is 1 when the recipe already matches the target exactly', () => {
    expect(bestAchievableScale(500, 500)).toBe(1)
  })

  it('clamps to the 0.75-1.5x range', () => {
    expect(bestAchievableScale(1000, 100)).toBe(SERVING_SCALE_MIN) // would need 0.1x, clamped up
    expect(bestAchievableScale(100, 1000)).toBe(SERVING_SCALE_MAX) // would need 10x, clamped down
  })
})

describe('macroFit', () => {
  it('is 1 for a perfect match', () => {
    expect(macroFit(500, 40, 500, 40)).toBe(1)
  })

  it('weights protein error double kcal error, per docs/mealgen.md §4', () => {
    // 10% kcal error alone: d = 0.5*0.1 = 0.05 -> fit = 0.95
    expect(macroFit(550, 40, 500, 40)).toBeCloseTo(0.95, 6)
    // 10% protein error alone: d = 1.0*0.1 = 0.1 -> fit = 0.90 (double the kcal case)
    expect(macroFit(500, 44, 500, 40)).toBeCloseTo(0.9, 6)
  })

  it('never goes below 0', () => {
    expect(macroFit(5000, 400, 500, 40)).toBe(0)
  })
})

describe('overlapValue / newIngredientCount / meetsVarietyFloor', () => {
  it('is 0 when nothing is planned yet', () => {
    expect(overlapValue(testMealLibrary, 'chicken-stir-fry', new Set())).toBe(0)
  })

  it('counts a shared non-staple ingredient, normalised by the recipe\'s total ingredient count', () => {
    // peanut-chicken shares 'chicken' with what's already planned; it has 3 ingredient lines total.
    expect(overlapValue(testMealLibrary, 'peanut-chicken', new Set(['chicken']))).toBeCloseTo(1 / 3, 6)
  })

  it('a shared PANTRY-STAPLE ingredient contributes nothing to overlap value', () => {
    // rice is a staple; sharing only rice should score the same as sharing nothing.
    expect(overlapValue(testMealLibrary, 'beef-and-rice', new Set(['rice']))).toBe(0)
  })

  it('newIngredientCount only counts non-staple ingredients not already planned', () => {
    expect(newIngredientCount(testMealLibrary, 'chicken-stir-fry', new Set())).toBe(2) // chicken + broccoli
    expect(newIngredientCount(testMealLibrary, 'chicken-stir-fry', new Set(['chicken']))).toBe(1) // only broccoli is new
  })

  it('meetsVarietyFloor uses the default floor of 2 unless overridden', () => {
    expect(VARIETY_FLOOR).toBe(2)
    expect(meetsVarietyFloor(testMealLibrary, 'chicken-stir-fry', new Set())).toBe(true) // 2 new, floor 2
    expect(meetsVarietyFloor(testMealLibrary, 'beef-and-rice', new Set())).toBe(false) // only 1 non-staple ingredient total
    expect(meetsVarietyFloor(testMealLibrary, 'beef-and-rice', new Set(), 0)).toBe(true) // floor 0 always passes
  })
})

describe('recency', () => {
  it('is 0 (no penalty) when never served', () => {
    expect(recency(null, '2026-09-01')).toBe(0)
  })

  it('decays with an ~21-day time constant', () => {
    expect(recency('2026-08-11', '2026-09-01')).toBeCloseTo(Math.exp(-21 / 21), 6) // exactly 21 days back
  })

  it('is close to 1 for something served yesterday', () => {
    expect(recency('2026-08-31', '2026-09-01')).toBeCloseTo(Math.exp(-1 / 21), 6)
  })

  it('does not reward a future-dated lastServedOn (defensive)', () => {
    expect(recency('2026-09-05', '2026-09-01')).toBe(0)
  })
})

describe('preferenceScore', () => {
  it('rewards only "loved"', () => {
    expect(preferenceScore('loved')).toBe(1)
    expect(preferenceScore('ok')).toBe(0)
    expect(preferenceScore(null)).toBe(0)
    expect(preferenceScore(undefined)).toBe(0)
  })
})

describe('scoreCandidate', () => {
  const recipe = testMealLibrary.recipeById.get('chicken-stir-fry')!

  it('scores higher for a recipe rated "loved"', () => {
    const feedback: UserRecipeFeedback = { userId: 'u1', recipeId: recipe.id, rating: 'loved', lastServedOn: null, serveCount: 1, updatedAt: '2026-01-01' }
    const base = scoreCandidate(recipe, {
      library: testMealLibrary,
      targetKcal: 500,
      targetProteinG: 40,
      plannedNonStaple: new Set(),
      usedThisWeek: new Set(),
      feedbackByRecipeId: new Map(),
      referenceDate: '2026-09-01',
      weights: DEFAULT_WEIGHTS,
    })
    const loved = scoreCandidate(recipe, {
      library: testMealLibrary,
      targetKcal: 500,
      targetProteinG: 40,
      plannedNonStaple: new Set(),
      usedThisWeek: new Set(),
      feedbackByRecipeId: new Map([[recipe.id, feedback]]),
      referenceDate: '2026-09-01',
      weights: DEFAULT_WEIGHTS,
    })
    expect(loved).toBeGreaterThan(base)
  })

  it('scores lower when already used this week (repeat penalty)', () => {
    const notUsed = scoreCandidate(recipe, {
      library: testMealLibrary,
      targetKcal: 500,
      targetProteinG: 40,
      plannedNonStaple: new Set(),
      usedThisWeek: new Set(),
      feedbackByRecipeId: new Map(),
      referenceDate: '2026-09-01',
      weights: DEFAULT_WEIGHTS,
    })
    const alreadyUsed = scoreCandidate(recipe, {
      library: testMealLibrary,
      targetKcal: 500,
      targetProteinG: 40,
      plannedNonStaple: new Set(),
      usedThisWeek: new Set([recipe.id]),
      feedbackByRecipeId: new Map(),
      referenceDate: '2026-09-01',
      weights: DEFAULT_WEIGHTS,
    })
    expect(alreadyUsed).toBeLessThan(notUsed)
  })
})

describe('pickBestScored', () => {
  it('picks the single highest scorer when there is no tie', () => {
    const scores: Record<string, number> = { a: 1, b: 3, c: 2 }
    const picked = pickBestScored(['a', 'b', 'c'], (x) => scores[x], () => 0.999)
    expect(picked).toBe('b')
  })

  it('breaks a true tie deterministically via rng, not always array order', () => {
    const candidates = ['a', 'b', 'c']
    const score = () => 1 // every candidate ties
    expect(pickBestScored(candidates, score, () => 0)).toBe('a')
    expect(pickBestScored(candidates, score, () => 0.999)).toBe('c')
  })
})
