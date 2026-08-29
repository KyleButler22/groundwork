import { describe, expect, it } from 'vitest'

import { testMealLibrary } from '@/generators/__fixtures__/testMealLibrary'

import { hasAllergen, hasDislikedIngredient, satisfiesDiet } from './library'

describe('buildMealLibrary', () => {
  it('indexes ingredient lines per recipe, sorted by order_index', () => {
    const lines = testMealLibrary.ingredientsByRecipe.get('chicken-stir-fry')!
    expect(lines.map((l) => l.ingredientId)).toEqual(['chicken', 'broccoli', 'soy_sauce', 'rice'])
  })

  it('derives a recipe\'s allergens upward from its ingredients', () => {
    // egg-fried-rice contains egg (allergen 2) and soy_sauce (allergen 4).
    expect(testMealLibrary.allergensByRecipe.get('egg-fried-rice')).toEqual(new Set([2, 4]))
    // chicken-salad has none of the 4 test allergens.
    expect(testMealLibrary.allergensByRecipe.get('chicken-salad')).toEqual(new Set())
  })

  it('separates non-staple ingredients from pantry staples per recipe', () => {
    // chicken-stir-fry: chicken + broccoli are non-staple; soy_sauce + rice are staples.
    expect(testMealLibrary.nonStapleIngredientIdsByRecipe.get('chicken-stir-fry')).toEqual(new Set(['chicken', 'broccoli']))
    // beef-and-rice: only beef is non-staple (rice, salt are staples) — deliberately just 1.
    expect(testMealLibrary.nonStapleIngredientIdsByRecipe.get('beef-and-rice')).toEqual(new Set(['beef']))
  })

  it('indexes meal slots and diet tags per recipe', () => {
    expect(testMealLibrary.mealSlotsByRecipe.get('apple-slices')).toEqual(new Set(['snack']))
    expect(testMealLibrary.dietTagsByRecipe.get('tofu-stir-fry')).toEqual(new Set([1, 2, 3]))
  })
})

describe('hasAllergen', () => {
  it('is true when the recipe contains any user allergen', () => {
    expect(hasAllergen(testMealLibrary, 'oatmeal', new Set([1]))).toBe(true) // milk
    expect(hasAllergen(testMealLibrary, 'oatmeal', new Set([2]))).toBe(false) // egg
  })

  it('is false for an empty allergen set (no allergens declared)', () => {
    expect(hasAllergen(testMealLibrary, 'oatmeal', new Set())).toBe(false)
  })

  it('catches an allergen carried by a PANTRY-STAPLE ingredient (soy sauce), not just perishables', () => {
    expect(hasAllergen(testMealLibrary, 'chicken-stir-fry', new Set([4]))).toBe(true) // soy, via soy_sauce
  })
})

describe('satisfiesDiet', () => {
  it('requires every selected diet tag to be present, not merely not-contradicted', () => {
    // egg-fried-rice is tagged vegetarian(1) but not gluten_free(3).
    expect(satisfiesDiet(testMealLibrary, 'egg-fried-rice', new Set([1]))).toBe(true)
    expect(satisfiesDiet(testMealLibrary, 'egg-fried-rice', new Set([1, 3]))).toBe(false)
  })

  it('is true for an empty requirement set', () => {
    expect(satisfiesDiet(testMealLibrary, 'beef-and-rice', new Set())).toBe(true)
  })
})

describe('hasDislikedIngredient', () => {
  it('is true when any ingredient line matches a disliked ingredient', () => {
    expect(hasDislikedIngredient(testMealLibrary, 'tofu-stir-fry', new Set(['tofu']))).toBe(true)
    expect(hasDislikedIngredient(testMealLibrary, 'tofu-stir-fry', new Set(['beef']))).toBe(false)
  })
})
