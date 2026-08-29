import { describe, expect, it } from 'vitest'

import { loadRealFoodSeed } from '@/generators/__fixtures__/loadRealFoodSeed'
import type { UserRecipeFeedback } from '@/types/domain'

import { buildGroceryList } from './groceryList'
import { generateMealPlan, regenerateWeek, swapOneMeal, type GenerateMealPlanInput } from './generateMealPlan'
import { buildMealLibrary } from './library'
import { validateMealPlan } from './validate'

/**
 * Runs against the real 200-recipe corpus (supabase/seed/002_food_
 * reference.sql + 0*_recipes_*.sql), not the small synthetic fixture the
 * other specs in this directory use — see generatePlan.integration.spec.ts
 * in ../workout for the same split and why it exists.
 */

const seed = loadRealFoodSeed()

describe('loadRealFoodSeed sanity', () => {
  it('parsed the expected aisle/unit/allergen/diet-tag/ingredient counts', () => {
    // Cross-checks the parser's own assertSeedShape() with an independent
    // read here — two parsers (this one; scripts/verify-food-reference.mjs)
    // agreeing is real evidence neither is silently wrong.
    expect(seed.foodReference.aisles).toHaveLength(11)
    expect(seed.foodReference.units).toHaveLength(14)
    expect(seed.foodReference.allergens).toHaveLength(9)
    expect(seed.foodReference.dietTags).toHaveLength(8)
    expect(seed.foodReference.ingredients).toHaveLength(150)
  })

  it('parsed real human-readable ingredient names, not the slug repeated', () => {
    const chicken = seed.foodReference.ingredients.find((i) => i.slug === 'chicken_thigh')!
    expect(chicken.name).toBe('Boneless chicken thigh')
    expect(chicken.name).not.toBe(chicken.slug)
  })

  it('splits pantry staples from perishables', () => {
    const oliveOil = seed.foodReference.ingredients.find((i) => i.slug === 'olive_oil')!
    const chickenThigh = seed.foodReference.ingredients.find((i) => i.slug === 'chicken_thigh')!
    expect(oliveOil.isPantryStaple).toBe(true)
    expect(chickenThigh.isPantryStaple).toBe(false)
  })

  it('resolves an ingredient_units override', () => {
    const garlicClove = seed.foodReference.ingredientUnits.find(
      (u) => u.ingredientId === 'garlic' && u.unitId === seed.foodReference.unitIdBySlug.get('clove'),
    )
    expect(garlicClove?.grams).toBe(3)
  })

  it('parsed exactly 200 recipes across the 14 family files', () => {
    expect(seed.recipes.recipes).toHaveLength(200)
  })

  it('resolved a real recipe end to end, including its diet tags and meal slots', () => {
    const recipe = seed.recipes.recipes.find((r) => r.slug === 'classic-oatmeal-with-banana')!
    expect(recipe.title).toBe('Classic Oatmeal with Banana and Walnuts')
    expect(recipe.kcalPerServing).toBeCloseTo(531.5, 1)

    const ingredients = seed.recipes.recipeIngredients.filter((ri) => ri.recipeId === recipe.slug)
    expect(ingredients.map((ri) => ri.ingredientId)).toContain('banana')

    const slots = seed.recipes.recipeMealSlots.filter((s) => s.recipeId === recipe.slug).map((s) => s.slot)
    expect(slots).toEqual(['breakfast'])

    const dietTagIds = seed.recipes.recipeDietTags.filter((t) => t.recipeId === recipe.slug).map((t) => t.dietTagId)
    expect(dietTagIds).toContain(seed.foodReference.dietTagIdBySlug.get('vegetarian'))
  })

  it('handles an escaped apostrophe in a title (SQL escapes it as two single quotes)', () => {
    const recipe = seed.recipes.recipes.find((r) => r.slug === 'turkey-shepherds-pie')!
    expect(recipe.title).toBe("Turkey Shepherd's Pie")
  })
})

const library = buildMealLibrary({
  recipes: seed.recipes.recipes,
  ingredients: seed.foodReference.ingredients,
  recipeIngredients: seed.recipes.recipeIngredients,
  recipeMealSlots: seed.recipes.recipeMealSlots,
  recipeDietTags: seed.recipes.recipeDietTags,
  ingredientAllergens: seed.foodReference.ingredientAllergens,
})

