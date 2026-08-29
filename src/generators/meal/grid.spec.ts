import { describe, expect, it } from 'vitest'

import { DAYS_PER_WEEK, planActiveSlots, planDinnerLeftovers } from './grid'

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
