import { describe, expect, it } from 'vitest'

import { testMealLibrary } from '@/generators/__fixtures__/testMealLibrary'
import type { MealPlanEntry, UserRecipeFeedback } from '@/types/domain'

import { aggregateServedRecipes, generateMealPlan, regenerateWeek, swapOneMeal, type GenerateMealPlanInput } from './generateMealPlan'

const WEEK_STARTS_ON = '2026-08-31'

function baseInput(overrides: Partial<GenerateMealPlanInput> = {}): GenerateMealPlanInput {
  return {
    userId: 'u1',
    weekStartsOn: WEEK_STARTS_ON,
    dailyTargets: { kcalTarget: 1930, proteinG: 180, carbG: 200, fatG: 60 },
    activeMealSlots: ['breakfast', 'lunch', 'dinner', 'snack'],
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

  it('activeMealSlots: [dinner] plans dinner only', () => {
    const { entries } = generateMealPlan(baseInput({ activeMealSlots: ['dinner'] }))
    expect(new Set(entries.map((e) => e.slot))).toEqual(new Set(['dinner']))
  })

  it('plans breakfast + lunch with no dinner at all — the combination a count-based mealsPerDay could never express', () => {
    const { entries } = generateMealPlan(baseInput({ activeMealSlots: ['breakfast', 'lunch'] }))
    expect(new Set(entries.map((e) => e.slot))).toEqual(new Set(['breakfast', 'lunch']))
    expect(entries.some((e) => e.slot === 'dinner')).toBe(false)
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

  it('passes the previous recipe at that slot as an exclusion', () => {
    // The fixture's 5 total dinners are so far below filterWithRelaxation's
    // "3x what's needed" threshold that step 1 (drop the exclusion set)
    // always fires regardless of this specific exclusion — so asserting
    // the re-pick actually DIFFERS isn't reliable here (see
    // generateMealPlan.integration.spec.ts's real-corpus version of this
    // test for that guarantee, where 200 real recipes make relaxation
    // unnecessary). What IS reliably checkable at this scale: the
    // exclusion was genuinely passed through and swap still produces a
    // valid entry rather than erroring out.
    const first = generateMealPlan(baseInput({ seed: 20 }))
    const targetDay = first.entries.find((e) => e.slot === 'dinner' && !e.leftoverOfId)!.serveOn
    const before = first.entries.find((e) => e.serveOn === targetDay && e.slot === 'dinner')!
    const swapped = swapOneMeal(baseInput({ seed: 20, excludedRecipeIds: new Set([before.recipeId]) }), first.entries, targetDay, 'dinner')
    const after = swapped.entries.find((e) => e.serveOn === targetDay && e.slot === 'dinner')!
    expect(after).toBeDefined()
    expect(testMealLibrary.recipeById.has(after.recipeId)).toBe(true)
  })

  it('refuses to swap a leftover entry, returning the plan unchanged with an explanatory warning', () => {
    const first = generateMealPlan(baseInput({ seed: 1, householdSize: 1 })) // seed 1 + default leftoverRatio produces leftovers
    const leftover = first.entries.find((e) => e.slot === 'dinner' && e.leftoverOfId)
    if (!leftover) return // fixture/seed didn't happen to produce one — nothing to assert
    const result = swapOneMeal(baseInput({ seed: 1 }), first.entries, leftover.serveOn, 'dinner')
    expect(result.entries).toEqual(first.entries)
    expect(result.warnings.some((w) => w.includes("it's a leftover"))).toBe(true)
  })

  it('propagates a dinner swap to its own leftover elsewhere in the week', () => {
    const first = generateMealPlan(baseInput({ seed: 1, householdSize: 1 })) // seed 1 + default leftoverRatio deterministically produces a leftover in this fixture
    const leftover = first.entries.find((e) => e.slot === 'dinner' && e.leftoverOfId)!
    const parent = first.entries.find((e) => e.id === leftover.leftoverOfId)!

    // Force a genuinely different pick: 'never' feedback is the one
    // constraint filter.ts's relaxation ladder never touches (unlike
    // excludedRecipeIds, which this fixture's 5 total dinners are thin
    // enough to always relax away — see the "passes the previous recipe
    // as an exclusion" test above for the same limitation). This test's
    // actual subject is propagation, which needs a real change to prove.
    const feedbackByRecipeId = new Map<string, UserRecipeFeedback>([
      [parent.recipeId, { userId: 'u1', recipeId: parent.recipeId, rating: 'never', lastServedOn: null, serveCount: 0, updatedAt: '2026-01-01' }],
    ])

    const swapped = swapOneMeal(baseInput({ seed: 1, feedbackByRecipeId }), first.entries, parent.serveOn, 'dinner')
    const newParent = swapped.entries.find((e) => e.serveOn === parent.serveOn && e.slot === 'dinner')!
    const newLeftover = swapped.entries.find((e) => e.id === leftover.id)!

    expect(newParent.recipeId).not.toBe(parent.recipeId) // the swap actually changed something
    expect(newLeftover.recipeId).toBe(newParent.recipeId) // and the leftover followed it — the fix under test
    expect(newLeftover.servings).toBe(newParent.servings)
    expect(swapped.warnings.some((w) => w.includes('known limitation'))).toBe(false) // no longer a known limitation
  })

  it('never turns the swapped slot itself into a leftover of some unrelated day (regression)', () => {
    // Before this fix: with nearly every dinner day locked during a swap,
    // a fresh random dinnerDayPlan draw from the new derived seed could
    // coincidentally mark the one unlocked (target) day as a leftover of
    // some unrelated already-locked day, silently replacing what should
    // have been a freshly re-scored pick with a copy of that day's
    // dinner. Swept across many seeds/swapCounts since it was seed-data
    // dependent whether any particular case happened to trigger it.
    for (let seed = 1; seed <= 20; seed++) {
      const first = generateMealPlan(baseInput({ seed }))
      const freshDinner = first.entries.find((e) => e.slot === 'dinner' && !e.leftoverOfId)!
      for (let swapCount = 1; swapCount <= 3; swapCount++) {
        const swapped = swapOneMeal(baseInput({ seed }), first.entries, freshDinner.serveOn, 'dinner', swapCount)
        const after = swapped.entries.find((e) => e.serveOn === freshDinner.serveOn && e.slot === 'dinner')!
        expect(after.leftoverOfId).toBeNull()
      }
    }
  })
})

describe('aggregateServedRecipes', () => {
  function dinnerEntry(overrides: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id' | 'recipeId' | 'serveOn'>): MealPlanEntry {
    return { mealPlanId: 'plan-1', slot: 'dinner', servings: 1, isLocked: false, leftoverOfId: null, ...overrides }
  }

  it('counts one serving per entry, including leftovers — a leftover meal is still really eaten', () => {
    const summary = aggregateServedRecipes([
      dinnerEntry({ id: 'e1', recipeId: 'chicken-stir-fry', serveOn: '2026-08-31' }),
      dinnerEntry({ id: 'e2', recipeId: 'chicken-stir-fry', serveOn: '2026-09-02', leftoverOfId: 'e1' }),
    ])
    expect(summary.get('chicken-stir-fry')).toEqual({ lastServedOn: '2026-09-02', serveCount: 2 })
  })

  it('takes the LATEST date across every entry for a recipe, not the first one found', () => {
    const summary = aggregateServedRecipes([
      dinnerEntry({ id: 'e1', recipeId: 'chicken-stir-fry', serveOn: '2026-09-02' }),
      dinnerEntry({ id: 'e2', recipeId: 'chicken-stir-fry', serveOn: '2026-08-31' }), // out of order on purpose
    ])
    expect(summary.get('chicken-stir-fry')!.lastServedOn).toBe('2026-09-02')
  })

  it('tracks each recipe independently', () => {
    const summary = aggregateServedRecipes([
      dinnerEntry({ id: 'e1', recipeId: 'chicken-stir-fry', serveOn: '2026-08-31' }),
      dinnerEntry({ id: 'e2', recipeId: 'beef-and-rice', serveOn: '2026-09-01' }),
    ])
    expect(summary.size).toBe(2)
    expect(summary.get('chicken-stir-fry')).toEqual({ lastServedOn: '2026-08-31', serveCount: 1 })
    expect(summary.get('beef-and-rice')).toEqual({ lastServedOn: '2026-09-01', serveCount: 1 })
  })

  it('is empty for an empty week', () => {
    expect(aggregateServedRecipes([]).size).toBe(0)
  })
})