const allergenIdBySlug = (slug: string): number => {
  const allergen = seed.foodReference.allergens.find((a) => a.slug === slug)!
  return allergen.id
}
const dietTagIdBySlug = (slug: string): number => seed.foodReference.dietTagIdBySlug.get(slug)!

function baseInput(overrides: Partial<GenerateMealPlanInput> = {}): GenerateMealPlanInput {
  return {
    userId: 'u1',
    weekStartsOn: '2026-08-31', // a Monday
    // docs/intake.md's own worked example.
    dailyTargets: { kcalTarget: 1930, proteinG: 180, carbG: 190, fatG: 60 },
    mealsPerDay: 4,
    householdSize: 2,
    cookTimeCeilingMinutes: 25,
    userAllergenIds: new Set(),
    userDietTagIds: new Set(),
    dislikedIngredientIds: new Set(),
    feedbackByRecipeId: new Map<string, UserRecipeFeedback>(),
    library,
    seed: 42,
    generatorVersion: 'integration-test-1',
    now: '2026-08-31T12:00:00.000Z',
    ...overrides,
  }
}

describe('generateMealPlan against the real corpus', () => {
  it('produces a full week with no validation violations for an unconstrained user', () => {
    const { entries, warnings } = generateMealPlan(baseInput())
    expect(entries.filter((e) => e.slot === 'dinner')).toHaveLength(7)
    expect(entries.filter((e) => e.slot === 'lunch')).toHaveLength(7)
    expect(entries.filter((e) => e.slot === 'breakfast')).toHaveLength(7)
    expect(entries.filter((e) => e.slot === 'snack')).toHaveLength(7)
    expect(warnings.filter((w) => w.startsWith('validation:'))).toEqual([])
  })

  it('runs well within a mobile-reasonable time budget', () => {
    const started = performance.now()
    generateMealPlan(baseInput({ seed: 7 }))
    const elapsedMs = performance.now() - started
    // docs/mealgen.md's target is "well under 200ms on a mid-range phone";
    // this dev machine is faster than that phone, so the bar here is
    // deliberately generous — it exists to catch a real algorithmic
    // blowup (e.g. an accidental O(n²) over the full 200-recipe pool per
    // slot), not to hold the generator to phone-grade wall-clock time.
    expect(elapsedMs).toBeLessThan(2000)
  })

  it('is deterministic against the real corpus', () => {
    const a = generateMealPlan(baseInput({ seed: 123 }))
    const b = generateMealPlan(baseInput({ seed: 123 }))
    expect(a).toEqual(b)
  })

  it('never serves a real allergen (peanuts) to a user who declared it, across many seeds', () => {
    const peanutId = allergenIdBySlug('peanuts')
    for (const trialSeed of [1, 2, 3, 4, 5]) {
      const { entries } = generateMealPlan(baseInput({ seed: trialSeed, userAllergenIds: new Set([peanutId]) }))
      for (const entry of entries) {
        expect(library.allergensByRecipe.get(entry.recipeId)?.has(peanutId)).toBeFalsy()
      }
    }
  })

  it('handles a demanding real combination (vegan + peanut allergy + a tight cook-time ceiling) without violations', () => {
    const veganId = dietTagIdBySlug('vegan')
    const peanutId = allergenIdBySlug('peanuts')
    const { entries, plan } = generateMealPlan(
      baseInput({ userDietTagIds: new Set([veganId]), userAllergenIds: new Set([peanutId]), cookTimeCeilingMinutes: 15 }),
    )
    const violations = validateMealPlan({
      entries,
      library,
      userAllergenIds: new Set([peanutId]),
      userDietTagIds: new Set([veganId]),
      householdSize: 2,
      activeSlots: ['breakfast', 'lunch', 'dinner', 'snack'],
      weekStartsOn: plan.weekStartsOn,
    })
    // Hard constraints must hold even under pressure — allergen/diet
    // violations specifically must never appear, whether or not every
    // slot found a recipe (missing_slot is an acceptable honest gap here,
    // the corpus may just not have enough vegan snacks, say).
    expect(violations.filter((v) => v.code === 'allergen_violation' || v.code === 'diet_violation')).toEqual([])
  })

  it('regenerateWeek against the real corpus carries locked entries through and changes the rest', () => {
    const first = generateMealPlan(baseInput({ seed: 55 }))
    const lockedDinner = { ...first.entries.find((e) => e.slot === 'dinner' && !e.leftoverOfId)!, isLocked: true }
    const previous = first.entries.map((e) => (e.id === lockedDinner.id ? lockedDinner : e))

    const regenerated = regenerateWeek(baseInput({ seed: 55 }), previous)
    expect(regenerated.entries.find((e) => e.id === lockedDinner.id)).toEqual(lockedDinner)
    expect(regenerated.plan.regenCount).toBe(1)
    // Something else in the week actually changed — a regenerate that
    // reproduces the exact same week would defeat the point of the button.
    expect(regenerated.entries).not.toEqual(first.entries)
  })

  it('swapOneMeal against the real corpus changes the targeted slot and leaves every OTHER DAY untouched', () => {
    // docs/mealgen.md §9: swapping re-scores that slot and repairs only
    // that day — repair (§7) can legitimately touch another slot on the
    // SAME day (e.g. rescaling or swapping the snack to absorb the macro
    // shift a new lunch pick introduces), so "only the targeted slot"
    // is too strong a claim; "only that day" is the actual contract.
    const first = generateMealPlan(baseInput({ seed: 8 }))
    const targetDay = first.entries.find((e) => e.slot === 'lunch')!.serveOn
    const swapped = swapOneMeal(baseInput({ seed: 8 }), first.entries, targetDay, 'lunch')

    const before = first.entries.find((e) => e.serveOn === targetDay && e.slot === 'lunch')!
    const after = swapped.entries.find((e) => e.serveOn === targetDay && e.slot === 'lunch')!
    expect(after.recipeId).not.toBe(before.recipeId)

    const otherDaysAfter = swapped.entries.filter((e) => e.serveOn !== targetDay).map((e) => ({ serveOn: e.serveOn, slot: e.slot, recipeId: e.recipeId }))
    const otherDaysBefore = first.entries.filter((e) => e.serveOn !== targetDay).map((e) => ({ serveOn: e.serveOn, slot: e.slot, recipeId: e.recipeId }))
    expect(otherDaysAfter).toEqual(otherDaysBefore)
  })

  it('swapping a fresh dinner with a real leftover propagates the new recipe to it, and to nowhere else', () => {
    let first = generateMealPlan(baseInput({ seed: 9 }))
    let parent = first.entries.find((e) => e.slot === 'dinner' && first.entries.some((x) => x.leftoverOfId === e.id))
    // Try a few seeds if this particular one didn't happen to produce a
    // leftover — real content + the default ~40% leftover ratio makes one
    // likely most of the time, but nothing guarantees a specific seed does.
    for (let seed = 10; !parent && seed < 20; seed++) {
      first = generateMealPlan(baseInput({ seed }))
      parent = first.entries.find((e) => e.slot === 'dinner' && first.entries.some((x) => x.leftoverOfId === e.id))
    }
    if (!parent) throw new Error('no seed in range produced a leftover — widen the range rather than skip this test')
    const leftover = first.entries.find((e) => e.leftoverOfId === parent!.id)!

    const swapped = swapOneMeal(baseInput({ seed: first.plan.seed }), first.entries, parent.serveOn, 'dinner')
    const newParent = swapped.entries.find((e) => e.serveOn === parent!.serveOn && e.slot === 'dinner')!
    const newLeftover = swapped.entries.find((e) => e.id === leftover.id)!

    expect(newParent.recipeId).not.toBe(parent.recipeId)
    expect(newLeftover.recipeId).toBe(newParent.recipeId)
    expect(newLeftover.servings).toBe(newParent.servings)
    expect(newLeftover.leftoverOfId).toBe(newParent.id)

    // Every day OTHER than the target's and its leftover's is untouched —
    // scoped by DAY, not by individual entry id, since repair (§7) can
    // legitimately touch another slot on either of those two SAME days
    // (see the plain swap test above for the same "day, not slot" scope).
    const affectedDays = new Set([parent.serveOn, leftover.serveOn])
    const untouchedBefore = first.entries.filter((e) => !affectedDays.has(e.serveOn))
    const untouchedAfter = swapped.entries.filter((e) => !affectedDays.has(e.serveOn))
    expect(untouchedAfter).toEqual(untouchedBefore)
  })

  it('never turns the swapped dinner itself into a leftover of some unrelated day (regression, real corpus)', () => {
    const first = generateMealPlan(baseInput({ seed: 11 }))
    const freshDinner = first.entries.find((e) => e.slot === 'dinner' && !e.leftoverOfId)!
    for (let swapCount = 1; swapCount <= 5; swapCount++) {
      const swapped = swapOneMeal(baseInput({ seed: 11 }), first.entries, freshDinner.serveOn, 'dinner', swapCount)
      const after = swapped.entries.find((e) => e.serveOn === freshDinner.serveOn && e.slot === 'dinner')!
      expect(after.leftoverOfId).toBeNull()
    }
  })
})

