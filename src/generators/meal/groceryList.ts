import type { Aisle, GroceryItem, GroceryList, Ingredient, IngredientUnit, MealPlanEntry, Unit } from '@/types/domain'

import type { MealLibrary } from './library'
import { buildUnitResolutionIndex, resolveGrams } from './unitResolution'

/**
 * docs/mealgen.md §8. Derived from a generated MealPlan's entries, then
 * independent — its own table (GroceryList/GroceryItem), not a view,
 * since people check things off and add manual items afterward.
 *
 * ```
 * 1. take fresh-cook entries only        // leftovers contribute nothing
 * 2. scale each recipe_ingredient by the batch actually cooked
 * 3. resolve to grams via ingredient_units, falling back to density
 * 4. sum by ingredient_id
 * 5. subtract user_pantry, drop is_pantry_staple
 * 6. convert to the friendliest display unit
 * 7. group by aisle.sort_order
 * ```
 *
 * "Step 1 is the one that bites" (the doc's own words) — a leftover
 * entry must contribute ZERO ingredients, its food was already bought for
 * the parent cook.
 *
 * Worth knowing if you're tempted to "simplify" this by summing every
 * entry independently (each scaled by its own `servings ÷ recipe.
 * servings`, leftovers included): with `servings` always meaning "eaten
 * in THIS entry" (see MealPlanEntry's own comment in domain.ts), that
 * actually produces the SAME total mass per ingredient — Q×fresh/R +
 * Q×leftover/R is just Q×(fresh+leftover)/R written differently. The
 * reason to still exclude leftovers here isn't quantity correctness, it's
 * ATTRIBUTION: `sourceEntryIds` should point at the entry that caused the
 * shopping trip (the cook), not at every night the food gets eaten — see
 * generateMealPlan.integration.spec.ts's test on exactly this.
 */

const KG_THRESHOLD_GRAMS = 1000

export interface BuildGroceryListInput {
  mealPlanId: string
  userId: string
  title: string
  entries: readonly MealPlanEntry[]
  library: MealLibrary
  units: readonly Unit[]
  ingredientUnits: readonly IngredientUnit[]
  aisles: readonly Aisle[]
  userPantryIngredientIds?: ReadonlySet<string>
  now: string // ISO timestamp
}

export interface BuildGroceryListResult {
  list: GroceryList
  items: GroceryItem[]
  warnings: string[]
}

export function buildGroceryList(input: BuildGroceryListInput): BuildGroceryListResult {
  const warnings: string[] = []
  const unitIndex = buildUnitResolutionIndex(input.units, input.ingredientUnits)
  const unitIdBySlug = new Map(input.units.map((u) => [u.slug, u.id]))
  const aisleById = new Map(input.aisles.map((a) => [a.id, a]))
  const userPantryIngredientIds = input.userPantryIngredientIds ?? new Set<string>()

  // Step 1: fresh-cook entries only.
  const freshEntries = input.entries.filter((e) => !e.leftoverOfId)

  const gramsByIngredient = new Map<string, number>()
  const sourceEntriesByIngredient = new Map<string, Set<string>>()

  for (const entry of freshEntries) {
    const recipe = input.library.recipeById.get(entry.recipeId)
    if (!recipe) {
      warnings.push(`grocery list: entry ${entry.id} references unknown recipe "${entry.recipeId}" — skipped`)
      continue
    }
    if (recipe.servings <= 0) {
      warnings.push(`grocery list: recipe "${recipe.title}" has invalid servings (${recipe.servings}) — skipped`)
      continue
    }

    // Step 2: scale by the batch actually cooked — this entry's own
    // servings PLUS every leftover that reuses it. `servings` never
    // stores the doubled number directly (see MealPlanEntry's own
    // comment in domain.ts on why), so it's summed here instead.
    const leftoverServings = input.entries.filter((e) => e.leftoverOfId === entry.id).reduce((sum, e) => sum + e.servings, 0)
    const totalServingsCooked = entry.servings + leftoverServings
    const scale = totalServingsCooked / recipe.servings

    const lines = input.library.ingredientsByRecipe.get(recipe.id) ?? []
    for (const line of lines) {
      const ingredient = input.library.ingredientById.get(line.ingredientId)
      if (!ingredient) {
        warnings.push(`grocery list: recipe "${recipe.title}" references unknown ingredient "${line.ingredientId}" — skipped`)
        continue
      }

      // Optional lines (a garnish you might skip eating) still get
      // bought if you're making the recipe as written — unlike the macro
      // cache (scripts/lib/ingredientIndex.mjs's computeRecipeTotals),
      // which excludes them because an uneaten garnish shouldn't count
      // toward what you ATE. Different question, different answer.
      let grams: number
      try {
        grams = resolveGrams(unitIndex, ingredient, line.unitId, line.quantity * scale)
      } catch (err) {
        warnings.push(`grocery list: ${err instanceof Error ? err.message : String(err)} — this line skipped`)
        continue
      }

      gramsByIngredient.set(ingredient.id, (gramsByIngredient.get(ingredient.id) ?? 0) + grams)
      const sources = sourceEntriesByIngredient.get(ingredient.id) ?? new Set<string>()
      sources.add(entry.id)
      sourceEntriesByIngredient.set(ingredient.id, sources)
    }
  }

  // Step 5: subtract user_pantry, drop is_pantry_staple.
  const shoppable = [...gramsByIngredient.entries()].filter(([ingredientId]) => {
    const ingredient = input.library.ingredientById.get(ingredientId)
    return ingredient !== undefined && !ingredient.isPantryStaple && !userPantryIngredientIds.has(ingredientId)
  })

  // Step 6/7: friendliest display unit, then sort so grouping by
  // aisle.sort_order falls straight out of iterating sortIndex in order.
  const rows = shoppable
    .map(([ingredientId, totalGrams]) => {
      const ingredient = input.library.ingredientById.get(ingredientId)!
      return {
        ingredient,
        aisle: aisleById.get(ingredient.aisleId),
        totalGrams,
        display: friendliestDisplay(totalGrams, ingredient, unitIdBySlug),
        sourceEntryIds: [...(sourceEntriesByIngredient.get(ingredientId) ?? [])],
      }
    })
    .sort((a, b) => {
      const orderA = a.aisle?.sortOrder ?? Number.POSITIVE_INFINITY
      const orderB = b.aisle?.sortOrder ?? Number.POSITIVE_INFINITY
      if (orderA !== orderB) return orderA - orderB
      return a.ingredient.name.localeCompare(b.ingredient.name)
    })

  const items: GroceryItem[] = rows.map((row, sortIndex) => ({
    id: `draft-grocery-item-${row.ingredient.id}`,
    listId: 'draft-grocery-list',
    ingredientId: row.ingredient.id,
    manualLabel: null,
    totalGrams: Math.round(row.totalGrams * 100) / 100,
    displayQuantity: row.display.quantity,
    displayUnitId: row.display.unitId,
    aisleId: row.ingredient.aisleId,
    isChecked: false,
    checkedAt: null,
    sourceEntryIds: row.sourceEntryIds,
    sortIndex,
    updatedAt: input.now,
    deletedAt: null,
  }))

  const list: GroceryList = {
    id: 'draft-grocery-list',
    userId: input.userId,
    mealPlanId: input.mealPlanId,
    title: input.title,
    status: 'active',
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
  }

  return { list, items, warnings }
}

