import type { MealPlanEntry, MealSlot, Recipe, UserRecipeFeedback } from '@/types/domain'

import { rngFor } from '../shared/rng'
import type { DailyTargets, SlotTarget } from './allocate'
import { round2, withinCookTimeCeiling } from './assemble'
import { addDays } from './dateMath'
import { DAYS_PER_WEEK } from './grid'
import type { MealLibrary } from './library'
import { bestAchievableScale, DEFAULT_WEIGHTS, pickBestScored, scoreCandidate, SERVING_SCALE_MAX, SERVING_SCALE_MIN, type ScoringWeights } from './scoring'

/**
 * docs/mealgen.md §7. Greedy assembly drifts off the daily target; this
 * checks each day and fixes what's outside tolerance, cheapest
 * intervention first, capped at 3 real attempts per day (re-scale, swap
 * snack, swap lunch) before accepting the drift and flagging it — "a day
 * 9% off target is fine and unnoticed; a generator that hangs is not fine
 * and is noticed by everyone."
 */

const KCAL_TOLERANCE = 0.07
const PROTEIN_TOLERANCE = 0.1

// Rescale priority, most-flexible first: snack exists to absorb error,
// lunch is next-least disruptive, breakfast is a rotation pick but
// touching one day's portion doesn't disturb the rotation itself, and
// dinner — the biggest, most constrained slot — is the last resort.
const RESCALE_PRIORITY: MealSlot[] = ['snack', 'lunch', 'breakfast', 'dinner']

function dayTotals(entries: readonly MealPlanEntry[], library: MealLibrary, serveOn: string): { kcal: number; proteinG: number } {
  let kcal = 0
  let proteinG = 0
  for (const e of entries) {
    if (e.serveOn !== serveOn) continue
    const recipe = library.recipeById.get(e.recipeId)
    if (!recipe) continue
    kcal += recipe.kcalPerServing * e.servings
    proteinG += recipe.proteinPerServing * e.servings
  }
  return { kcal, proteinG }
}

function isOutOfTolerance(actual: { kcal: number; proteinG: number }, target: DailyTargets): boolean {
  const kcalOff = target.kcalTarget > 0 && Math.abs(actual.kcal - target.kcalTarget) / target.kcalTarget > KCAL_TOLERANCE
  const proteinOff = target.proteinG > 0 && Math.abs(actual.proteinG - target.proteinG) / target.proteinG > PROTEIN_TOLERANCE
  return kcalOff || proteinOff
}

/** Step 1: free and invisible — change how much of an already-chosen
 *  recipe is served, never which recipe. Tries slots in RESCALE_PRIORITY
 *  order and adjusts the first non-locked one found; a leftover entry is
 *  a legal target too (rescaling it only changes how much of that night's
 *  already-cooked food is eaten, not what was bought). */
function rescaleLeastConstrained(entries: readonly MealPlanEntry[], library: MealLibrary, serveOn: string, target: DailyTargets, householdSize: number): MealPlanEntry[] {
  for (const slot of RESCALE_PRIORITY) {
    const idx = entries.findIndex((e) => e.serveOn === serveOn && e.slot === slot)
    if (idx === -1 || entries[idx].isLocked) continue
    const entry = entries[idx]
    const recipe = library.recipeById.get(entry.recipeId)
    if (!recipe || recipe.kcalPerServing <= 0) continue

    const totals = dayTotals(entries, library, serveOn)
    const othersKcal = totals.kcal - recipe.kcalPerServing * entry.servings
    const neededServings = (target.kcalTarget - othersKcal) / recipe.kcalPerServing
    const clamped = Math.min(SERVING_SCALE_MAX * householdSize, Math.max(SERVING_SCALE_MIN * householdSize, neededServings))

    const next = [...entries]
    next[idx] = { ...entry, servings: round2(clamped) }
    return next
  }
  return [...entries] // nothing non-locked to rescale that day
}

function collectPlannedNonStaple(entries: readonly MealPlanEntry[], library: MealLibrary): Set<string> {
  const set = new Set<string>()
  for (const e of entries) {
    if (e.leftoverOfId) continue
    for (const id of library.nonStapleIngredientIdsByRecipe.get(e.recipeId) ?? []) set.add(id)
  }
  return set
}

/** Steps 2/3: replace a slot's recipe entirely with the best-scoring
 *  in-pool alternative (excluding the current pick). Returns null when
 *  there's nothing to swap (slot missing, locked, or no other candidate
 *  tagged for it) rather than a no-op array, so the caller can tell the
 *  difference between "tried and found nothing better" and "already
 *  fine." */
