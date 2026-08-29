import type { Recipe, RecipeRating, UserRecipeFeedback } from '@/types/domain'

import { daysBetween } from './dateMath'
import type { MealLibrary } from './library'

/**
 * docs/mealgen.md §4-5. The scoring weights themselves are NOT given
 * numeric values in the doc (only the §5 variety floor is a tuned,
 * measured number) — DEFAULT_WEIGHTS below is this generator's own
 * tuning, same status as e.g. ../workout/timeBudget.ts's warm-up/buffer
 * constants: a documented judgment call, not a transcription of the spec.
 */
export interface ScoringWeights {
  macro: number
  overlap: number
  preference: number
  recency: number
  repeat: number
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  macro: 1.0, // dominant — hitting the target is the point of the slot
  overlap: 0.3, // rewards reusing what's already bought, never enough to beat a real macro win
  preference: 0.2, // a nudge toward 'loved', not a trump card
  recency: 0.5, // meaningful but not absolute — a great macro fit can still outweigh "served 10 days ago"
  repeat: 1.0, // same order of magnitude as macro fit: an exact repeat should rarely win against any other legal option
}

/** docs/mealgen.md §6: "clamp to 0.75-1.5x — beyond that, portions stop
 *  being believable." */
export const SERVING_SCALE_MIN = 0.75
export const SERVING_SCALE_MAX = 1.5

/** The serving-scale factor assemble.ts would actually use to hit a kcal
 *  target, clamped to the range above. Scoring uses this SAME clamped
 *  scale (not the recipe's raw per-serving numbers) so a recipe already
 *  achievable via legal scaling scores near-perfectly, while one that
 *  would need an illegal scale still shows the honest residual error
 *  after the best LEGAL scale — exactly what assembly would actually
 *  serve, not a discarded intermediate number. */
export function bestAchievableScale(recipeKcalPerServing: number, targetKcal: number): number {
  if (recipeKcalPerServing <= 0) return 1
  const raw = targetKcal / recipeKcalPerServing
  return Math.min(SERVING_SCALE_MAX, Math.max(SERVING_SCALE_MIN, raw))
}

/** Normalised distance from target, protein weighted double — "hardest
 *  macro to hit, matters most to the outcome; calories are easy to
 *  correct later with a serving tweak" (docs/mealgen.md §4). */
export function macroFit(scaledKcal: number, scaledProtein: number, targetKcal: number, targetProtein: number): number {
  const d = 0.5 * (Math.abs(scaledKcal - targetKcal) / targetKcal) + 1.0 * (Math.abs(scaledProtein - targetProtein) / targetProtein)
  return Math.max(0, 1 - d)
}

/** Σ(1 - is_pantry_staple) over the intersection of the recipe's
 *  ingredients and what's already planned, ÷ the recipe's total ingredient
 *  count (docs/mealgen.md §4) — staples contribute nothing to the
 *  numerator (their `1 - is_pantry_staple` term is 0), so tracking only
 *  non-staple ids in `plannedNonStaple` gives the same result without
 *  needing the full planned set. */
export function overlapValue(library: MealLibrary, recipeId: string, plannedNonStaple: ReadonlySet<string>): number {
  const allLines = library.ingredientsByRecipe.get(recipeId) ?? []
  if (allLines.length === 0) return 0
  const nonStaple = library.nonStapleIngredientIdsByRecipe.get(recipeId) ?? new Set<string>()
  let sharedCount = 0
  for (const id of nonStaple) if (plannedNonStaple.has(id)) sharedCount++
  return sharedCount / allLines.length
}

/** How many of the recipe's non-staple ingredients are NOT already
 *  planned — what docs/mealgen.md §5's variety floor gates on. */
export function newIngredientCount(library: MealLibrary, recipeId: string, plannedNonStaple: ReadonlySet<string>): number {
  const nonStaple = library.nonStapleIngredientIdsByRecipe.get(recipeId) ?? new Set<string>()
  let newCount = 0
  for (const id of nonStaple) if (!plannedNonStaple.has(id)) newCount++
  return newCount
}

