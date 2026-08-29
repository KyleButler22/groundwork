import { describe, expect, it } from 'vitest'

import { testMealLibrary } from '@/generators/__fixtures__/testMealLibrary'
import type { MealPlanEntry, UserRecipeFeedback } from '@/types/domain'

import type { DailyTargets, SlotTarget } from './allocate'
import { repairWeek, type RepairInput } from './repair'

const WEEK_STARTS_ON = '2026-08-31'

const SLOT_TARGETS: SlotTarget[] = [
  { slot: 'breakfast', kcal: 300, proteinG: 20, carbG: 40, fatG: 10 },
  { slot: 'lunch', kcal: 500, proteinG: 40, carbG: 50, fatG: 15 },
  { slot: 'dinner', kcal: 600, proteinG: 50, carbG: 60, fatG: 20 },
  { slot: 'snack', kcal: 200, proteinG: 10, carbG: 20, fatG: 5 },
]
const DAILY_TARGET: DailyTargets = { kcalTarget: 1600, proteinG: 120, carbG: 170, fatG: 50 }

function entry(overrides: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'slot' | 'recipeId' | 'servings'>): MealPlanEntry {
  return {
    id: `${overrides.slot}-entry`,
    mealPlanId: 'draft-plan',
    serveOn: WEEK_STARTS_ON,
    isLocked: false,
    leftoverOfId: null,
    ...overrides,
  }
}

function baseInput(entries: MealPlanEntry[], overrides: Partial<RepairInput> = {}): RepairInput {
  return {
    entries,
    library: testMealLibrary,
    pool: [...testMealLibrary.recipeById.values()],
    dailyTargets: DAILY_TARGET,
    slotTargets: SLOT_TARGETS,
    weekStartsOn: WEEK_STARTS_ON,
    householdSize: 1,
    cookTimeCeilingMinutes: null,
    feedbackByRecipeId: new Map<string, UserRecipeFeedback>(),
    seed: 1,
    ...overrides,
  }
}

// A day at exactly the targets: oatmeal(300/12) + chicken-salad(350/30) + chicken-stir-fry(500/40) + apple-slices(100/1)
// = 1250 kcal / 83g protein — well short of 1600/120, forcing repair to act.
function underTargetDay(): MealPlanEntry[] {
  return [
    entry({ slot: 'breakfast', recipeId: 'oatmeal', servings: 1 }),
    entry({ slot: 'lunch', recipeId: 'chicken-salad', servings: 1 }),
    entry({ slot: 'dinner', recipeId: 'chicken-stir-fry', servings: 1 }),
    entry({ slot: 'snack', recipeId: 'apple-slices', servings: 1 }),
  ]
}

describe('repairWeek', () => {
  it('leaves an already-within-tolerance day untouched', () => {
    // oatmeal(300/12) + beef-and-rice(600/45) + peanut-chicken(550/42) + apple-slices(100/1)
    // = 1550 kcal / 100g protein exactly — set the target to match exactly
    // so this is guaranteed within tolerance regardless of the % math.
    const entries = [
      entry({ slot: 'breakfast', recipeId: 'oatmeal', servings: 1 }),
      entry({ slot: 'lunch', recipeId: 'beef-and-rice', servings: 1 }),
      entry({ slot: 'dinner', recipeId: 'peanut-chicken', servings: 1 }),
      entry({ slot: 'snack', recipeId: 'apple-slices', servings: 1 }),
    ]
    // Scoped to just this one constructed day — repairWeek always checks
    // all 7 days of the week, and the other 6 have no entries at all here
    // (an artifact of this being a single-day fixture, not a real week),
    // which would otherwise show up as 6 unrelated "empty day" warnings.
    const result = repairWeek(
      baseInput(entries, { dailyTargets: { kcalTarget: 1550, proteinG: 100, carbG: 170, fatG: 50 }, onlyDays: new Set([WEEK_STARTS_ON]) }),
    )
    expect(result.entries).toEqual(entries)
    expect(result.warnings).toEqual([])
  })

  it('rescales the snack first — the cheapest, least disruptive fix', () => {
    const entries = underTargetDay()
    const result = repairWeek(baseInput(entries))
    const snack = result.entries.find((e) => e.slot === 'snack')!
    const others = result.entries.filter((e) => e.slot !== 'snack')
    expect(snack.servings).not.toBe(1) // rescaled
    expect(others).toEqual(entries.filter((e) => e.slot !== 'snack')) // nothing else touched by step 1
  })

  it('never rescales or swaps a locked entry', () => {
    const entries = underTargetDay().map((e) => (e.slot === 'snack' ? { ...e, isLocked: true } : e))
    const result = repairWeek(baseInput(entries))
    const snack = result.entries.find((e) => e.slot === 'snack')!
    expect(snack.servings).toBe(1) // untouched despite being the usual first choice
  })

  it('caps its clamp at the same 0.75-1.5x range as assembly, scaled by household size', () => {
    // A day so far under target that an unclamped rescale would demand an
    // absurd serving count — the snack should still land at exactly 1.5x.
    const entries = [
      entry({ slot: 'breakfast', recipeId: 'oatmeal', servings: 1 }),
      entry({ slot: 'lunch', recipeId: 'chicken-salad', servings: 1 }),
      entry({ slot: 'dinner', recipeId: 'chicken-stir-fry', servings: 1 }),
      entry({ slot: 'snack', recipeId: 'apple-slices', servings: 1 }),
    ]
    const result = repairWeek(baseInput(entries, { dailyTargets: { kcalTarget: 5000, proteinG: 400, carbG: 500, fatG: 150 } }))
    const snack = result.entries.find((e) => e.slot === 'snack')!
    expect(snack.servings).toBe(1.5)
  })

  it('accepts and flags a day that stays out of tolerance after every intervention', () => {
    // apple-slices is the only snack and lunch has no cheaper alternative
    // than chicken-salad in this fixture — a large enough target gap can't
    // be closed even after rescale + both swaps.
    const entries = underTargetDay()
    const result = repairWeek(baseInput(entries, { dailyTargets: { kcalTarget: 9000, proteinG: 700, carbG: 900, fatG: 300 } }))
    expect(result.warnings.some((w) => w.includes('accepted as approximate'))).toBe(true)
  })

  it('is deterministic for a given seed', () => {
    const entries = underTargetDay()
    const a = repairWeek(baseInput(entries, { seed: 7 }))
    const b = repairWeek(baseInput(entries, { seed: 7 }))
    expect(a).toEqual(b)
  })

  it('honours onlyDays, leaving every other day\'s entries completely untouched', () => {
    const day0 = underTargetDay()
    const day1 = underTargetDay().map((e) => ({ ...e, id: `${e.id}-d1`, serveOn: '2026-09-01' }))
    const result = repairWeek(baseInput([...day0, ...day1], { onlyDays: new Set([WEEK_STARTS_ON]) }))
    expect(result.entries.filter((e) => e.serveOn === '2026-09-01')).toEqual(day1)
    expect(result.entries.filter((e) => e.serveOn === WEEK_STARTS_ON)).not.toEqual(day0)
  })
})
