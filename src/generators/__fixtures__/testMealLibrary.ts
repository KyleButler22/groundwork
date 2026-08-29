import type { Ingredient, IngredientAllergen, Recipe, RecipeDietTag, RecipeIngredient, RecipeMealSlot } from '@/types/domain'
import { buildMealLibrary, type MealLibrary } from '@/generators/meal/library'

/**
 * A small, deliberately synthetic recipe corpus for unit tests — NOT a
 * copy of the real 200-recipe corpus. Chosen to exercise every real
 * branch in the meal generator in as few recipes as possible:
 *
 *   5 dinners, deliberately uneven non-staple ingredient counts —
 *     chicken-stir-fry/tofu-stir-fry/peanut-chicken have 2 each (can
 *     independently satisfy the variety floor of 2); beef-and-rice/
 *     egg-fried-rice have only 1 (can NEVER independently satisfy it,
 *     exercising the floor-relaxation fallback)
 *   1 lunch, 3 breakfasts (exactly BREAKFAST_ROTATION_SIZE, so the
 *     rotation logic is exercised without slack), 1 snack
 *   4 allergens spread across 5 recipes (milk, egg, peanut, soy — soy via
 *     a pantry-staple ingredient, proving allergens aren't filtered by
 *     staple/perishable status)
 *   1 ingredient (rice) reused across most dinners as a pantry staple, so
 *     overlapValue has something real to reward
 *
 * For confidence against the REAL 200-recipe corpus, see
 * generateMealPlan.integration.spec.ts instead.
 */

export const testIngredients: Ingredient[] = [
  { id: 'chicken', slug: 'chicken', name: 'Chicken', aisleId: 1, densityGPerMl: null, gramsPerEach: null, kcalPer100g: 165, proteinPer100g: 31, carbPer100g: 0, fatPer100g: 3.6, fiberPer100g: 0, fdcId: null, isPantryStaple: false, isActive: true },
  { id: 'beef', slug: 'beef', name: 'Beef', aisleId: 1, densityGPerMl: null, gramsPerEach: null, kcalPer100g: 250, proteinPer100g: 26, carbPer100g: 0, fatPer100g: 15, fiberPer100g: 0, fdcId: null, isPantryStaple: false, isActive: true },
  { id: 'tofu', slug: 'tofu', name: 'Tofu', aisleId: 1, densityGPerMl: null, gramsPerEach: null, kcalPer100g: 76, proteinPer100g: 8, carbPer100g: 1.9, fatPer100g: 4.8, fiberPer100g: 0.3, fdcId: null, isPantryStaple: false, isActive: true },
  { id: 'egg', slug: 'egg', name: 'Egg', aisleId: 1, densityGPerMl: null, gramsPerEach: 50, kcalPer100g: 155, proteinPer100g: 13, carbPer100g: 1.1, fatPer100g: 11, fiberPer100g: 0, fdcId: null, isPantryStaple: false, isActive: true },
  { id: 'broccoli', slug: 'broccoli', name: 'Broccoli', aisleId: 2, densityGPerMl: null, gramsPerEach: null, kcalPer100g: 34, proteinPer100g: 2.8, carbPer100g: 7, fatPer100g: 0.4, fiberPer100g: 2.6, fdcId: null, isPantryStaple: false, isActive: true },
  { id: 'peanuts', slug: 'peanuts', name: 'Peanuts', aisleId: 2, densityGPerMl: null, gramsPerEach: null, kcalPer100g: 567, proteinPer100g: 26, carbPer100g: 16, fatPer100g: 49, fiberPer100g: 8.5, fdcId: null, isPantryStaple: false, isActive: true },
  { id: 'milk', slug: 'milk', name: 'Milk', aisleId: 3, densityGPerMl: 1.03, gramsPerEach: null, kcalPer100g: 42, proteinPer100g: 3.4, carbPer100g: 5, fatPer100g: 1, fiberPer100g: 0, fdcId: null, isPantryStaple: false, isActive: true },
  { id: 'rice', slug: 'rice', name: 'Rice', aisleId: 5, densityGPerMl: null, gramsPerEach: null, kcalPer100g: 130, proteinPer100g: 2.7, carbPer100g: 28, fatPer100g: 0.3, fiberPer100g: 0.4, fdcId: null, isPantryStaple: true, isActive: true },
  { id: 'soy_sauce', slug: 'soy_sauce', name: 'Soy sauce', aisleId: 7, densityGPerMl: 1.03, gramsPerEach: null, kcalPer100g: 53, proteinPer100g: 8.1, carbPer100g: 4.9, fatPer100g: 0.6, fiberPer100g: 0.8, fdcId: null, isPantryStaple: true, isActive: true },
  { id: 'salt', slug: 'salt', name: 'Salt', aisleId: 8, densityGPerMl: 1.2, gramsPerEach: null, kcalPer100g: 0, proteinPer100g: 0, carbPer100g: 0, fatPer100g: 0, fiberPer100g: 0, fdcId: null, isPantryStaple: true, isActive: true },
]

