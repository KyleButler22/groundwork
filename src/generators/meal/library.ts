import type { Ingredient, IngredientAllergen, MealSlot, Recipe, RecipeDietTag, RecipeIngredient, RecipeMealSlot } from '@/types/domain'

/**
 * Indexed view over the recipe corpus, built once per generator run — the
 * meal-generator equivalent of ../workout/library.ts's MovementLibrary.
 * Every other module in this directory takes a MealLibrary rather than
 * raw arrays.
 *
 * Deliberately does NOT include recipe_steps (cooking instructions) or
 * unit/gram resolution (density, ingredient_units overrides) — nothing in
 * filter/score/assemble/repair reads a recipe's steps or converts an
 * ingredient line to grams; that's grocery-list territory (docs/mealgen.md
 * §8), which is its own follow-up (see TASKS.md) and would pull in the
 * unit-conversion logic scripts/lib/ingredientIndex.mjs already owns for
 * the authoring side.
 */
export interface MealLibrary {
  recipeById: Map<string, Recipe>
  ingredientById: Map<string, Ingredient>
  /** A recipe's ingredient lines, in order_index order. */
  ingredientsByRecipe: Map<string, RecipeIngredient[]>
  mealSlotsByRecipe: Map<string, Set<MealSlot>>
  dietTagsByRecipe: Map<string, Set<number>>
  /**
   * Derived upward from ingredient_allergens (docs/schema.md §4: "never
   * hand-tagged"), and deliberately from EVERY ingredient line including
   * `is_optional` ones — an allergen is a hard safety exclusion
   * (docs/schema.md: "exclude outright rather than adding a warning
   * note"), and a garnish being skippable doesn't change that the recipe
   * AS WRITTEN contains it. Softening this for optional lines would need
   * a UI that shows *which* ingredient triggered the exclusion so a user
   * could knowingly omit it — that doesn't exist yet, so the safe default
   * is the whole recipe is off-limits.
   */
  allergensByRecipe: Map<string, Set<number>>
  /** Non-pantry-staple ingredient ids per recipe — exactly the set
   *  docs/mealgen.md §4's overlapValue and §5's variety floor operate on
   *  (staples are "nearly free," per the corpus's authoring rule, and
   *  explicitly excluded from both). */
  nonStapleIngredientIdsByRecipe: Map<string, Set<string>>
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

export function buildMealLibrary(input: {
  recipes: Recipe[]
  ingredients: Ingredient[]
  recipeIngredients: RecipeIngredient[]
  recipeMealSlots: RecipeMealSlot[]
  recipeDietTags: RecipeDietTag[]
  ingredientAllergens: IngredientAllergen[]
}): MealLibrary {
  const recipeById = new Map(input.recipes.map((r) => [r.id, r]))
  const ingredientById = new Map(input.ingredients.map((i) => [i.id, i]))

  const ingredientsByRecipe = groupBy(input.recipeIngredients, (ri) => ri.recipeId)
  for (const list of ingredientsByRecipe.values()) list.sort((a, b) => a.orderIndex - b.orderIndex)

  const mealSlotsByRecipe = new Map<string, Set<MealSlot>>()
  for (const row of input.recipeMealSlots) {
    const set = mealSlotsByRecipe.get(row.recipeId) ?? new Set<MealSlot>()
    set.add(row.slot)
    mealSlotsByRecipe.set(row.recipeId, set)
  }

  const dietTagsByRecipe = new Map<string, Set<number>>()
  for (const row of input.recipeDietTags) {
    const set = dietTagsByRecipe.get(row.recipeId) ?? new Set<number>()
    set.add(row.dietTagId)
    dietTagsByRecipe.set(row.recipeId, set)
  }

  const allergensByIngredient = new Map<string, Set<number>>()
  for (const row of input.ingredientAllergens) {
    const set = allergensByIngredient.get(row.ingredientId) ?? new Set<number>()
    set.add(row.allergenId)
    allergensByIngredient.set(row.ingredientId, set)
  }

  const allergensByRecipe = new Map<string, Set<number>>()
  const nonStapleIngredientIdsByRecipe = new Map<string, Set<string>>()
  for (const recipe of input.recipes) {
    const lines = ingredientsByRecipe.get(recipe.id) ?? []
    const allergenSet = new Set<number>()
    const nonStapleSet = new Set<string>()
    for (const line of lines) {
      for (const allergenId of allergensByIngredient.get(line.ingredientId) ?? []) allergenSet.add(allergenId)
      const ingredient = ingredientById.get(line.ingredientId)
      if (ingredient && !ingredient.isPantryStaple) nonStapleSet.add(ingredient.id)
    }
    allergensByRecipe.set(recipe.id, allergenSet)
    nonStapleIngredientIdsByRecipe.set(recipe.id, nonStapleSet)
  }

  return { recipeById, ingredientById, ingredientsByRecipe, mealSlotsByRecipe, dietTagsByRecipe, allergensByRecipe, nonStapleIngredientIdsByRecipe }
}

/** Every diet tag the user selected must be present on the recipe — e.g.
 *  a 'vegan' user needs the recipe tagged vegan, not merely NOT tagged
 *  non-vegan (recipe_diet_tags is a positive assertion list, not an
 *  exhaustive one). */
export function satisfiesDiet(library: MealLibrary, recipeId: string, requiredDietTagIds: ReadonlySet<number>): boolean {
  if (requiredDietTagIds.size === 0) return true
  const recipeTags = library.dietTagsByRecipe.get(recipeId) ?? new Set<number>()
  for (const required of requiredDietTagIds) if (!recipeTags.has(required)) return false
  return true
}

export function hasAllergen(library: MealLibrary, recipeId: string, userAllergenIds: ReadonlySet<number>): boolean {
  if (userAllergenIds.size === 0) return false
  const recipeAllergens = library.allergensByRecipe.get(recipeId) ?? new Set<number>()
  for (const allergenId of userAllergenIds) if (recipeAllergens.has(allergenId)) return true
  return false
}

export function hasDislikedIngredient(library: MealLibrary, recipeId: string, dislikedIngredientIds: ReadonlySet<string>): boolean {
  if (dislikedIngredientIds.size === 0) return false
  const lines = library.ingredientsByRecipe.get(recipeId) ?? []
  return lines.some((line) => dislikedIngredientIds.has(line.ingredientId))
}
