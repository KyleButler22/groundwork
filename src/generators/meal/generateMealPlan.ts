import type { MealPlan, MealPlanEntry, MealSlot, UserRecipeFeedback } from '@/types/domain'

import { hashSeed } from '../shared/rng'
import { allocateSlotTargets, type DailyTargets } from './allocate'
import { assembleWeek } from './assemble'
import { DAYS_PER_WEEK, DEFAULT_LEFTOVER_RATIO, planActiveSlots, planDinnerLeftovers, reconstructDinnerDayPlanFromEntries, type DinnerDayPlan } from './grid'
import { filterWithRelaxation, type FilterConstraints } from './filter'
import type { MealLibrary } from './library'
import { repairWeek } from './repair'
import { DEFAULT_WEIGHTS, type ScoringWeights } from './scoring'
import { validateMealPlan } from './validate'

/**
 * docs/mealgen.md, top to bottom: Filter -> Grid -> Allocate -> Assemble
 * -> Repair, then a final validate() pass — the meal-generator equivalent
 * of ../workout/generatePlan.ts. Pure function: same inputs and seed
 * always produce the same plan (§8's determinism rule), no network, no
 * wall-clock reads (`now` is an explicit parameter, same discipline as
 * ../workout/promotion.ts's own `now`).
 *
 * `plan`/`entries` ids are synthetic "draft-..." placeholders, not real
 * primary keys — same reasoning as generatePlan.ts's own header: minting
 * real ids is a persistence-layer concern this function has no business
 * owning. A future materializeMealPlan.ts (mirroring src/lib/materializePlan.ts)
 * remaps them before insert.
 */
export interface GenerateMealPlanInput {
  userId: string
  weekStartsOn: string // date, ISO yyyy-mm-dd — the week's first day
  dailyTargets: DailyTargets
  /** Which meal slots to plan at all this week — any non-empty subset of
   *  breakfast/lunch/dinner/snack, the user's explicit choice (see
   *  UserTargets.activeMealSlots), not a count. */
  activeMealSlots: readonly MealSlot[]
  householdSize: number
  cookTimeCeilingMinutes: number | null
  userAllergenIds: ReadonlySet<number>
  userDietTagIds: ReadonlySet<number>
  dislikedIngredientIds: ReadonlySet<string>
  /** Not yet collected by intake (no UI question for it) — defaults to 3
   *  (no filtering) until one exists. */
  skillCeiling?: number
  /** Keyed by recipeId. A 'never' rating here is a hard exclusion (§1); a
   *  'loved' rating is a scoring nudge (§4); lastServedOn drives recency. */
  feedbackByRecipeId: ReadonlyMap<string, UserRecipeFeedback>
  /** Extra recipes to exclude beyond feedback — e.g. a full-week regen's
   *  carried-over unlocked recipes (§9). Rarely set directly; regenerateWeek
   *  and swapOneMeal below compute this for you. */
  excludedRecipeIds?: ReadonlySet<string>
  /** Rows to keep verbatim, at their exact (serve_on, slot) — is_locked
   *  survivors of a regenerate, or (for swapOneMeal) everything except the
   *  one slot being swapped. */
  lockedEntries?: readonly MealPlanEntry[]
  library: MealLibrary
  seed: number
  regenCount?: number
  generatorVersion: string
  leftoverRatio?: number
  weights?: ScoringWeights
  onlyRepairDays?: ReadonlySet<string>
  /** Use this exact dinner leftover topology instead of drawing a new one
   *  from the seed — swapOneMeal's own fix for a real bug: with almost
   *  every dinner day locked, a fresh random draw routinely reassigned
   *  the ONE unlocked (target) day as a leftover of some unrelated
   *  already-locked day. See reconstructDinnerDayPlanFromEntries (grid.ts)
   *  and swapOneMeal's own comment below. */
  dinnerDayPlanOverride?: readonly DinnerDayPlan[]
  now: string // ISO timestamp
}

export interface GenerateMealPlanResult {
  plan: MealPlan
  entries: MealPlanEntry[]
  warnings: string[]
}

