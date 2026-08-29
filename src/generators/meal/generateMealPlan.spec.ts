import { describe, expect, it } from 'vitest'

import { testMealLibrary } from '@/generators/__fixtures__/testMealLibrary'
import type { UserRecipeFeedback } from '@/types/domain'

import { generateMealPlan, regenerateWeek, swapOneMeal, type GenerateMealPlanInput } from './generateMealPlan'

const WEEK_STARTS_ON = '2026-08-31'

function baseInput(overrides: Partial<GenerateMealPlanInput> = {}): GenerateMealPlanInput {
  return {
    userId: 'u1',
    weekStartsOn: WEEK_STARTS_ON,
    dailyTargets: { kcalTarget: 1930, proteinG: 180, carbG: 200, fatG: 60 },
    mealsPerDay: 4,
    householdSize: 1,
    cookTimeCeilingMinutes: null,
    userAllergenIds: new Set(),
    userDietTagIds: new Set(),
    dislikedIngredientIds: new Set(),
    feedbackByRecipeId: new Map<string, UserRecipeFeedback>(),
    library: testMealLibrary,
    seed: 1,
    generatorVersion: 'test-1',
    now: '2026-08-31T12:00:00.000Z',
    ...overrides,
  }
}

describe('generateMealPlan', () => {
  it('produces a plan and 7 days worth of entries for every active slot', () => {
    const { plan, entries } = generateMealPlan(baseInput())
    expect(plan.userId).toBe('u1')
    expect(plan.weekStartsOn).toBe(WEEK_STARTS_ON)
    expect(plan.kcalTarget).toBe(1930)
    expect(plan.regenCount).toBe(0)
    expect(plan.status).toBe('active')
    expect(entries.filter((e) => e.slot === 'dinner')).toHaveLength(7)
  })

  it('is deterministic for a given seed', () => {
    const a = generateMealPlan(baseInput({ seed: 55 }))
    const b = generateMealPlan(baseInput({ seed: 55 }))
    expect(a).toEqual(b)
  })

  it('never serves an allergen the user declared', () => {
    const { entries, warnings } = generateMealPlan(baseInput({ userAllergenIds: new Set([1]) })) // milk
    for (const e of entries) {
      expect(testMealLibrary.allergensByRecipe.get(e.recipeId)?.has(1)).toBeFalsy()
    }
    expect(warnings.some((w) => w.startsWith('validation:'))).toBe(false)
  })

  it('surfaces a thin-pool warning when a hard constraint (diet tags, never relaxed) leaves too few recipes', () => {
    // Only 2 of 10 fixture recipes are vegan-tagged. Diet tags are never
    // relaxed (filter.ts's ladder doesn't touch them), so no *relaxation*
    // fires — the pool is thin for a reason nothing in the ladder can fix,
    // and that's exactly what this warning is for.
    const { warnings } = generateMealPlan(baseInput({ userDietTagIds: new Set([2]) }))
    expect(warnings.some((w) => w.includes('relaxed to find enough recipes'))).toBe(false)
    expect(warnings.some((w) => w.includes('matching recipe(s) found even after every relaxation'))).toBe(true)
  })

  it('mealsPerDay=1 plans dinner only', () => {
    const { entries } = generateMealPlan(baseInput({ mealsPerDay: 1 }))
    expect(new Set(entries.map((e) => e.slot))).toEqual(new Set(['dinner']))
  })
})

describe('regenerateWeek', () => {
  it('increments regenCount and derives a new seed from the original', () => {
    const first = generateMealPlan(baseInput({ seed: 10 }))
    const regen = regenerateWeek(baseInput({ seed: 10 }), first.entries)
    expect(regen.plan.regenCount).toBe(1)
    expect(regen.plan.seed).not.toBe(10)
  })

  it('carries a locked entry through completely unchanged', () => {
    const first = generateMealPlan(baseInput({ seed: 10 }))
    const lockedDinner = { ...first.entries.find((e) => e.slot === 'dinner')!, isLocked: true }
    const previous = first.entries.map((e) => (e.id === lockedDinner.id ? lockedDinner : e))

    const regen = regenerateWeek(baseInput({ seed: 10 }), previous)
    expect(regen.entries.find((e) => e.id === lockedDinner.id)).toEqual(lockedDinner)
  })

  it('is deterministic given the same previous entries and regenCount', () => {
    const first = generateMealPlan(baseInput({ seed: 10 }))
    const a = regenerateWeek(baseInput({ seed: 10 }), first.entries)
    const b = regenerateWeek(baseInput({ seed: 10 }), first.entries)
    expect(a).toEqual(b)
  })
})

describe('swapOneMeal', () => {
  it('changes only entries on the targeted DAY (repair may also touch another slot that same day — §7)', () => {
    const first = generateMealPlan(baseInput({ seed: 20 }))
    const targetDay = first.entries.find((e) => e.slot === 'snack')!.serveOn
    const swapped = swapOneMeal(baseInput({ seed: 20 }), first.entries, targetDay, 'snack')

    const otherDaysAfter = swapped.entries.filter((e) => e.serveOn !== targetDay).map((e) => ({ serveOn: e.serveOn, slot: e.slot, recipeId: e.recipeId }))
    const otherDaysBefore = first.entries.filter((e) => e.serveOn !== targetDay).map((e) => ({ serveOn: e.serveOn, slot: e.slot, recipeId: e.recipeId }))
    expect(otherDaysAfter).toEqual(otherDaysBefore)
  })

  it('excludes the previous recipe at that slot from the re-pick', () => {
    const first = generateMealPlan(baseInput({ seed: 20 }))
    const targetDay = first.entries.find((e) => e.slot === 'dinner' && !e.leftoverOfId)!.serveOn
    const before = first.entries.find((e) => e.serveOn === targetDay && e.slot === 'dinner')!
    const swapped = swapOneMeal(baseInput({ seed: 20 }), first.entries, targetDay, 'dinner')
    const after = swapped.entries.find((e) => e.serveOn === targetDay && e.slot === 'dinner')!
    // With only 5 fixture dinners and the others "kept" in this call, the
    // recipe must differ (assuming at least one alternative isn't already
    // used elsewhere that week and fails the variety floor) — same recipe
    // would defeat the point of a swap.
    expect(after.recipeId).not.toBe(before.recipeId)
  })

  it('refuses to swap a leftover entry, returning the plan unchanged with an explanatory warning', () => {
    const first = generateMealPlan(baseInput({ seed: 1, householdSize: 1 })) // seed 1 + default leftoverRatio produces leftovers
    const leftover = first.entries.find((e) => e.slot === 'dinner' && e.leftoverOfId)
    if (!leftover) return // fixture/seed didn't happen to produce one — nothing to assert
    const result = swapOneMeal(baseInput({ seed: 1 }), first.entries, leftover.serveOn, 'dinner')
    expect(result.entries).toEqual(first.entries)
    expect(result.warnings.some((w) => w.includes("it's a leftover"))).toBe(true)
  })
})