/** "the curve is flat from floor 0 to floor 2, then falls off a cliff...
 *  set the variety floor at 2" — docs/mealgen.md §5, measured against both
 *  the synthetic model and (scripts/verify-corpus-overlap.mjs) the real
 *  200-recipe corpus. Dinners only — see that section's own caveat. */
export const VARIETY_FLOOR = 2

export function meetsVarietyFloor(library: MealLibrary, recipeId: string, plannedNonStaple: ReadonlySet<string>, floor: number = VARIETY_FLOOR): boolean {
  return newIngredientCount(library, recipeId, plannedNonStaple) >= floor
}

/** Exponential decay from last_served_on, ~3-week time constant. Null
 *  (never served) decays to the floor immediately — no penalty. */
export function recency(lastServedOn: string | null, referenceDate: string): number {
  if (lastServedOn === null) return 0
  const days = daysBetween(lastServedOn, referenceDate)
  if (days < 0) return 0 // defensive: a future-dated lastServedOn shouldn't occur, but treat as "not recent" rather than reward it
  return Math.exp(-days / 21)
}

export function preferenceScore(rating: RecipeRating | null | undefined): number {
  // 'never' recipes are excluded entirely by filter.ts before scoring ever
  // runs — this only ever sees 'loved', 'ok', or no feedback at all.
  return rating === 'loved' ? 1 : 0
}

export interface ScoringContext {
  library: MealLibrary
  targetKcal: number
  targetProteinG: number
  /** Non-staple ingredient ids already committed elsewhere in the week. */
  plannedNonStaple: ReadonlySet<string>
  /** Recipe ids already used elsewhere in the week — pass an empty set for
   *  a slot type that's deliberately exempt from the repeat penalty (the
   *  breakfast rotation, docs/mealgen.md §2). */
  usedThisWeek: ReadonlySet<string>
  feedbackByRecipeId: ReadonlyMap<string, UserRecipeFeedback>
  /** The week's Monday (or whatever weekStartsOn is) — recency measures
   *  from here, not wall-clock "now", keeping this pure like every other
   *  generator function (see ../workout/generatePlan.ts's header on
   *  promotion.ts's explicit `now` parameter for the same discipline). */
  referenceDate: string
  weights: ScoringWeights
}

export function scoreCandidate(recipe: Recipe, ctx: ScoringContext): number {
  const scale = bestAchievableScale(recipe.kcalPerServing, ctx.targetKcal)
  const fit = macroFit(recipe.kcalPerServing * scale, recipe.proteinPerServing * scale, ctx.targetKcal, ctx.targetProteinG)
  const overlap = overlapValue(ctx.library, recipe.id, ctx.plannedNonStaple)
  const feedback = ctx.feedbackByRecipeId.get(recipe.id)
  const pref = preferenceScore(feedback?.rating ?? null)
  const rec = recency(feedback?.lastServedOn ?? null, ctx.referenceDate)
  const repeat = ctx.usedThisWeek.has(recipe.id) ? 1 : 0

  return (
    ctx.weights.macro * fit +
    ctx.weights.overlap * overlap +
    ctx.weights.preference * pref -
    ctx.weights.recency * rec -
    ctx.weights.repeat * repeat
  )
}

/** Picks the highest-scoring candidate, breaking a true tie (within a
 *  tiny epsilon — real floating-point ties happen often here: two recipes
 *  with identical macros and zero feedback/overlap score identically)
 *  deterministically via `rng`, same convention as
 *  ../workout/library.ts's lateralOf. Without this, a tie always resolves
 *  by array order regardless of seed, and "regenerate" would never change
 *  a tied slot's outcome. */
export function pickBestScored<T>(candidates: readonly T[], score: (item: T) => number, rng: () => number): T {
  const scored = candidates.map((item) => ({ item, score: score(item) }))
  const best = Math.max(...scored.map((s) => s.score))
  const EPS = 1e-9
  const tied = scored.filter((s) => s.score >= best - EPS)
  return tied[Math.floor(rng() * tied.length)].item
}