// Allergen ids: 1=milk, 2=egg, 3=peanut, 4=soy
export const testIngredientAllergens: IngredientAllergen[] = [
  { ingredientId: 'milk', allergenId: 1 },
  { ingredientId: 'egg', allergenId: 2 },
  { ingredientId: 'peanuts', allergenId: 3 },
  { ingredientId: 'soy_sauce', allergenId: 4 },
]

// Diet tag ids: 1=vegetarian, 2=vegan, 3=gluten_free
function recipe(partial: Pick<Recipe, 'id' | 'title' | 'servings' | 'kcalPerServing' | 'proteinPerServing' | 'difficulty'> & Partial<Recipe>): Recipe {
  return {
    slug: partial.id,
    summary: null,
    prepMinutes: 10,
    cookMinutes: 15,
    cuisine: 'Test',
    imageUrl: null,
    carbPerServing: 20,
    fatPerServing: 10,
    isActive: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

export const testRecipes: Recipe[] = [
  recipe({ id: 'chicken-stir-fry', title: 'Chicken Stir Fry', servings: 2, kcalPerServing: 500, proteinPerServing: 40, difficulty: 1, prepMinutes: 10, cookMinutes: 15 }),
  recipe({ id: 'beef-and-rice', title: 'Beef and Rice', servings: 2, kcalPerServing: 600, proteinPerServing: 45, difficulty: 1, prepMinutes: 10, cookMinutes: 20 }),
  recipe({ id: 'tofu-stir-fry', title: 'Tofu Stir Fry', servings: 2, kcalPerServing: 450, proteinPerServing: 25, difficulty: 1, prepMinutes: 10, cookMinutes: 15 }),
  recipe({ id: 'peanut-chicken', title: 'Peanut Chicken', servings: 2, kcalPerServing: 550, proteinPerServing: 42, difficulty: 2, prepMinutes: 15, cookMinutes: 20 }),
  recipe({ id: 'egg-fried-rice', title: 'Egg Fried Rice', servings: 2, kcalPerServing: 400, proteinPerServing: 18, difficulty: 1, prepMinutes: 10, cookMinutes: 55 }), // deliberately over most weeknight ceilings
  recipe({ id: 'chicken-salad', title: 'Chicken Salad', servings: 1, kcalPerServing: 350, proteinPerServing: 30, difficulty: 1, prepMinutes: 10, cookMinutes: 0 }),
  recipe({ id: 'oatmeal', title: 'Oatmeal', servings: 1, kcalPerServing: 300, proteinPerServing: 12, difficulty: 1, prepMinutes: 5, cookMinutes: 5 }),
  recipe({ id: 'eggs-and-toast', title: 'Eggs and Toast', servings: 1, kcalPerServing: 280, proteinPerServing: 16, difficulty: 1, prepMinutes: 5, cookMinutes: 5 }),
  recipe({ id: 'yogurt-bowl', title: 'Yogurt Bowl', servings: 1, kcalPerServing: 250, proteinPerServing: 14, difficulty: 1, prepMinutes: 5, cookMinutes: 0 }),
  recipe({ id: 'apple-slices', title: 'Apple Slices', servings: 1, kcalPerServing: 100, proteinPerServing: 1, difficulty: 1, prepMinutes: 2, cookMinutes: 0 }),
]

function ingLine(recipeId: string, ingredientId: string, orderIndex: number): RecipeIngredient {
  return { id: `${recipeId}::${orderIndex}`, recipeId, ingredientId, quantity: 100, unitId: 1, prepNote: null, isOptional: false, orderIndex }
}

export const testRecipeIngredients: RecipeIngredient[] = [
  ingLine('chicken-stir-fry', 'chicken', 0),
  ingLine('chicken-stir-fry', 'broccoli', 1),
  ingLine('chicken-stir-fry', 'soy_sauce', 2),
  ingLine('chicken-stir-fry', 'rice', 3),

  ingLine('beef-and-rice', 'beef', 0),
  ingLine('beef-and-rice', 'rice', 1),
  ingLine('beef-and-rice', 'salt', 2),

  ingLine('tofu-stir-fry', 'tofu', 0),
  ingLine('tofu-stir-fry', 'broccoli', 1),
  ingLine('tofu-stir-fry', 'soy_sauce', 2),
  ingLine('tofu-stir-fry', 'rice', 3),

  ingLine('peanut-chicken', 'chicken', 0),
  ingLine('peanut-chicken', 'peanuts', 1),
  ingLine('peanut-chicken', 'rice', 2),

  ingLine('egg-fried-rice', 'egg', 0),
  ingLine('egg-fried-rice', 'rice', 1),
  ingLine('egg-fried-rice', 'soy_sauce', 2),

  ingLine('chicken-salad', 'chicken', 0),
  ingLine('chicken-salad', 'broccoli', 1),
  ingLine('chicken-salad', 'salt', 2),

  ingLine('oatmeal', 'milk', 0),
  ingLine('oatmeal', 'salt', 1),

  ingLine('eggs-and-toast', 'egg', 0),
  ingLine('eggs-and-toast', 'salt', 1),

  ingLine('yogurt-bowl', 'milk', 0),
  ingLine('yogurt-bowl', 'salt', 1),

  ingLine('apple-slices', 'salt', 0),
]

export const testRecipeMealSlots: RecipeMealSlot[] = [
  { recipeId: 'chicken-stir-fry', slot: 'dinner' },
  { recipeId: 'beef-and-rice', slot: 'dinner' },
  { recipeId: 'tofu-stir-fry', slot: 'dinner' },
  { recipeId: 'peanut-chicken', slot: 'dinner' },
  { recipeId: 'egg-fried-rice', slot: 'dinner' },
  { recipeId: 'chicken-salad', slot: 'lunch' },
  { recipeId: 'oatmeal', slot: 'breakfast' },
  { recipeId: 'eggs-and-toast', slot: 'breakfast' },
  { recipeId: 'yogurt-bowl', slot: 'breakfast' },
  { recipeId: 'apple-slices', slot: 'snack' },
]

export const testRecipeDietTags: RecipeDietTag[] = [
  { recipeId: 'tofu-stir-fry', dietTagId: 1 }, // vegetarian
  { recipeId: 'tofu-stir-fry', dietTagId: 2 }, // vegan
  { recipeId: 'tofu-stir-fry', dietTagId: 3 }, // gluten_free
  { recipeId: 'beef-and-rice', dietTagId: 3 },
  { recipeId: 'egg-fried-rice', dietTagId: 1 },
  { recipeId: 'oatmeal', dietTagId: 1 },
  { recipeId: 'eggs-and-toast', dietTagId: 1 },
  { recipeId: 'yogurt-bowl', dietTagId: 1 },
  { recipeId: 'apple-slices', dietTagId: 1 },
  { recipeId: 'apple-slices', dietTagId: 2 },
  { recipeId: 'apple-slices', dietTagId: 3 },
]

export const testMealLibrary: MealLibrary = buildMealLibrary({
  recipes: testRecipes,
  ingredients: testIngredients,
  recipeIngredients: testRecipeIngredients,
  recipeMealSlots: testRecipeMealSlots,
  recipeDietTags: testRecipeDietTags,
  ingredientAllergens: testIngredientAllergens,
})
