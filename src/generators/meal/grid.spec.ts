import { describe, expect, it } from 'vitest'

import type { MealPlanEntry } from '@/types/domain'

import { addDays } from './dateMath'
import { DAYS_PER_WEEK, planActiveSlots, planDinnerLeftovers, reconstructDinnerDayPlanFromEntries } from './grid'

describe('planActiveSlots', () => {
  it('includes all 4 canonical slots, highest-share order, when mealsPerDay is 4', () => {
    expect(planActiveSlots(4)).toEqual({ slots: ['dinner', 'lunch', 'breakfast', 'snack'], warnings: [] })
  })

  it('keeps the highest-share slots first as the count drops', () => {
    expect(planActiveSlots(1).slots).toEqual(['dinner'])
    expect(planActiveSlots(2).slots).toEqual(['dinner', 'lunch'])
    expect(planActiveSlots(3).slots).toEqual(['dinner', 'lunch', 'breakfast'])
  })

  it('clamps above 4 with a warning, rather than crashing or silently dropping', () => {
    const result = planActiveSlots(6)
    expect(result.slots).toEqual(['dinner', 'lunch', 'breakfast', 'snack'])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/clamped/i)
  })

  it('clamps below 1 up to 1 (defensive — the UI already enforces min=1)', () => {
    expect(planActiveSlots(0).slots).toEqual(['dinner'])
  })
})

describe('planDinnerLeftovers', () => {
  it('produces exactly 7 days, each dayIndex 0-6', () => {
    const plan = planDinnerLeftovers(1, 0.4)
    expect(plan).toHaveLength(DAYS_PER_WEEK)
    expect(plan.map((d) => d.dayIndex)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('day 0 is never a leftover (nothing earlier in the week to have cooked it)', () => {
    const plan = planDinnerLeftovers(1, 0.4)
    expect(plan[0].isLeftover).toBe(false)
  })

  it('every leftover references a fresh day 1-3 days earlier', () => {
    for (const seed of [1, 2, 3, 42, 999]) {
      const plan = planDinnerLeftovers(seed, 0.4)
      for (const day of plan) {
        if (!day.isLeftover) continue
        const parent = plan[day.leftoverOfDayIndex!]
        expect(parent.isLeftover).toBe(false) // a leftover's parent must itself be fresh — no chains
        const gap = day.dayIndex - day.leftoverOfDayIndex!
        expect(gap).toBeGreaterThanOrEqual(1)
        expect(gap).toBeLessThanOrEqual(3)
      }
    }
  })

  it('no fresh day is claimed as the parent of more than one leftover', () => {
    const plan = planDinnerLeftovers(7, 0.4)
    const parents = plan.filter((d) => d.isLeftover).map((d) => d.leftoverOfDayIndex)
    expect(new Set(parents).size).toBe(parents.length)
  })

  it('targets roughly the requested leftover ratio (round(7 * ratio))', () => {
    const plan = planDinnerLeftovers(1, 0.4)
    expect(plan.filter((d) => d.isLeftover)).toHaveLength(3) // round(7*0.4) = 3
  })

  it('is deterministic for a given seed', () => {
    expect(planDinnerLeftovers(123, 0.4)).toEqual(planDinnerLeftovers(123, 0.4))
  })

  it('different seeds can produce different plans (not a fixed pattern)', () => {
    const plans = [1, 2, 3, 4, 5].map((seed) => JSON.stringify(planDinnerLeftovers(seed, 0.4)))
    expect(new Set(plans).size).toBeGreaterThan(1)
  })
})

const WEEK_STARTS_ON = '2026-08-31'

function dinnerEntry(overrides: Partial<MealPlanEntry> & Pick<MealPlanEntry, 'id' | 'serveOn'>): MealPlanEntry {
  return { mealPlanId: 'plan-1', slot: 'dinner', recipeId: 'x', servings: 1, isLocked: false, leftoverOfId: null, ...overrides }
}

describe('reconstructDinnerDayPlanFromEntries', () => {
  it('round-trips a plan produced by planDinnerLeftovers exactly, given matching entries', () => {
    const original = planDinnerLeftovers(7, 0.4)
    const entries = original.map((_day, i) => dinnerEntry({ id: `e${i}`, serveOn: addDays(WEEK_STARTS_ON, i) }))
    // Rebuild leftoverOfId links using the SAME day-index topology, since
    // the helper above only fabricates unique ids/dates, not the links.
    const idByDayIndex = new Map(entries.map((e, i) => [i, e.id]))
    const linked = entries.map((e, i) =>
      original[i].isLeftover ? { ...e, leftoverOfId: idByDayIndex.get(original[i].leftoverOfDayIndex!)! } : e,
    )

    expect(reconstructDinnerDayPlanFromEntries(linked, WEEK_STARTS_ON)).toEqual(original)
  })

  it('derives day indices from serve_on relative to weekStartsOn', () => {
    const parent = dinnerEntry({ id: 'parent', serveOn: '2026-08-31', recipeId: 'chili' })
    const leftover = dinnerEntry({ id: 'child', serveOn: '2026-09-02', recipeId: 'chili', leftoverOfId: 'parent' })
    const plan = reconstructDinnerDayPlanFromEntries([parent, leftover], WEEK_STARTS_ON)
    expect(plan[0]).toEqual({ dayIndex: 0, isLeftover: false, leftoverOfDayIndex: null })
    expect(plan[2]).toEqual({ dayIndex: 2, isLeftover: true, leftoverOfDayIndex: 0 })
  })

  it('treats a day with no dinner entry at all as fresh (not a crash)', () => {
    const plan = reconstructDinnerDayPlanFromEntries([], WEEK_STARTS_ON)
    expect(plan).toHaveLength(DAYS_PER_WEEK)
    expect(plan.every((d) => !d.isLeftover)).toBe(true)
  })

  it('falls back to fresh if leftoverOfId points at an entry that is not in the list', () => {
    const orphan = dinnerEntry({ id: 'child', serveOn: '2026-08-31', leftoverOfId: 'does-not-exist' })
    const plan = reconstructDinnerDayPlanFromEntries([orphan], WEEK_STARTS_ON)
    expect(plan[0]).toEqual({ dayIndex: 0, isLeftover: false, leftoverOfDayIndex: null })
  })
})
