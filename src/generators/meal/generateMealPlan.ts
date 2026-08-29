import type { MealPlan, MealPlanEntry, MealSlot, UserRecipeFeedback } from '@/types/domain'

import { hashSeed } from '../shared/rng'
import { allocateSlotTargets, type DailyTargets } from './allocate'
import { assembleWeek } from './assemble'
import { DAYS_PER_WEEK, DEFAULT_LEFTOVER_RATIO, planActiveSlots, planDinnerLeftovers } from './grid'
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
  mealsPerDay: number
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

  const { slots: activeSlots, warnings: slotWarnings } = planActiveSlots(input.mealsPerDay)
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

  const dinnerDayPlan = planDinnerLeftovers(input.seed, input.leftoverRatio ?? DEFAULT_LEFTOVER_RATIO)
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
 * against everything else held fixed, then repairs only that day. Every
 * other entry from `previousEntries` — locked or not — is passed through
 * as a held-fixed entry for this call only; that's what makes the scope
 * "just this slot," not a statement that they've become permanently
 * locked in the plan itself.
 *
 * "repairs only that day" means exactly that — DAY, not slot: repair.ts's
 * own steps 2/3 can swap the day's snack or lunch to absorb whatever
 * macro shift the new pick just introduced (§7), which is a real,
 * intended side effect, not a bug. Swapping the lunch can legitimately
 * change that same day's snack too; it will never touch a different day.
 *

 * Known limitation, called out rather than silently mishandled: if the
 * swapped slot is a fresh dinner with a leftover elsewhere in the week,
 * that leftover entry still references the OLD recipe — propagating a
 * swap forward to its leftover isn't implemented yet (see TASKS.md).
 * Swapping a leftover entry itself is refused outright for the same
 * reason: there's nothing coherent to re-score it against once it's
 * decoupled from its parent.
 */
export function swapOneMeal(
  input: GenerateMealPlanInput,
  previousEntries: readonly MealPlanEntry[],
  serveOn: string,
  slot: MealSlot,
  swapCount = 1,
): GenerateMealPlanResult {
  const warnings: string[] = []
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

  if (target && previousEntries.some((e) => e.leftoverOfId === target.id)) {
    warnings.push(
      `swapping ${serveOn} ${slot} does not update its leftover elsewhere in the week — that entry will still reference the old recipe (known limitation, see TASKS.md)`,
    )
  }

  const keepEntries = previousEntries.filter((e) => !(e.serveOn === serveOn && e.slot === slot))
  const newSeed = hashSeed(input.seed, 'swap', serveOn, slot, swapCount)
  const excludedRecipeIds = new Set([...(input.excludedRecipeIds ?? []), ...(target ? [target.recipeId] : [])])

  const result = generateMealPlan({
    ...input,
    seed: newSeed,
    lockedEntries: keepEntries,
    excludedRecipeIds,
    onlyRepairDays: new Set([serveOn]),
  })

  return { ...result, warnings: [...warnings, ...result.warnings] }
}
