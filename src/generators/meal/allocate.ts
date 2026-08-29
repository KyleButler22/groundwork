import type { MealSlot } from '@/types/domain'

/**
 * docs/mealgen.md §3. Splits daily targets across slots BEFORE selecting
 * anything — turns one hard problem (hit 1,930 kcal across 4 meals) into
 * several easy ones.
 */

/** breakfast 25 / lunch 30 / dinner 35 / snack 10 — the doc's worked-
 *  example table. When the user hasn't asked for all 4 slots (grid.ts's
 *  planActiveSlots — an explicit per-slot choice, not a count), these are
 *  rescaled to still sum to 100% across whichever slots remain, in
 *  whatever combination — see allocateSlotTargets. */
const BASE_SHARE: Record<MealSlot, number> = { breakfast: 25, lunch: 30, dinner: 35, snack: 10 }

export interface DailyTargets {
  kcalTarget: number
  proteinG: number
  carbG: number
  fatG: number
}

export interface SlotTarget {
  slot: MealSlot
  kcal: number
  proteinG: number
  carbG: number
  fatG: number
}

export function allocateSlotTargets(daily: DailyTargets, activeSlots: readonly MealSlot[]): SlotTarget[] {
  const totalShare = activeSlots.reduce((sum, slot) => sum + BASE_SHARE[slot], 0)
  return activeSlots.map((slot) => {
    const fraction = totalShare > 0 ? BASE_SHARE[slot] / totalShare : 1 / activeSlots.length
    return {
      slot,
      kcal: daily.kcalTarget * fraction,
      proteinG: daily.proteinG * fraction,
      carbG: daily.carbG * fraction,
      fatG: daily.fatG * fraction,
    }
  })
}
