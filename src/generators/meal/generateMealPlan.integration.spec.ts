import { describe, expect, it } from 'vitest'

import { loadRealFoodSeed } from '@/generators/__fixtures__/loadRealFoodSeed'
import type { UserRecipeFeedback } from '@/types/domain'

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
})
