import { describe, expect, it } from 'vitest'

import { allocateSlotTargets } from './allocate'

describe('allocateSlotTargets', () => {
  // docs/mealgen.md §3's worked example: 1930 kcal / 180g protein across
  // all 4 slots -> breakfast 482/45, lunch 579/54, dinner 676/63, snack
  // 193/18. The doc's table hand-rounds 482.5 down and 675.5 up so the
  // four DISPLAYED integers sum exactly back to 1930 — a display-time
  // choice, not something this function should replicate; it asserts the
  // precise fractional shares instead (0.25/0.30/0.35/0.10 of the total).
  it('reproduces the doc\'s worked example\'s exact fractional shares', () => {
    const targets = allocateSlotTargets({ kcalTarget: 1930, proteinG: 180, carbG: 200, fatG: 60 }, ['breakfast', 'lunch', 'dinner', 'snack'])
    const bySlot = Object.fromEntries(targets.map((t) => [t.slot, t]))

    expect(bySlot.breakfast.kcal).toBeCloseTo(482.5, 6)
    expect(bySlot.breakfast.proteinG).toBeCloseTo(45, 6)
    expect(bySlot.lunch.kcal).toBeCloseTo(579, 6)
    expect(bySlot.lunch.proteinG).toBeCloseTo(54, 6)
    expect(bySlot.dinner.kcal).toBeCloseTo(675.5, 6)
    expect(bySlot.dinner.proteinG).toBeCloseTo(63, 6)
    expect(bySlot.snack.kcal).toBeCloseTo(193, 6)
    expect(bySlot.snack.proteinG).toBeCloseTo(18, 6)
  })

  it('always sums back to the daily target across whichever slots are active', () => {
    for (const slots of [['dinner'], ['dinner', 'lunch'], ['dinner', 'lunch', 'breakfast'], ['dinner', 'lunch', 'breakfast', 'snack']] as const) {
      const targets = allocateSlotTargets({ kcalTarget: 2000, proteinG: 150, carbG: 200, fatG: 70 }, slots)
      const totalKcal = targets.reduce((sum, t) => sum + t.kcal, 0)
      const totalProtein = targets.reduce((sum, t) => sum + t.proteinG, 0)
      expect(totalKcal).toBeCloseTo(2000, 6)
      expect(totalProtein).toBeCloseTo(150, 6)
    }
  })

  it('gives dinner-only 100% of the daily target when it is the only active slot', () => {
    const targets = allocateSlotTargets({ kcalTarget: 2000, proteinG: 150, carbG: 200, fatG: 70 }, ['dinner'])
    expect(targets).toEqual([{ slot: 'dinner', kcal: 2000, proteinG: 150, carbG: 200, fatG: 70 }])
  })

  it('keeps dinner and lunch proportional to each other when breakfast/snack drop out', () => {
    // dinner:lunch base shares are 35:30 -> dinner should still be exactly 35/65 of the total.
    const targets = allocateSlotTargets({ kcalTarget: 1000, proteinG: 100, carbG: 100, fatG: 100 }, ['dinner', 'lunch'])
    const dinner = targets.find((t) => t.slot === 'dinner')!
    expect(dinner.kcal).toBeCloseTo((1000 * 35) / 65, 6)
  })
})
