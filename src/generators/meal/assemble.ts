import type { MealPlanEntry, MealSlot, Recipe, UserRecipeFeedback } from '@/types/domain'

import { rngFor } from '../shared/rng'
import type { SlotTarget } from './allocate'
import { addDays } from './dateMath'
import { BREAKFAST_ROTATION_SIZE, DAYS_PER_WEEK, type DinnerDayPlan } from './grid'
import type { MealLibrary } from './library'
import { bestAchievableScale, DEFAULT_WEIGHTS, meetsVarietyFloor, pickBestScored, scoreCandidate, type ScoringWeights } from './scoring'

/**
 * docs/mealgen.md §6. Greedy fill, order matters: dinners carry the
 * biggest macro share and the tightest cook-time constraint; breakfasts
 * are a fixed rotation decided once; snacks go last because they're the
 * flex that can absorb whatever macro gap the rest of the day left
 * behind. Each slot's pick is scored, then its servings are SCALED to fit
 * the target (0.75-1.5x) rather than searched for harder — "does more for
 * accuracy than any clever search" per the doc.
 */

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function isWeekendDate(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay() // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6
}

/**
 * "cook_time_ceiling is deliberately not [a global filter] — cook time is
 * a per-slot constraint" (docs/mealgen.md §1). Applied to dinner and lunch
 * only — the two slots this app's "cook time" question is actually about
 * (StepKitchen.vue's copy: "Weeknight cook-time ceiling"); breakfast/snack
 * are treated as inherently quick. Weekends are never capped — "a busier
 * Sunday roast can still take longer... this is just for a normal
 * Tuesday" is the doc's own example, applied here with the single ceiling
 * value intake actually collects (see docs/mealgen.md's open question on
 * a separate weekend ceiling — not resolved, not needed to honour this
 * specific example with what's already captured).
 */
export function withinCookTimeCeiling(recipe: Recipe, serveOn: string, ceilingMinutes: number | null): boolean {
  if (ceilingMinutes === null) return true
  if (isWeekendDate(serveOn)) return true
  return recipe.prepMinutes + recipe.cookMinutes <= ceilingMinutes
}

export interface AssembleInput {
  pool: readonly Recipe[]
  library: MealLibrary
  activeSlots: readonly MealSlot[]
  slotTargets: readonly SlotTarget[]
  dinnerDayPlan: readonly DinnerDayPlan[]
  weekStartsOn: string
  householdSize: number
  cookTimeCeilingMinutes: number | null
  feedbackByRecipeId: ReadonlyMap<string, UserRecipeFeedback>
  seed: number
  /** Entries to keep verbatim — `is_locked` rows surviving a "regenerate
   *  week" (docs/mealgen.md §9). Their recipes are folded into the running
   *  overlap/repeat state before anything else is chosen, and their exact
   *  (day, slot) is never re-assigned. */
  lockedEntries?: readonly MealPlanEntry[]
  weights?: ScoringWeights
}

export interface AssembleResult {
  entries: MealPlanEntry[]
  warnings: string[]
}

