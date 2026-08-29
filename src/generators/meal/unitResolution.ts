import type { Ingredient, IngredientUnit, Unit } from '@/types/domain'

/**
 * Resolves a recipe_ingredients line to grams — a typed port of
 * scripts/lib/ingredientIndex.mjs's `resolveGrams` for the client/runtime
 * side, same priority order docs/mealgen.md §8 specifies: "resolve to
 * grams via ingredient_units, falling back to density" (plus
 * grams_per_each for count units with no override).
 *
 * Not a re-export of the Node version: that one parses raw seed SQL text
 * by slug (an authoring-time concern — see its own header on why a
 * SEPARATE copy already exists on the TS side for the same reason as
 * parseMovementLibrarySeed.ts). This one takes already-resolved Ingredient/
 * Unit domain objects and numeric ids, which is what's actually available
 * once content has been parsed into Dexie — no slug lookups needed here.
 */

export interface UnitResolutionIndex {
  unitById: Map<number, Unit>
  /** `${ingredientId}::${unitId}` -> exact gram override, beating
   *  density/gramsPerEach when present (1 cup flour = 120g, 1 clove
   *  garlic = 3g). */
  overrideByKey: Map<string, number>
}

export function buildUnitResolutionIndex(units: readonly Unit[], ingredientUnits: readonly IngredientUnit[]): UnitResolutionIndex {
  return {
    unitById: new Map(units.map((u) => [u.id, u])),
    overrideByKey: new Map(ingredientUnits.map((iu) => [`${iu.ingredientId}::${iu.unitId}`, iu.grams])),
  }
}

/** Throws on an unresolvable line (a real content gap — see
 *  scripts/verify-food-reference.mjs's "gram-conversion-path coverage"
 *  warning for known ones) rather than silently returning a wrong number.
 *  groceryList.ts, its only caller, catches this per-ingredient and skips
 *  that line with a warning instead of failing the whole list — this
 *  function itself stays a faithful, unconditional port of the authoring-
 *  time logic, which correctly has no such recovery (a bad line there
 *  should stop content from shipping at all, not get quietly dropped). */
export function resolveGrams(index: UnitResolutionIndex, ingredient: Ingredient, unitId: number, quantity: number): number {
  const override = index.overrideByKey.get(`${ingredient.id}::${unitId}`)
  if (override !== undefined) return quantity * override

  const unit = index.unitById.get(unitId)
  if (!unit) throw new Error(`resolveGrams: unknown unit id ${unitId}`)

  if (unit.dimension === 'mass') return quantity * unit.baseFactor

  if (unit.dimension === 'volume') {
    if (ingredient.densityGPerMl === null) {
      throw new Error(`resolveGrams: "${ingredient.slug}" used in a volume unit (${unit.slug}) but has no density_g_per_ml and no ingredient_units override`)
    }
    return quantity * unit.baseFactor * ingredient.densityGPerMl
  }

  // count
  if (ingredient.gramsPerEach === null) {
    throw new Error(`resolveGrams: "${ingredient.slug}" used in a count unit (${unit.slug}) but has no grams_per_each and no ingredient_units override`)
  }
  return quantity * ingredient.gramsPerEach
}
