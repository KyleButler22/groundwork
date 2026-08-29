import { describe, expect, it } from 'vitest'

import { testMealLibrary, testRecipes } from '@/generators/__fixtures__/testMealLibrary'

import { filterCandidates, filterWithRelaxation, type FilterConstraints } from './filter'

function baseConstraints(overrides: Partial<FilterConstraints> = {}): FilterConstraints {
  return {
    userAllergenIds: new Set(),
    userDietTagIds: new Set(),
    dislikedIngredientIds: new Set(),
    skillCeiling: 3,
    neverServeAgainRecipeIds: new Set(),
    excludedRecipeIds: new Set(),
    ...overrides,
  }
}

describe('filterCandidates', () => {
  it('excludes any recipe containing a user allergen', () => {
    const pool = filterCandidates(testRecipes, testMealLibrary, baseConstraints({ userAllergenIds: new Set([1]) })) // milk
    expect(pool.map((r) => r.id)).not.toContain('oatmeal')
    expect(pool.map((r) => r.id)).not.toContain('yogurt-bowl')
  })

  it('excludes a recipe missing a required diet tag', () => {
    const pool = filterCandidates(testRecipes, testMealLibrary, baseConstraints({ userDietTagIds: new Set([2]) })) // vegan
    expect(pool.map((r) => r.id)).toEqual(['tofu-stir-fry', 'apple-slices'])
  })

  it('excludes a recipe containing a disliked ingredient', () => {
    const pool = filterCandidates(testRecipes, testMealLibrary, baseConstraints({ dislikedIngredientIds: new Set(['beef']) }))
    expect(pool.map((r) => r.id)).not.toContain('beef-and-rice')
  })

  it('excludes a recipe above the skill ceiling', () => {
    const pool = filterCandidates(testRecipes, testMealLibrary, baseConstraints({ skillCeiling: 1 }))
    expect(pool.map((r) => r.id)).not.toContain('peanut-chicken') // difficulty 2
  })

  it('excludes a "never" rated recipe', () => {
    const pool = filterCandidates(testRecipes, testMealLibrary, baseConstraints({ neverServeAgainRecipeIds: new Set(['beef-and-rice']) }))
    expect(pool.map((r) => r.id)).not.toContain('beef-and-rice')
  })

  it('excludes this run\'s own exclusion set', () => {
    const pool = filterCandidates(testRecipes, testMealLibrary, baseConstraints({ excludedRecipeIds: new Set(['chicken-stir-fry']) }))
    expect(pool.map((r) => r.id)).not.toContain('chicken-stir-fry')
  })
})

describe('filterWithRelaxation', () => {
  it('applies no relaxation when the unrelaxed pool already clears the threshold', () => {
    const result = filterWithRelaxation(testRecipes, testMealLibrary, baseConstraints(), 1) // threshold = 3, pool of 10 clears it
    expect(result.relaxationsApplied).toEqual([])
    expect(result.pool).toHaveLength(10)
  })

  it('drops the exclusion set first when the pool is too thin', () => {
    // Exclude everything except one recipe; needing e.g. 2 (threshold 6) forces relaxation.
    const excludedRecipeIds = new Set(testRecipes.filter((r) => r.id !== 'chicken-stir-fry').map((r) => r.id))
    const result = filterWithRelaxation(testRecipes, testMealLibrary, baseConstraints({ excludedRecipeIds }), 2)
    expect(result.relaxationsApplied).toEqual(['dropped_exclusions'])
    expect(result.pool.length).toBe(10)
  })

  it('never relaxes allergens or diet tags, no matter how thin the pool gets', () => {
    const result = filterWithRelaxation(
      testRecipes,
      testMealLibrary,
      baseConstraints({ userAllergenIds: new Set([1, 2, 3, 4]), userDietTagIds: new Set([2]), excludedRecipeIds: new Set(testRecipes.map((r) => r.id)) }),
      100, // impossibly high threshold — every relaxation step will be attempted
    )
    for (const recipe of result.pool) {
      expect(testMealLibrary.allergensByRecipe.get(recipe.id)!.has(1)).toBe(false)
      expect(testMealLibrary.dietTagsByRecipe.get(recipe.id)?.has(2)).toBe(true)
    }
  })

  it('reports every relaxation actually reflected in the final pool, in doc order', () => {
    const result = filterWithRelaxation(
      testRecipes,
      testMealLibrary,
      baseConstraints({ excludedRecipeIds: new Set(['chicken-stir-fry']), skillCeiling: 1, dislikedIngredientIds: new Set(['beef']) }),
      100,
    )
    expect(result.relaxationsApplied).toEqual(['dropped_exclusions', 'relaxed_difficulty_cap', 'ignored_dislikes'])
  })

  it('does not report a relaxation step that had nothing to relax', () => {
    // No exclusions and no dislikes to begin with — only the difficulty cap is meaningfully relaxed.
    const result = filterWithRelaxation(testRecipes, testMealLibrary, baseConstraints({ skillCeiling: 1 }), 100)
    expect(result.relaxationsApplied).toEqual(['relaxed_difficulty_cap'])
  })
})
