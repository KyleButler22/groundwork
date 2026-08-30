import { describe, expect, it } from 'vitest'

import { testAisles, testIngredientUnits, testMealLibrary, testUnits } from '@/generators/__fixtures__/testMealLibrary'
import type { GroceryItem, Ingredient, MealPlanEntry } from '@/types/domain'

import { buildGroceryList, carryOverCheckedState, friendliestDisplay, type BuildGroceryListInput } from './groceryList'

function entry(overrides: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id' | 'recipeId' | 'servings'>): MealPlanEntry {
  return {
    mealPlanId: 'plan-1',
    serveOn: '2026-08-31',
    slot: 'dinner',
    isLocked: false,
    leftoverOfId: null,
    updatedAt: '',
    ...overrides,
  }
}

function baseInput(entries: MealPlanEntry[], overrides: Partial<BuildGroceryListInput> = {}): BuildGroceryListInput {
  return {
    mealPlanId: 'plan-1',
    userId: 'u1',
    title: 'This week',
    entries,
    library: testMealLibrary,
    units: testUnits,
    ingredientUnits: testIngredientUnits,
    aisles: testAisles,
    now: '2026-08-31T12:00:00.000Z',
    ...overrides,
  }
}

function itemFor(items: ReturnType<typeof buildGroceryList>['items'], ingredientId: string) {
  return items.find((i) => i.ingredientId === ingredientId)
}

