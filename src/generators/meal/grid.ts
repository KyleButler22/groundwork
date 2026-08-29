import type { MealSlot } from '@/types/domain'

import { rngFor } from '../shared/rng'

/**
 * docs/mealgen.md §2 — decides the WEEK'S SHAPE before any recipe
 * selection happens: which meal slots are active, which dinner nights are
 * fresh cooks vs. leftovers, and how many distinct breakfasts rotate.
 * assemble.ts consumes this; nothing here looks at the recipe pool.
 */

export const DAYS_PER_WEEK = 7

/** "Default to 2-3 rotating breakfast recipes" — picks 3, the top of that
 *  range, since more rotation variety costs nothing once repeats are
 *  exempt from the within-week penalty anyway (see assemble.ts). */
export const BREAKFAST_ROTATION_SIZE = 3

/** Target share of dinner slots that reuse a prior night's cook rather
 *  than cooking fresh — "tunable," per the doc; not yet exposed as a user
 *  preference (see docs/mealgen.md's open questions). */
export const DEFAULT_LEFTOVER_RATIO = 0.4

// Ranked by docs/mealgen.md §3's table, highest share first. Used both for
// the slot-share split (allocate.ts) and here, to decide which slots
// survive when mealsPerDay is below the full 4.
const SLOT_RANK: MealSlot[] = ['dinner', 'lunch', 'breakfast', 'snack']

export interface ActiveSlotsResult {
  /** In SLOT_RANK order (dinner, lunch, breakfast, snack), not assembly
   *  order — assemble.ts decides its own fill order (§6). */
  slots: MealSlot[]
  warnings: string[]
}

/**
 * `meal_plan_entries` has `unique (meal_plan_id, serve_on, slot)` over
 * only 4 possible slot values — there is no way to represent a second
 * snack on the same day without a schema change. The intake UI
 * (StepKitchen.vue) currently allows mealsPerDay up to 6; anything above 4
 * is clamped here with a warning rather than silently dropped or crashed
 * on, mirroring how ../workout/generatePlan.ts surfaces a dropped slot
 * instead of hiding it. Below 4, the highest-share slots survive first —
 * a principled rule (not a hand-picked case per count), since keeping
 * dinner before lunch before breakfast before snack is exactly what the
 * doc's own share ranking already says matters most.
 */
export function planActiveSlots(mealsPerDay: number): ActiveSlotsResult {
  const warnings: string[] = []
  let count = mealsPerDay
  if (count > SLOT_RANK.length) {
    warnings.push(
      `mealsPerDay (${mealsPerDay}) exceeds the 4 slots the schema supports per day (breakfast/lunch/dinner/snack — meal_plan_entries allows only one row per day per slot). Clamped to 4.`,
    )
    count = SLOT_RANK.length
  }
  if (count < 1) count = 1
  return { slots: SLOT_RANK.slice(0, count), warnings }
}

export interface DinnerDayPlan {
  dayIndex: number // 0-6 within the week
  isLeftover: boolean
  /** Set when isLeftover — the dayIndex whose fresh cook this reuses. */
  leftoverOfDayIndex: number | null
}

/**
 * Decides which of the week's 7 dinners are fresh cooks and which reuse a
 * recent fresh cook as a leftover — the STRUCTURE only; assemble.ts picks
 * the actual recipe for each fresh day and copies it onto its leftover.
 *
 * "a leftover sits 1-3 days after its parent cook" (food safety) is the
 * only hard rule available without a "day marked busy" concept, which
 * nothing in this schema/intake captures yet — the doc's "preferentially
 * a busy day" placement is left as a future refinement once that exists.
 */
export function planDinnerLeftovers(seed: number, leftoverRatio: number = DEFAULT_LEFTOVER_RATIO): DinnerDayPlan[] {
  const days: DinnerDayPlan[] = Array.from({ length: DAYS_PER_WEEK }, (_, dayIndex) => ({ dayIndex, isLeftover: false, leftoverOfDayIndex: null }))
  const targetLeftovers = Math.round(DAYS_PER_WEEK * leftoverRatio)
  const usedAsParent = new Set<number>()

  // Deterministic Fisher-Yates shuffle of candidate days — day 0 is never
  // a candidate (nothing earlier in the week to have cooked it fresh).
  const rng = rngFor(seed, 'meal', 'leftover-plan')
  const candidates = Array.from({ length: DAYS_PER_WEEK - 1 }, (_, i) => i + 1)
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
  }

  let assigned = 0
  for (const dayIndex of candidates) {
    if (assigned >= targetLeftovers) break
    if (usedAsParent.has(dayIndex)) continue // already serving as someone else's fresh cook — must stay fresh itself
    const parent = [1, 2, 3].map((back) => dayIndex - back).find((p) => p >= 0 && !usedAsParent.has(p) && !days[p].isLeftover)
    if (parent === undefined) continue // no valid, unclaimed fresh day within 1-3 days back
    days[dayIndex] = { dayIndex, isLeftover: true, leftoverOfDayIndex: parent }
    usedAsParent.add(parent)
    assigned++
  }

  return days
}
