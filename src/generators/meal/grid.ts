import type { MealPlanEntry, MealSlot } from '@/types/domain'

import { rngFor } from '../shared/rng'
import { daysBetween } from './dateMath'

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

// Ranked by docs/mealgen.md §3's table, highest share first — purely a
// canonical ORDER now (see planActiveSlots below), not a priority list for
// dropping slots: which slots are active is the caller's explicit choice
// (intake's per-slot toggles, see StepKitchen.vue), not derived from a
// count. Still used to give ActiveSlotsResult.slots a stable, predictable
// order regardless of what order the caller's selection happened to list
// them in.
const SLOT_RANK: MealSlot[] = ['dinner', 'lunch', 'breakfast', 'snack']

export interface ActiveSlotsResult {
  /** In SLOT_RANK order (dinner, lunch, breakfast, snack), not assembly
   *  order — assemble.ts decides its own fill order (§6). */
  slots: MealSlot[]
  warnings: string[]
}

/**
 * Normalizes the caller's requested slot selection (breakfast/lunch/
 * dinner/snack, any non-empty subset — see UserTargets.activeMealSlots)
 * into SLOT_RANK order, deduped. `meal_plan_entries` has
 * `unique (meal_plan_id, serve_on, slot)` over exactly these 4 values, so
 * a duplicate or unrecognised slot has nowhere meaningful to go — this
 * silently drops either rather than erroring, since TypeScript already
 * makes both cases unreachable from a real caller (only a hand-built or
 * corrupted input could trigger them).
 *
 * An EMPTY selection has nowhere to put a single meal, so it falls back
 * to dinner alone (the doc's own highest-share slot) with a warning
 * rather than generating a genuinely empty week — intake itself requires
 * at least one slot before letting the user submit, so this is a
 * defensive backstop, not the primary way "at least one" gets enforced.
 */
export function planActiveSlots(requestedSlots: readonly MealSlot[]): ActiveSlotsResult {
  const warnings: string[] = []
  const requested = new Set(requestedSlots)
  let slots = SLOT_RANK.filter((slot) => requested.has(slot))
  if (slots.length === 0) {
    warnings.push('No meal slots were selected to plan — defaulting to dinner only.')
    slots = ['dinner']
  }
  return { slots, warnings }
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

/**
 * The inverse of planDinnerLeftovers: derives the week's ACTUAL leftover
 * topology from already-materialized entries, instead of drawing a new
 * random one. swapOneMeal (generateMealPlan.ts) needs this — without it,
 * a swap would fall back to generateMealPlan's normal
 * `planDinnerLeftovers(input.seed, ...)` call, which draws a topology
 * from the NEW derived seed with no relationship to the real one. Since
 * a swap locks every dinner day except the target (and, if the target
 * has a leftover, that leftover too), nearly every other dinner day is
 * already pre-filled by the time assemble.ts's dinner loop runs — so a
 * stray "isLeftover" assignment from that unrelated fresh draw routinely
 * found a ready-made "parent" among them, silently turning what should
 * have been a freshly re-scored pick into a copy of some unrelated day's
 * dinner. Reconstructing the real topology instead means the target
 * (confirmed fresh, never a leftover — swapOneMeal refuses to swap a
 * leftover entry directly) is correctly represented as fresh here too,
 * and its own leftover (if any) is correctly represented as still
 * pointing at it — which is exactly what lets assemble.ts's ordinary
 * leftover-copy logic propagate a swap's new recipe onto its leftover
 * for free, with no special-casing in swapOneMeal itself.
 */
export function reconstructDinnerDayPlanFromEntries(entries: readonly MealPlanEntry[], weekStartsOn: string): DinnerDayPlan[] {
  const dinnerEntryByDay = new Map<number, MealPlanEntry>()
  for (const entry of entries) {
    if (entry.slot !== 'dinner') continue
    dinnerEntryByDay.set(daysBetween(weekStartsOn, entry.serveOn), entry)
  }
  const dayIndexById = new Map<string, number>()
  for (const [dayIndex, entry] of dinnerEntryByDay) dayIndexById.set(entry.id, dayIndex)

  return Array.from({ length: DAYS_PER_WEEK }, (_, dayIndex) => {
    const entry = dinnerEntryByDay.get(dayIndex)
    const parentDayIndex = entry?.leftoverOfId ? dayIndexById.get(entry.leftoverOfId) : undefined
    if (parentDayIndex !== undefined) return { dayIndex, isLeftover: true, leftoverOfDayIndex: parentDayIndex }
    return { dayIndex, isLeftover: false, leftoverOfDayIndex: null }
  })
}