describe('buildGroceryList against the real corpus', () => {
  it('resolves every real recipe_ingredients line with zero warnings', () => {
    // The strongest possible confidence check for a ported implementation:
    // scripts/lib/ingredientIndex.mjs's resolveGrams already succeeded for
    // every line in the real corpus once, at authoring time (verify-
    // recipes.mjs's macro-cache cross-check couldn't have passed
    // otherwise) — so this client-side port succeeding with NO caught
    // warnings across a real, full week is real evidence the two
    // implementations agree, not just that neither happens to crash.
    const { entries } = generateMealPlan(baseInput({ seed: 3 }))
    const { warnings } = buildGroceryList({
      mealPlanId: 'plan-1',
      userId: 'u1',
      title: 'This week',
      entries,
      library,
      units: seed.foodReference.units,
      ingredientUnits: seed.foodReference.ingredientUnits,
      aisles: seed.foodReference.aisles,
      now: '2026-08-31T12:00:00.000Z',
    })
    expect(warnings).toEqual([])
  })

  it('never lists a pantry-staple ingredient (onion, garlic, oil, spices)', () => {
    const { entries } = generateMealPlan(baseInput({ seed: 3 }))
    const { items } = buildGroceryList({
      mealPlanId: 'plan-1',
      userId: 'u1',
      title: 'This week',
      entries,
      library,
      units: seed.foodReference.units,
      ingredientUnits: seed.foodReference.ingredientUnits,
      aisles: seed.foodReference.aisles,
      now: '2026-08-31T12:00:00.000Z',
    })
    for (const item of items) {
      const ingredient = library.ingredientById.get(item.ingredientId!)!
      expect(ingredient.isPantryStaple).toBe(false)
    }
  })

  it('a leftover entry never appears as its own line item source — its food was bought for the parent cook', () => {
    // docs/mealgen.md §8: "Step 1 is the one that bites... a leftover
    // entry must contribute zero ingredients." Checked directly against
    // sourceEntryIds rather than a before/after total-mass comparison:
    // with MealPlanEntry.servings always meaning "eaten in this entry"
    // (see that field's own comment in domain.ts), scaling a fresh entry
    // by its OWN servings plus every leftover's servings and scaling each
    // entry independently by its own servings happen to sum to the exact
    // same total mass — so a mass comparison wouldn't actually distinguish
    // "correct" from "wrong" here. What DOES distinguish them is which
    // entries the quantity gets ATTRIBUTED to, which is what a shopper-
    // facing "why do I need this" explanation would show.
    const { entries } = generateMealPlan(baseInput({ seed: 3 }))
    const leftoverIds = new Set(entries.filter((e) => e.leftoverOfId).map((e) => e.id))
    expect(leftoverIds.size).toBeGreaterThan(0) // otherwise this test isn't checking anything real

    const { items } = buildGroceryList({
      mealPlanId: 'plan-1',
      userId: 'u1',
      title: 'This week',
      entries,
      library,
      units: seed.foodReference.units,
      ingredientUnits: seed.foodReference.ingredientUnits,
      aisles: seed.foodReference.aisles,
      now: '2026-08-31T12:00:00.000Z',
    })
    for (const item of items) {
      for (const sourceId of item.sourceEntryIds) expect(leftoverIds.has(sourceId)).toBe(false)
    }
  })
})
