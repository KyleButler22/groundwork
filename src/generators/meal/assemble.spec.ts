import { describe, expect, it } from 'vitest'

import { testMealLibrary, testRecipes } from '@/generators/__fixtures__/testMealLibrary'
import type { MealPlanEntry, UserRecipeFeedback } from '@/types/domain'

import { allocateSlotTargets } from './allocate'
import { assembleWeek, isWeekendDate, withinCookTimeCeiling, type AssembleInput } from './assemble'
import { DAYS_PER_WEEK, planActiveSlots, planDinnerLeftovers } from './grid'
import { meetsVarietyFloor } from './scoring'

const WEEK_STARTS_ON = '2026-08-31' // a Monday — days 5,6 (Sat,Sun) are the weekend

function baseInput(overrides: Partial<AssembleInput> = {}): AssembleInput {
  const { slots } = planActiveSlots(['breakfast', 'lunch', 'dinner', 'snack'])
  return {
    pool: testRecipes,
    library: testMealLibrary,
    activeSlots: slots,
    slotTargets: allocateSlotTargets({ kcalTarget: 1930, proteinG: 180, carbG: 200, fatG: 60 }, slots),
    dinnerDayPlan: planDinnerLeftovers(1, 0), // no leftovers by default, so most tests reason about one slot at a time
    weekStartsOn: WEEK_STARTS_ON,
    householdSize: 1,
    cookTimeCeilingMinutes: null,
    feedbackByRecipeId: new Map<string, UserRecipeFeedback>(),
    seed: 1,
    ...overrides,
  }
}

describe('isWeekendDate / withinCookTimeCeiling', () => {
  it('identifies Saturday and Sunday as the weekend', () => {
    expect(isWeekendDate('2026-08-31')).toBe(false) // Mon
    expect(isWeekendDate('2026-09-04')).toBe(false) // Fri
    expect(isWeekendDate('2026-09-05')).toBe(true) // Sat
    expect(isWeekendDate('2026-09-06')).toBe(true) // Sun
  })

  it('never caps a weekend day, no matter the ceiling', () => {
    const recipe = testMealLibrary.recipeById.get('egg-fried-rice')! // 10 prep + 55 cook = 65 min
    expect(withinCookTimeCeiling(recipe, '2026-09-05', 15)).toBe(true)
  })

  it('caps a weekday recipe over the ceiling', () => {
    const recipe = testMealLibrary.recipeById.get('egg-fried-rice')!
    expect(withinCookTimeCeiling(recipe, '2026-08-31', 25)).toBe(false)
    expect(withinCookTimeCeiling(recipe, '2026-08-31', 65)).toBe(true)
  })

  it('applies no ceiling at all when null', () => {
    const recipe = testMealLibrary.recipeById.get('egg-fried-rice')!
    expect(withinCookTimeCeiling(recipe, '2026-08-31', null)).toBe(true)
  })
})