function trySwapSlot(
  entries: readonly MealPlanEntry[],
  serveOn: string,
  slot: MealSlot,
  slotTarget: SlotTarget | undefined,
  library: MealLibrary,
  pool: readonly Recipe[],
  ctx: { cookTimeCeilingMinutes: number | null; feedbackByRecipeId: ReadonlyMap<string, UserRecipeFeedback>; weekStartsOn: string; householdSize: number; seed: number; weights: ScoringWeights },
): MealPlanEntry[] | null {
  if (!slotTarget) return null
  const idx = entries.findIndex((e) => e.serveOn === serveOn && e.slot === slot)
  if (idx === -1 || entries[idx].isLocked) return null
  const current = entries[idx]

  const candidates = pool.filter(
    (r) => r.id !== current.recipeId && library.mealSlotsByRecipe.get(r.id)?.has(slot) && withinCookTimeCeiling(r, serveOn, ctx.cookTimeCeilingMinutes),
  )
  if (candidates.length === 0) return null

  const others = entries.filter((e) => e.id !== current.id)
  const usedThisWeek = new Set(others.map((e) => e.recipeId))
  const plannedNonStaple = collectPlannedNonStaple(others, library)
  const rng = rngFor(ctx.seed, 'meal', 'repair', serveOn, slot)
  const chosen = pickBestScored(
    candidates,
    (r) =>
      scoreCandidate(r, {
        library,
        targetKcal: slotTarget.kcal,
        targetProteinG: slotTarget.proteinG,
        plannedNonStaple,
        usedThisWeek,
        feedbackByRecipeId: ctx.feedbackByRecipeId,
        referenceDate: ctx.weekStartsOn,
        weights: ctx.weights,
      }),
    rng,
  )

  const scale = bestAchievableScale(chosen.kcalPerServing, slotTarget.kcal)
  const next = [...entries]
  next[idx] = { ...current, recipeId: chosen.id, servings: round2(scale * ctx.householdSize) }
  return next
}

export interface RepairInput {
  entries: MealPlanEntry[]
  library: MealLibrary
  pool: readonly Recipe[]
  dailyTargets: DailyTargets
  slotTargets: readonly SlotTarget[]
  weekStartsOn: string
  householdSize: number
  cookTimeCeilingMinutes: number | null
  feedbackByRecipeId: ReadonlyMap<string, UserRecipeFeedback>
  seed: number
  weights?: ScoringWeights
  /** Restrict repair to just these serve_on dates — used by
   *  generateMealPlan.ts's swapOneMeal() ("repair only that day",
   *  docs/mealgen.md §9), which shouldn't perturb the rest of an
   *  otherwise-untouched week. Omit to repair the whole week normally. */
  onlyDays?: ReadonlySet<string>
}

export interface RepairResult {
  entries: MealPlanEntry[]
  warnings: string[]
}

export function repairWeek(input: RepairInput): RepairResult {
  const weights = input.weights ?? DEFAULT_WEIGHTS
  const slotTargetBySlot = new Map(input.slotTargets.map((t) => [t.slot, t]))
  const householdSize = Math.max(1, input.householdSize)
  let entries = [...input.entries]
  const warnings: string[] = []

  for (let dayIndex = 0; dayIndex < DAYS_PER_WEEK; dayIndex++) {
    const serveOn = addDays(input.weekStartsOn, dayIndex)
    if (input.onlyDays && !input.onlyDays.has(serveOn)) continue
    if (!isOutOfTolerance(dayTotals(entries, input.library, serveOn), input.dailyTargets)) continue

    // Step 1.
    entries = rescaleLeastConstrained(entries, input.library, serveOn, input.dailyTargets, householdSize)
    if (!isOutOfTolerance(dayTotals(entries, input.library, serveOn), input.dailyTargets)) continue

    // Step 2.
    const afterSnackSwap = trySwapSlot(entries, serveOn, 'snack', slotTargetBySlot.get('snack'), input.library, input.pool, {
      cookTimeCeilingMinutes: input.cookTimeCeilingMinutes,
      feedbackByRecipeId: input.feedbackByRecipeId,
      weekStartsOn: input.weekStartsOn,
      householdSize,
      seed: input.seed,
      weights,
    })
    if (afterSnackSwap) {
      entries = afterSnackSwap
      if (!isOutOfTolerance(dayTotals(entries, input.library, serveOn), input.dailyTargets)) continue
    }

    // Step 3.
    const afterLunchSwap = trySwapSlot(entries, serveOn, 'lunch', slotTargetBySlot.get('lunch'), input.library, input.pool, {
      cookTimeCeilingMinutes: input.cookTimeCeilingMinutes,
      feedbackByRecipeId: input.feedbackByRecipeId,
      weekStartsOn: input.weekStartsOn,
      householdSize,
      seed: input.seed,
      weights,
    })
    if (afterLunchSwap) {
      entries = afterLunchSwap
      if (!isOutOfTolerance(dayTotals(entries, input.library, serveOn), input.dailyTargets)) continue
    }

    // Step 4: accept and flag rather than loop further.
    warnings.push(`${serveOn}: macro drift outside tolerance after repair (rescale, snack swap, and lunch swap all tried) — accepted as approximate`)
  }

  return { entries, warnings }
}