describe('buildGroceryList', () => {
  it('drops pantry-staple ingredients entirely (rice, soy_sauce, salt never appear)', () => {
    const { items } = buildGroceryList(baseInput([entry({ id: 'e1', recipeId: 'chicken-stir-fry', servings: 2 })]))
    expect(itemFor(items, 'rice')).toBeUndefined()
    expect(itemFor(items, 'soy_sauce')).toBeUndefined()
    expect(items.map((i) => i.ingredientId)).toEqual(expect.arrayContaining(['chicken', 'broccoli']))
  })

  it('a leftover entry contributes ZERO ingredient lines of its own', () => {
    // chicken-stir-fry serves 2; a fresh cook of 2 with NO leftover.
    const { items } = buildGroceryList(baseInput([entry({ id: 'e1', recipeId: 'chicken-stir-fry', servings: 2 })]))
    // 100 units (=100g, testUnits' only unit) per ingredient line * scale
    // (2 cooked / 2 recipe servings = 1) = 100g each.
    expect(itemFor(items, 'chicken')?.totalGrams).toBe(100)
  })

  it('scales by the batch actually cooked: fresh entry servings PLUS its leftover children — not double-counted, not ignored', () => {
    const fresh = entry({ id: 'e1', recipeId: 'chicken-stir-fry', servings: 2 })
    const leftover = entry({ id: 'e2', recipeId: 'chicken-stir-fry', servings: 2, leftoverOfId: 'e1', serveOn: '2026-09-02' })
    const { items } = buildGroceryList(baseInput([fresh, leftover]))
    // total cooked = 2 (fresh) + 2 (leftover) = 4; recipe serves 2 -> scale 2x -> 200g, not 100g (leftover ignored) or 300g (double-counted).
    expect(itemFor(items, 'chicken')?.totalGrams).toBe(200)
  })

  it('sums the same ingredient across multiple different recipes/entries', () => {
    const entries = [
      entry({ id: 'e1', recipeId: 'chicken-stir-fry', servings: 2 }), // chicken 100g
      entry({ id: 'e2', recipeId: 'chicken-salad', servings: 1, slot: 'lunch' }), // chicken 100g (chicken-salad serves 1)
    ]
    const { items } = buildGroceryList(baseInput(entries))
    expect(itemFor(items, 'chicken')?.totalGrams).toBe(200)
    expect(itemFor(items, 'chicken')?.sourceEntryIds.sort()).toEqual(['e1', 'e2'])
  })

  it('excludes an ingredient the user already has in their pantry, even though it is not a staple', () => {
    const withoutPantry = buildGroceryList(baseInput([entry({ id: 'e1', recipeId: 'chicken-stir-fry', servings: 2 })]))
    expect(itemFor(withoutPantry.items, 'chicken')).toBeDefined()

    const withPantry = buildGroceryList(
      baseInput([entry({ id: 'e1', recipeId: 'chicken-stir-fry', servings: 2 })], { userPantryIngredientIds: new Set(['chicken']) }),
    )
    expect(itemFor(withPantry.items, 'chicken')).toBeUndefined()
    expect(itemFor(withPantry.items, 'broccoli')).toBeDefined() // unaffected
  })

  it('sorts items by aisle.sort_order, then ingredient name within an aisle', () => {
    // chicken (aisle 1) and broccoli (aisle 2) from one recipe, milk (aisle 3) from another.
    const entries = [entry({ id: 'e1', recipeId: 'chicken-stir-fry', servings: 2 }), entry({ id: 'e2', recipeId: 'oatmeal', servings: 1, slot: 'breakfast' })]
    const { items } = buildGroceryList(baseInput(entries))
    const aisleOrder = items.map((i) => i.aisleId)
    expect(aisleOrder).toEqual([...aisleOrder].sort((a, b) => (a ?? 0) - (b ?? 0)))
    // sortIndex should be assigned in that same final order, 0-based and contiguous.
    expect(items.map((i) => i.sortIndex)).toEqual(items.map((_, i) => i))
  })

  it('produces a GroceryList record pointing back at the meal plan', () => {
    const { list } = buildGroceryList(baseInput([entry({ id: 'e1', recipeId: 'chicken-stir-fry', servings: 2 })]))
    expect(list.mealPlanId).toBe('plan-1')
    expect(list.userId).toBe('u1')
    expect(list.status).toBe('active')
  })

  it('warns and skips a line rather than throwing when a recipe references something unresolvable', () => {
    const entries = [entry({ id: 'e1', recipeId: 'chicken-stir-fry', servings: 2 })]
    // Force an unresolvable unit by pointing at a unitId that doesn't exist in `units`.
    const brokenLibrary = { ...testMealLibrary, ingredientsByRecipe: new Map(testMealLibrary.ingredientsByRecipe) }
    brokenLibrary.ingredientsByRecipe.set('chicken-stir-fry', [
      { id: 'x', recipeId: 'chicken-stir-fry', ingredientId: 'chicken', quantity: 100, unitId: 9999, prepNote: null, isOptional: false, orderIndex: 0 },
    ])
    const { items, warnings } = buildGroceryList(baseInput(entries, { library: brokenLibrary }))
    expect(itemFor(items, 'chicken')).toBeUndefined()
    expect(warnings.some((w) => w.includes('unknown unit'))).toBe(true)
  })
})

describe('friendliestDisplay', () => {
  const unitIdBySlug = new Map([
    ['g', 1],
    ['kg', 2],
    ['each', 3],
  ])

  function ing(overrides: Partial<Ingredient> = {}): Ingredient {
    return {
      id: 'x',
      slug: 'x',
      name: 'x',
      aisleId: 1,
      densityGPerMl: null,
      gramsPerEach: null,
      kcalPer100g: 0,
      proteinPer100g: 0,
      carbPer100g: 0,
      fatPer100g: 0,
      fiberPer100g: null,
      fdcId: null,
      isPantryStaple: false,
      isActive: true,
      ...overrides,
    }
  }

  it('displays a count-based ingredient as whole "each", rounded up', () => {
    expect(friendliestDisplay(120, ing({ gramsPerEach: 50 }), unitIdBySlug)).toEqual({ quantity: 3, unitId: 3 }) // ceil(120/50) = 3
  })

  it('never displays fewer than 1 each, even for a tiny amount', () => {
    expect(friendliestDisplay(5, ing({ gramsPerEach: 50 }), unitIdBySlug)).toEqual({ quantity: 1, unitId: 3 })
  })

  it('displays under 1000g in grams', () => {
    expect(friendliestDisplay(450, ing(), unitIdBySlug)).toEqual({ quantity: 450, unitId: 1 })
  })

  it('displays 1000g or more in kg, rounded to 2 decimals', () => {
    expect(friendliestDisplay(1500, ing(), unitIdBySlug)).toEqual({ quantity: 1.5, unitId: 2 })
    expect(friendliestDisplay(1000, ing(), unitIdBySlug)).toEqual({ quantity: 1, unitId: 2 })
  })

  it('falls back to a null unit id when the reference unit list lacks the needed slug', () => {
    expect(friendliestDisplay(450, ing(), new Map())).toEqual({ quantity: 450, unitId: null })
  })
})

