import { describe, expect, it } from 'vitest'

import { testMealLibrary } from '@/generators/__fixtures__/testMealLibrary'
import type { MealPlanEntry } from '@/types/domain'

import { validateMealPlan, type ValidationInput } from './validate'

const WEEK_STARTS_ON = '2026-08-31'

function entry(overrides: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'slot' | 'recipeId'>): MealPlanEntry {
  return {
    id: `${overrides.slot}-${overrides.recipeId}`,
    mealPlanId: 'draft-plan',
    serveOn: WEEK_STARTS_ON,
    servings: 1,
    isLocked: false,
    leftoverOfId: null,
    updatedAt: '',
    ...overrides,
  }
}

function baseInput(overrides: Partial<ValidationInput> = {}): ValidationInput {
  return {
    entries: [],
    library: testMealLibrary,
    userAllergenIds: new Set(),
    userDietTagIds: new Set(),
    householdSize: 1,
    activeSlots: [],
    weekStartsOn: WEEK_STARTS_ON,
    ...overrides,
  }
}

describe('validateMealPlan', () => {
  it('flags a recipe containing a user allergen', () => {
    const violations = validateMealPlan(baseInput({ entries: [entry({ slot: 'breakfast', recipeId: 'oatmeal' })], userAllergenIds: new Set([1]) }))
    expect(violations.map((v) => v.code)).toContain('allergen_violation')
  })

  it('does not flag a safe recipe', () => {
    const violations = validateMealPlan(baseInput({ entries: [entry({ slot: 'snack', recipeId: 'apple-slices' })], userAllergenIds: new Set([1, 2, 3, 4]) }))
    expect(violations.map((v) => v.code)).not.toContain('allergen_violation')
  })

  it('flags a recipe missing a required diet tag', () => {
    const violations = validateMealPlan(baseInput({ entries: [entry({ slot: 'dinner', recipeId: 'beef-and-rice' })], userDietTagIds: new Set([2]) })) // vegan
    expect(violations.map((v) => v.code)).toContain('diet_violation')
  })

  it('flags a duplicate (serve_on, slot) pair', () => {
    const violations = validateMealPlan(
      baseInput({
        entries: [entry({ slot: 'dinner', recipeId: 'chicken-stir-fry' }), entry({ slot: 'dinner', recipeId: 'beef-and-rice', id: 'dinner-2' })],
      }),
    )
    expect(violations.map((v) => v.code)).toContain('duplicate_slot')
  })

  it('flags an out-of-range serving count on a non-leftover entry', () => {
    const violations = validateMealPlan(baseInput({ entries: [entry({ slot: 'dinner', recipeId: 'chicken-stir-fry', servings: 5 })], householdSize: 1 }))
    expect(violations.map((v) => v.code)).toContain('servings_out_of_range')
  })

  it('does not apply the servings range check to a leftover entry', () => {
    const violations = validateMealPlan(
      baseInput({ entries: [entry({ slot: 'dinner', recipeId: 'chicken-stir-fry', servings: 5, leftoverOfId: 'some-parent' })] }),
    )
    expect(violations.map((v) => v.code)).not.toContain('servings_out_of_range')
  })

  it('flags a leftover entry whose parent is not in the plan', () => {
    const violations = validateMealPlan(baseInput({ entries: [entry({ slot: 'dinner', recipeId: 'chicken-stir-fry', leftoverOfId: 'missing-parent' })] }))
    expect(violations.map((v) => v.code)).toContain('leftover_orphan')
  })

  it('does not flag a leftover whose parent IS in the plan', () => {
    const parent = entry({ slot: 'dinner', recipeId: 'chicken-stir-fry', id: 'parent-1', serveOn: WEEK_STARTS_ON })
    const leftover = entry({ slot: 'dinner', recipeId: 'chicken-stir-fry', leftoverOfId: 'parent-1', serveOn: '2026-09-01', id: 'child-1' })
    const violations = validateMealPlan(baseInput({ entries: [parent, leftover] }))
    expect(violations.map((v) => v.code)).not.toContain('leftover_orphan')
  })

  it('flags a missing entry for an active slot', () => {
    const violations = validateMealPlan(baseInput({ entries: [], activeSlots: ['dinner'] }))
    // 7 days x 1 active slot, none filled.
    expect(violations.filter((v) => v.code === 'missing_slot')).toHaveLength(7)
  })

  it('is clean for a fully-filled, constraint-satisfying single-day plan', () => {
    const violations = validateMealPlan(
      baseInput({
        entries: [entry({ slot: 'dinner', recipeId: 'tofu-stir-fry' })],
        userAllergenIds: new Set([1, 2, 3]), // milk, egg, peanut — tofu-stir-fry has none of these
        userDietTagIds: new Set([2]), // vegan — tofu-stir-fry is tagged vegan
        activeSlots: [],
      }),
    )
    expect(violations).toEqual([])
  })
})