describe('assembleWeek', () => {
  it('fills every active slot for all 7 days when the pool supports it', () => {
    const { entries } = assembleWeek(baseInput())
    const bySlot = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 }
    for (const e of entries) bySlot[e.slot]++
    expect(bySlot).toEqual({ breakfast: 7, lunch: 7, dinner: 7, snack: 7 })
  })

  it('is deterministic for a given seed', () => {
    const a = assembleWeek(baseInput({ seed: 42 }))
    const b = assembleWeek(baseInput({ seed: 42 }))
    expect(a).toEqual(b)
  })

  it('respects the variety floor across dinners unless a relaxation warning was logged for that day', () => {
    const { entries, warnings } = assembleWeek(baseInput({ seed: 5 })) // baseInput's leftoverRatio is 0 -> all 7 days are fresh, dayIndex === array index once sorted
    const dinners = entries.filter((e) => e.slot === 'dinner' && !e.leftoverOfId).sort((a, b) => a.serveOn.localeCompare(b.serveOn))
    const planned = new Set<string>()
    dinners.forEach((entry, dayIndex) => {
      const relaxedThisDay = warnings.some((w) => w.startsWith(`day ${dayIndex} dinner`) && w.includes('variety floor'))
      if (!relaxedThisDay) {
        expect(meetsVarietyFloor(testMealLibrary, entry.recipeId, planned)).toBe(true)
      }
      for (const id of testMealLibrary.nonStapleIngredientIdsByRecipe.get(entry.recipeId) ?? []) planned.add(id)
    })
  })

  it('rotates breakfast through at most BREAKFAST_ROTATION_SIZE distinct recipes, exempt from the repeat penalty', () => {
    const { entries } = assembleWeek(baseInput())
    const breakfasts = entries.filter((e) => e.slot === 'breakfast')
    expect(breakfasts).toHaveLength(DAYS_PER_WEEK)
    const distinct = new Set(breakfasts.map((e) => e.recipeId))
    expect(distinct.size).toBeLessThanOrEqual(3)
    expect(distinct.size).toBeGreaterThan(1) // the fixture has 3 breakfast candidates — rotation should use more than 1
  })

  it('creates a leftover entry that copies its parent\'s recipe and servings', () => {
    const dinnerDayPlan = planDinnerLeftovers(1, 0.4)
    const { entries } = assembleWeek(baseInput({ dinnerDayPlan }))
    const leftovers = entries.filter((e) => e.slot === 'dinner' && e.leftoverOfId)
    expect(leftovers.length).toBeGreaterThan(0)
    for (const leftover of leftovers) {
      const parent = entries.find((e) => e.id === leftover.leftoverOfId)!
      expect(parent).toBeDefined()
      expect(leftover.recipeId).toBe(parent.recipeId)
      expect(leftover.servings).toBe(parent.servings)
    }
  })

  it('never schedules an over-cook-time-ceiling recipe on a weekday dinner', () => {
    const { entries } = assembleWeek(baseInput({ cookTimeCeilingMinutes: 25, seed: 3 }))
    for (const entry of entries.filter((e) => e.slot === 'dinner')) {
      if (isWeekendDate(entry.serveOn)) continue
      const recipe = testMealLibrary.recipeById.get(entry.recipeId)!
      expect(recipe.prepMinutes + recipe.cookMinutes).toBeLessThanOrEqual(25)
    }
  })

  it('scales servings by household size', () => {
    const solo = assembleWeek(baseInput({ householdSize: 1, seed: 9 }))
    const family = assembleWeek(baseInput({ householdSize: 4, seed: 9 }))
    const soloDinner = solo.entries.find((e) => e.slot === 'dinner' && e.serveOn === WEEK_STARTS_ON)!
    const familyDinner = family.entries.find((e) => e.slot === 'dinner' && e.serveOn === WEEK_STARTS_ON)!
    expect(familyDinner.recipeId).toBe(soloDinner.recipeId) // same scoring inputs otherwise -> same pick
    expect(familyDinner.servings).toBeCloseTo(soloDinner.servings * 4, 6)
  })

  it('keeps a locked entry verbatim and folds it into the running overlap/repeat state', () => {
    const locked: MealPlanEntry = {
      id: 'locked-1',
      mealPlanId: 'draft-plan',
      serveOn: WEEK_STARTS_ON,
      slot: 'dinner',
      recipeId: 'chicken-stir-fry',
      servings: 1,
      isLocked: true,
      leftoverOfId: null,
    }
    const { entries } = assembleWeek(baseInput({ lockedEntries: [locked] }))
    const day0Dinner = entries.find((e) => e.serveOn === WEEK_STARTS_ON && e.slot === 'dinner')!
    expect(day0Dinner).toEqual(locked)
    // chicken-stir-fry must not be picked again elsewhere as a FRESH dinner this week.
    const otherFreshDinners = entries.filter((e) => e.slot === 'dinner' && e.serveOn !== WEEK_STARTS_ON && !e.leftoverOfId)
    expect(otherFreshDinners.every((e) => e.recipeId !== 'chicken-stir-fry')).toBe(true)
  })
})