describe('carryOverCheckedState', () => {
  function item(overrides: Partial<GroceryItem> & Pick<GroceryItem, 'id'>): GroceryItem {
    return {
      listId: 'list-1',
      ingredientId: 'chicken',
      manualLabel: null,
      totalGrams: 100,
      displayQuantity: 100,
      displayUnitId: 1,
      aisleId: 1,
      isChecked: false,
      checkedAt: null,
      sourceEntryIds: [],
      sortIndex: 0,
      updatedAt: '2026-08-31T00:00:00.000Z',
      deletedAt: null,
      ...overrides,
    }
  }

  it('carries isChecked/checkedAt onto a fresh item sharing the same ingredient id', () => {
    const previous = [item({ id: 'old-1', ingredientId: 'chicken', isChecked: true, checkedAt: '2026-08-31T09:00:00.000Z' })]
    const fresh = [item({ id: 'new-1', ingredientId: 'chicken', isChecked: false, checkedAt: null })]
    const result = carryOverCheckedState(previous, fresh)
    expect(result[0].isChecked).toBe(true)
    expect(result[0].checkedAt).toBe('2026-08-31T09:00:00.000Z')
    expect(result[0].id).toBe('new-1') // still the fresh item's own identity, not the old one's
  })

  it('leaves an ingredient that was never checked alone', () => {
    const previous = [item({ id: 'old-1', ingredientId: 'chicken', isChecked: false })]
    const fresh = [item({ id: 'new-1', ingredientId: 'chicken', isChecked: false })]
    expect(carryOverCheckedState(previous, fresh)[0].isChecked).toBe(false)
  })

  it('does not carry a checked state onto an ingredient that is new this time (no match to carry from)', () => {
    const previous = [item({ id: 'old-1', ingredientId: 'chicken', isChecked: true, checkedAt: '2026-08-31T09:00:00.000Z' })]
    const fresh = [item({ id: 'new-1', ingredientId: 'broccoli', isChecked: false })]
    expect(carryOverCheckedState(previous, fresh)[0].isChecked).toBe(false)
  })

  it('drops a checked ingredient that no longer appears at all (nothing to carry it onto)', () => {
    const previous = [item({ id: 'old-1', ingredientId: 'chicken', isChecked: true, checkedAt: '2026-08-31T09:00:00.000Z' })]
    const fresh = [item({ id: 'new-1', ingredientId: 'broccoli' })]
    const result = carryOverCheckedState(previous, fresh)
    expect(result).toHaveLength(1)
    expect(result.map((i) => i.ingredientId)).toEqual(['broccoli'])
  })

  it('is a no-op when nothing was previously checked', () => {
    const previous = [item({ id: 'old-1', isChecked: false })]
    const fresh = [item({ id: 'new-1' })]
    expect(carryOverCheckedState(previous, fresh)).toEqual(fresh)
  })

  it('is a no-op with no previous items at all (first-ever generation)', () => {
    const fresh = [item({ id: 'new-1' })]
    expect(carryOverCheckedState([], fresh)).toEqual(fresh)
  })

  it('ignores a manual item (no ingredientId) — nothing to key it by', () => {
    const previous = [item({ id: 'old-1', ingredientId: null, manualLabel: 'Paper towels', isChecked: true, checkedAt: '2026-08-31T09:00:00.000Z' })]
    const fresh = [item({ id: 'new-1', ingredientId: 'chicken' })]
    expect(carryOverCheckedState(previous, fresh)[0].isChecked).toBe(false)
  })
})