export function generateMealPlan(input: GenerateMealPlanInput): GenerateMealPlanResult {
  const weights = input.weights ?? DEFAULT_WEIGHTS
  const warnings: string[] = []
  const allRecipes = [...input.library.recipeById.values()]

  const { slots: activeSlots, warnings: slotWarnings } = planActiveSlots(input.activeMealSlots)
  warnings.push(...slotWarnings)

  const neverServeAgainRecipeIds = new Set(
    [...input.feedbackByRecipeId.values()].filter((f) => f.rating === 'never').map((f) => f.recipeId),
  )
  const filterConstraints: FilterConstraints = {
    userAllergenIds: input.userAllergenIds,
    userDietTagIds: input.userDietTagIds,
    dislikedIngredientIds: input.dislikedIngredientIds,
    skillCeiling: input.skillCeiling ?? 3,
    neverServeAgainRecipeIds,
    excludedRecipeIds: input.excludedRecipeIds ?? new Set(),
  }

  const neededCount = activeSlots.length * DAYS_PER_WEEK
  const { pool, relaxationsApplied } = filterWithRelaxation(allRecipes, input.library, filterConstraints, neededCount)
  for (const relaxation of relaxationsApplied) warnings.push(`relaxed to find enough recipes: ${relaxation}`)
  if (pool.length < activeSlots.length) {
    warnings.push(
      `only ${pool.length} matching recipe(s) found even after every relaxation — this plan will likely have empty slots; ` +
        'the corpus may not support this diet/allergen combination yet',
    )
  }

  const dinnerDayPlan = input.dinnerDayPlanOverride ?? planDinnerLeftovers(input.seed, input.leftoverRatio ?? DEFAULT_LEFTOVER_RATIO)
  const slotTargets = allocateSlotTargets(input.dailyTargets, activeSlots)

  const { entries: assembled, warnings: assembleWarnings } = assembleWeek({
    pool,
    library: input.library,
    activeSlots,
    slotTargets,
    dinnerDayPlan,
    weekStartsOn: input.weekStartsOn,
    householdSize: input.householdSize,
    cookTimeCeilingMinutes: input.cookTimeCeilingMinutes,
    feedbackByRecipeId: input.feedbackByRecipeId,
    seed: input.seed,
    lockedEntries: input.lockedEntries,
    weights,
  })
  warnings.push(...assembleWarnings)

  const { entries: repaired, warnings: repairWarnings } = repairWeek({
    entries: assembled,
    library: input.library,
    pool,
    dailyTargets: input.dailyTargets,
    slotTargets,
    weekStartsOn: input.weekStartsOn,
    householdSize: input.householdSize,
    cookTimeCeilingMinutes: input.cookTimeCeilingMinutes,
    feedbackByRecipeId: input.feedbackByRecipeId,
    seed: input.seed,
    weights,
    onlyDays: input.onlyRepairDays,
  })
  warnings.push(...repairWarnings)

  const violations = validateMealPlan({
    entries: repaired,
    library: input.library,
    userAllergenIds: input.userAllergenIds,
    userDietTagIds: input.userDietTagIds,
    householdSize: input.householdSize,
    activeSlots,
    weekStartsOn: input.weekStartsOn,
  })
  warnings.push(...violations.map((v) => `validation: ${v.code} — ${v.message}`))

  const plan: MealPlan = {
    id: 'draft-plan',
    userId: input.userId,
    weekStartsOn: input.weekStartsOn,
    kcalTarget: Math.round(input.dailyTargets.kcalTarget),
    proteinTargetG: Math.round(input.dailyTargets.proteinG),
    carbTargetG: Math.round(input.dailyTargets.carbG),
    fatTargetG: Math.round(input.dailyTargets.fatG),
    generatorVersion: input.generatorVersion,
    seed: input.seed,
    regenCount: input.regenCount ?? 0,
    status: 'active',
    createdAt: input.now,
    updatedAt: input.now,
  }

  return { plan, entries: repaired, warnings }
}

/**
 * docs/mealgen.md §9's "Regenerate week" row: new seed derived from the
 * original (`hash(seed, ++regen_count)`, never a fresh random draw, so a
 * given regen_count is always reproducible), locked entries carried
 * forward untouched, every unlocked recipe from the previous week
 * excluded ("repeating last week is the cheapest thing to give up" — §1 —
 * applies doubly to the WEEK you just explicitly asked to replace).
 */
export function regenerateWeek(
  input: GenerateMealPlanInput,
  previousEntries: readonly MealPlanEntry[],
): GenerateMealPlanResult {
  const nextRegenCount = (input.regenCount ?? 0) + 1
  const newSeed = hashSeed(input.seed, 'regen', nextRegenCount)
  const lockedEntries = previousEntries.filter((e) => e.isLocked)
  const carriedExclusions = previousEntries.filter((e) => !e.isLocked).map((e) => e.recipeId)
  const excludedRecipeIds = new Set([...(input.excludedRecipeIds ?? []), ...carriedExclusions])

  return generateMealPlan({ ...input, seed: newSeed, regenCount: nextRegenCount, lockedEntries, excludedRecipeIds })
}