export function assembleWeek(input: AssembleInput): AssembleResult {
  const weights = input.weights ?? DEFAULT_WEIGHTS
  const warnings: string[] = []
  const householdSize = Math.max(1, input.householdSize)
  const targetBySlot = new Map(input.slotTargets.map((t) => [t.slot, t]))
  const poolBySlot = new Map<MealSlot, Recipe[]>()
  for (const slot of input.activeSlots) {
    poolBySlot.set(
      slot,
      input.pool.filter((r) => input.library.mealSlotsByRecipe.get(r.id)?.has(slot)),
    )
  }

  const entries: MealPlanEntry[] = []
  const filledSlotKeys = new Set<string>() // `${dayIndex}|${slot}`
  const plannedNonStaple = new Set<string>()
  const usedThisWeek = new Set<string>()
  // dayIndex -> that day's fresh (non-leftover) dinner entry, keyed so a
  // later leftover day can copy its recipe AND its servings — servings
  // means "eaten this entry" uniformly now (see MealPlanEntry's own
  // comment in domain.ts), so no separate doubling/halving bookkeeping is
  // needed here: a leftover just reuses its parent's `.servings` as-is.
  const freshDinnerEntryByDay = new Map<number, MealPlanEntry>()

  for (const locked of input.lockedEntries ?? []) {
    entries.push(locked)
    const dayIndex = Math.round((Date.parse(`${locked.serveOn}T00:00:00Z`) - Date.parse(`${input.weekStartsOn}T00:00:00Z`)) / 86_400_000)
    filledSlotKeys.add(`${dayIndex}|${locked.slot}`)
    usedThisWeek.add(locked.recipeId)
    for (const id of input.library.nonStapleIngredientIdsByRecipe.get(locked.recipeId) ?? []) plannedNonStaple.add(id)
    if (locked.slot === 'dinner' && !locked.leftoverOfId) freshDinnerEntryByDay.set(dayIndex, locked)
  }

  function scoreOf(recipe: Recipe, target: SlotTarget, usedSet: ReadonlySet<string>): number {
    return scoreCandidate(recipe, {
      library: input.library,
      targetKcal: target.kcal,
      targetProteinG: target.proteinG,
      plannedNonStaple,
      usedThisWeek: usedSet,
      feedbackByRecipeId: input.feedbackByRecipeId,
      referenceDate: input.weekStartsOn,
      weights,
    })
  }

  function commit(dayIndex: number, slot: MealSlot, recipe: Recipe, servings: number, leftoverOfId: string | null): MealPlanEntry {
    const entry: MealPlanEntry = {
      id: `draft-meal-d${dayIndex}-${slot}`,
      mealPlanId: 'draft-plan',
      serveOn: addDays(input.weekStartsOn, dayIndex),
      slot,
      recipeId: recipe.id,
      servings: round2(servings),
      isLocked: false,
      leftoverOfId,
    }
    entries.push(entry)
    filledSlotKeys.add(`${dayIndex}|${slot}`)
    if (!leftoverOfId) {
      usedThisWeek.add(recipe.id)
      for (const id of input.library.nonStapleIngredientIdsByRecipe.get(recipe.id) ?? []) plannedNonStaple.add(id)
    }
    return entry
  }

  // ── dinners first ────────────────────────────────────────────────────
  const dinnerTarget = targetBySlot.get('dinner')
  if (dinnerTarget) {
    for (const dayPlan of input.dinnerDayPlan) {
      const { dayIndex } = dayPlan
      if (filledSlotKeys.has(`${dayIndex}|dinner`)) continue

      if (dayPlan.isLeftover) {
        const parent = freshDinnerEntryByDay.get(dayPlan.leftoverOfDayIndex!)
        if (parent) {
          commit(dayIndex, 'dinner', input.library.recipeById.get(parent.recipeId)!, parent.servings, parent.id)
          continue
        }
        warnings.push(`day ${dayIndex} dinner: planned as a leftover of day ${dayPlan.leftoverOfDayIndex}, but that day has no fresh cook — falling back to a fresh pick`)
        // falls through to the fresh path below
      }

      const serveOn = addDays(input.weekStartsOn, dayIndex)
      let candidates = (poolBySlot.get('dinner') ?? []).filter(
        (r) => withinCookTimeCeiling(r, serveOn, input.cookTimeCeilingMinutes) && meetsVarietyFloor(input.library, r.id, plannedNonStaple),
      )
      if (candidates.length === 0) {
        candidates = (poolBySlot.get('dinner') ?? []).filter((r) => withinCookTimeCeiling(r, serveOn, input.cookTimeCeilingMinutes))
        if (candidates.length > 0) warnings.push(`day ${dayIndex} dinner: no recipe met the variety floor — relaxed for this slot only`)
      }
      if (candidates.length === 0) {
        candidates = poolBySlot.get('dinner') ?? []
        if (candidates.length > 0) warnings.push(`day ${dayIndex} dinner: no recipe fit the cook-time ceiling — relaxed for this slot only`)
      }
      if (candidates.length === 0) {
        warnings.push(`day ${dayIndex} dinner: no eligible recipe found at all — slot left empty`)
        continue
      }

      const rng = rngFor(input.seed, 'meal', 'assemble', dayIndex, 'dinner')
      const chosen = pickBestScored(candidates, (r) => scoreOf(r, dinnerTarget, usedThisWeek), rng)
      const scale = bestAchievableScale(chosen.kcalPerServing, dinnerTarget.kcal)
      const entry = commit(dayIndex, 'dinner', chosen, scale * householdSize, null)
      freshDinnerEntryByDay.set(dayIndex, entry)
    }
  }

  // ── lunches ──────────────────────────────────────────────────────────
  const lunchTarget = targetBySlot.get('lunch')
  if (lunchTarget && input.activeSlots.includes('lunch')) {
    for (let dayIndex = 0; dayIndex < DAYS_PER_WEEK; dayIndex++) {
      if (filledSlotKeys.has(`${dayIndex}|lunch`)) continue
      const serveOn = addDays(input.weekStartsOn, dayIndex)
      const candidates = (poolBySlot.get('lunch') ?? []).filter((r) => withinCookTimeCeiling(r, serveOn, input.cookTimeCeilingMinutes))
      if (candidates.length === 0) {
        warnings.push(`day ${dayIndex} lunch: no eligible recipe found — slot left empty`)
        continue
      }
      const rng = rngFor(input.seed, 'meal', 'assemble', dayIndex, 'lunch')
      const chosen = pickBestScored(candidates, (r) => scoreOf(r, lunchTarget, usedThisWeek), rng)
      const scale = bestAchievableScale(chosen.kcalPerServing, lunchTarget.kcal)
      commit(dayIndex, 'lunch', chosen, scale * householdSize, null)
    }
  }

  // ── breakfasts: a small rotation, exempt from the repeat penalty ─────
  const breakfastTarget = targetBySlot.get('breakfast')
  if (breakfastTarget && input.activeSlots.includes('breakfast')) {
    const candidates = poolBySlot.get('breakfast') ?? []
    if (candidates.length === 0) {
      warnings.push('breakfast: no eligible recipe found for the whole week — slot left empty every day')
    } else {
      const noRepeatPenalty = new Set<string>() // exempt: see docs/mealgen.md §2
      const scored = candidates
        .map((r) => ({ recipe: r, score: scoreOf(r, breakfastTarget, noRepeatPenalty) }))
        .sort((a, b) => b.score - a.score)
      const rotationSize = Math.min(BREAKFAST_ROTATION_SIZE, scored.length)
      // Deterministic tie-break at the rotation's cutoff boundary, same
      // spirit as pickBestScored — without it, two recipes tied at the
      // Nth-best score would always resolve by array order regardless of
      // seed, which would make "regenerate" never change the rotation.
      const EPS = 1e-9
      const cutoffScore = scored[rotationSize - 1].score
      const aboveCutoff = scored.filter((s) => s.score > cutoffScore + EPS)
      const atCutoff = scored.filter((s) => Math.abs(s.score - cutoffScore) <= EPS)
      const rng = rngFor(input.seed, 'meal', 'breakfast-rotation')
      const shuffledAtCutoff = [...atCutoff]
      for (let i = shuffledAtCutoff.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[shuffledAtCutoff[i], shuffledAtCutoff[j]] = [shuffledAtCutoff[j], shuffledAtCutoff[i]]
      }
      const rotation = [...aboveCutoff, ...shuffledAtCutoff].slice(0, rotationSize).map((s) => s.recipe)

      for (let dayIndex = 0; dayIndex < DAYS_PER_WEEK; dayIndex++) {
        if (filledSlotKeys.has(`${dayIndex}|breakfast`)) continue
        const chosen = rotation[dayIndex % rotation.length]
        const scale = bestAchievableScale(chosen.kcalPerServing, breakfastTarget.kcal)
        // Deliberately does not update plannedNonStaple/usedThisWeek — the
        // rotation is chosen independently and exempt from the repeat
        // penalty; docs/mealgen.md §5 also scopes the overlap tuning to
        // dinners only, so breakfast intentionally stays out of that
        // shared state in both directions.
        const entry: MealPlanEntry = {
          id: `draft-meal-d${dayIndex}-breakfast`,
          mealPlanId: 'draft-plan',
          serveOn: addDays(input.weekStartsOn, dayIndex),
          slot: 'breakfast',
          recipeId: chosen.id,
          servings: round2(scale * householdSize),
          isLocked: false,
          leftoverOfId: null,
        }
        entries.push(entry)
        filledSlotKeys.add(`${dayIndex}|breakfast`)
      }
    }
  }

  // ── snacks last: the flex slot that absorbs the day's macro gap ─────
  const snackTarget = targetBySlot.get('snack')
  if (snackTarget && input.activeSlots.includes('snack')) {
    for (let dayIndex = 0; dayIndex < DAYS_PER_WEEK; dayIndex++) {
      if (filledSlotKeys.has(`${dayIndex}|snack`)) continue
      const candidates = poolBySlot.get('snack') ?? []
      if (candidates.length === 0) {
        warnings.push(`day ${dayIndex} snack: no eligible recipe found — slot left empty`)
        continue
      }
      const rng = rngFor(input.seed, 'meal', 'assemble', dayIndex, 'snack')
      const chosen = pickBestScored(candidates, (r) => scoreOf(r, snackTarget, usedThisWeek), rng)
      const scale = bestAchievableScale(chosen.kcalPerServing, snackTarget.kcal)
      commit(dayIndex, 'snack', chosen, scale * householdSize, null)
    }
  }

  return { entries, warnings }
}