/**
 * Deliberately simple (docs/mealgen.md §8: "no rounding to purchasable
 * pack sizes... display what the recipes need; people round in the shop,
 * as they already do") — no attempt to reverse a count-unit override
 * (e.g. showing "2 cloves" instead of "6 g" for garlic) back out of a
 * gram total; that would need picking among every count override an
 * ingredient has for the best fit, which the doc's own v1 scope rules out.
 */
export function friendliestDisplay(totalGrams: number, ingredient: Ingredient, unitIdBySlug: ReadonlyMap<string, number>): { quantity: number; unitId: number | null } {
  if (ingredient.gramsPerEach !== null && ingredient.gramsPerEach > 0) {
    return { quantity: Math.max(1, Math.ceil(totalGrams / ingredient.gramsPerEach)), unitId: unitIdBySlug.get('each') ?? null }
  }
  if (totalGrams >= KG_THRESHOLD_GRAMS) {
    return { quantity: Math.round((totalGrams / 1000) * 100) / 100, unitId: unitIdBySlug.get('kg') ?? null }
  }
  return { quantity: Math.round(totalGrams), unitId: unitIdBySlug.get('g') ?? null }
}

/**
 * `buildGroceryList` has no memory of a previous list — every call derives
 * one from scratch, which would otherwise silently un-check everything a
 * user already checked off across a regenerate/swap-triggered rebuild (a
 * real UX rough edge, since that rebuild happens on every meal-plan
 * change, not just ones the user would expect to reset their list).
 * Ingredient id is the natural stable key across two different weeks'
 * generations — a manually-added item (`manualLabel`, no `ingredientId`)
 * has no such key and isn't carried over, but nothing can create one yet
 * (no UI for it), so that's not a real gap today.
 */
export function carryOverCheckedState(previousItems: readonly GroceryItem[], freshItems: readonly GroceryItem[]): GroceryItem[] {
  const checkedAtByIngredientId = new Map(
    previousItems.filter((item) => item.isChecked && item.ingredientId).map((item) => [item.ingredientId as string, item.checkedAt]),
  )
  if (checkedAtByIngredientId.size === 0) return [...freshItems]

  return freshItems.map((item) => {
    const checkedAt = item.ingredientId ? checkedAtByIngredientId.get(item.ingredientId) : undefined
    return checkedAt === undefined ? item : { ...item, isChecked: true, checkedAt }
  })
}