/**
 * docs/mealgen.md §9's "Swap one meal" row: re-scores just that slot
 * against everything else held fixed, then repairs only that day (or
 * both affected days — see below). Every other entry from
 * `previousEntries` — locked or not — is passed through as a held-fixed
 * entry for this call only; that's what makes the scope "just this
 * slot," not a statement that they've become permanently locked in the
 * plan itself.
 *
 * "repairs only that day" means exactly that — DAY, not slot: repair.ts's
 * own steps 2/3 can swap the day's snack or lunch to absorb whatever
 * macro shift the new pick just introduced (§7), which is a real,
 * intended side effect, not a bug. Swapping the lunch can legitimately
 * change that same day's snack too; it will never touch a different day
 * (or two days, for a dinner swap that has a leftover — see below).
 *
 * Swapping a leftover entry itself is refused outright: there's nothing
 * coherent to re-score it against once it's decoupled from its parent —
 * swap that entry's own day instead.
 *
 * If the target IS a fresh dinner with a leftover elsewhere in the week,
 * the swap propagates to it for free: both the target's old (day, slot)
 * AND its leftover's (day, 'dinner') are excluded from `lockedEntries`,
 * and `dinnerDayPlanOverride` (reconstructDinnerDayPlanFromEntries)
 * preserves the real "day X is a leftover of day Y" relationship instead
 * of letting generateMealPlan draw a fresh random one from the new seed.
 * assemble.ts's ordinary leftover-copy logic then picks up the newly
 * chosen recipe on the leftover day exactly as it would during a normal
 * generation — no special-casing needed here beyond feeding it the right
 * topology. This ALSO fixes a real, independent bug that existed before
 * this propagation was added: with nearly every dinner day locked during
 * a swap, a fresh random topology routinely reassigned the one unlocked
 * (target) day as a leftover of some unrelated already-locked day,
 * silently replacing what should have been a freshly re-scored pick with
 * a copy of an unrelated day's dinner.
 */
export function swapOneMeal(
  input: GenerateMealPlanInput,
  previousEntries: readonly MealPlanEntry[],
  serveOn: string,
  slot: MealSlot,
  swapCount = 1,
): GenerateMealPlanResult {
  const target = previousEntries.find((e) => e.serveOn === serveOn && e.slot === slot)

  if (target?.leftoverOfId) {
    return {
      plan: {
        id: 'draft-plan',
        userId: input.userId,
        weekStartsOn: input.weekStartsOn,
        kcalTarget: Math.round(input.dailyTargets.kcalTarget),
        proteinTargetG: Math.round(input.dailyTargets.proteinG),
        carbTargetG: Math.round(input.dailyTargets.carbG),
        fatTargetG: Math.round(input.dailyTargets.fatG),
        generatorVersion: input.generatorVersion,
        seed: input.seed,
        regenCount: input.regenCount ?? 0,
        status: 'active',
        createdAt: input.now,
        updatedAt: input.now,
      },
      entries: [...previousEntries],
      warnings: [`cannot swap ${serveOn} ${slot}: it's a leftover of another entry, not an independent pick — swap that entry's own day instead`],
    }
  }

  const leftoverOfTarget = target ? previousEntries.find((e) => e.leftoverOfId === target.id) : undefined

  const keepEntries = previousEntries.filter((e) => {
    if (e.serveOn === serveOn && e.slot === slot) return false // the target itself
    if (leftoverOfTarget && e.id === leftoverOfTarget.id) return false // its leftover, if any — re-assembled so it picks up the new recipe
    return true
  })
  const newSeed = hashSeed(input.seed, 'swap', serveOn, slot, swapCount)
  const excludedRecipeIds = new Set([...(input.excludedRecipeIds ?? []), ...(target ? [target.recipeId] : [])])
  const onlyRepairDays = new Set([serveOn])
  if (leftoverOfTarget) onlyRepairDays.add(leftoverOfTarget.serveOn)

  const result = generateMealPlan({
    ...input,
    seed: newSeed,
    lockedEntries: keepEntries,
    excludedRecipeIds,
    dinnerDayPlanOverride: reconstructDinnerDayPlanFromEntries(previousEntries, input.weekStartsOn),
    onlyRepairDays,
  })

  return result
}

export interface ServedRecipeSummary {
  lastServedOn: string
  serveCount: number
}

/**
 * Summarizes a completed (or completing) week's entries into what should
 * be written to `user_recipe_feedback` for each recipe — the data
 * scoring.ts's `recency()` term needs and, before this existed anywhere,
 * never actually got. A recipe counts as served once per entry that uses
 * it, fresh or leftover alike (a leftover meal is still a real instance
 * of eating that food); `lastServedOn` takes the LATEST date across every
 * entry for that recipe, not just the first one found.
 *
 * Deliberately not called from generateMealPlan/regenerateWeek/swapOneMeal
 * themselves — those replace a week that mostly hasn't happened yet (the
 * whole point of "regenerate" is undoing a choice before it's cooked), so
 * writing "served" there would be wrong. It's meant for whatever caller
 * represents "this week is over, start the next one" (see
 * src/stores/mealPlan.ts's `advanceToNextWeek`).
 */
export function aggregateServedRecipes(entries: readonly MealPlanEntry[]): Map<string, ServedRecipeSummary> {
  const summaryByRecipe = new Map<string, ServedRecipeSummary>()
  for (const entry of entries) {
    const existing = summaryByRecipe.get(entry.recipeId)
    summaryByRecipe.set(entry.recipeId, {
      lastServedOn: existing && existing.lastServedOn > entry.serveOn ? existing.lastServedOn : entry.serveOn,
      serveCount: (existing?.serveCount ?? 0) + 1,
    })
  }
  return summaryByRecipe
}
