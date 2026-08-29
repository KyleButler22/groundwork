import type { Recipe } from '@/types/domain'

import { hasAllergen, hasDislikedIngredient, satisfiesDiet, type MealLibrary } from './library'

/**
 * docs/mealgen.md §1. Hard constraints, producing the legal candidate pool
 * — binary, no scoring. `cook_time_ceiling` is deliberately NOT here — per
 * the doc, cook time is a per-slot constraint (a weeknight ceiling
 * shouldn't block a slow Sunday roast from being offered on Sunday), so
 * it's checked in assemble.ts against each specific day/slot instead. Any
 * relaxation of a per-slot cook-time ceiling therefore also happens there,
 * not in filterWithRelaxation below — see that function's own note.
 */
export interface FilterConstraints {
  userAllergenIds: ReadonlySet<number>
  userDietTagIds: ReadonlySet<number>
  dislikedIngredientIds: ReadonlySet<string>
  skillCeiling: number
  /** recipe_id -> true for user_recipe_feedback.rating === 'never'. */
  neverServeAgainRecipeIds: ReadonlySet<string>
  /** This run's own exclusion set — e.g. every unlocked recipe from last
   *  week, for a "regenerate week" action (docs/mealgen.md §9). */
  excludedRecipeIds: ReadonlySet<string>
}

export function filterCandidates(recipes: readonly Recipe[], library: MealLibrary, c: FilterConstraints): Recipe[] {
  return recipes.filter(
    (r) =>
      r.isActive &&
      r.difficulty <= c.skillCeiling &&
      !c.neverServeAgainRecipeIds.has(r.id) &&
      !c.excludedRecipeIds.has(r.id) &&
      !hasAllergen(library, r.id, c.userAllergenIds) &&
      satisfiesDiet(library, r.id, c.userDietTagIds) &&
      !hasDislikedIngredient(library, r.id, c.dislikedIngredientIds),
  )
}

export interface RelaxationResult {
  pool: Recipe[]
  /** Which relaxation steps are ACTIVE in the returned pool, in the fixed
   *  order docs/mealgen.md §1 specifies — for surfacing on screen ("we
   *  ignored your dislikes this week to find enough recipes"), not merely
   *  which steps were tried. Empty when the unrelaxed pool was already
   *  big enough. */
  relaxationsApplied: Array<'dropped_exclusions' | 'relaxed_difficulty_cap' | 'ignored_dislikes'>
}

/**
 * docs/mealgen.md §1's relaxation ladder: detect a pool too thin for real
 * selection freedom (target ~3x the recipes actually needed) and relax in
 * a FIXED order, allergens and diet tags never touched at any step — that
 * guarantee holds structurally here (neither field appears in any relaxed
 * attempt below), not just by convention.
 */
export function filterWithRelaxation(recipes: readonly Recipe[], library: MealLibrary, constraints: FilterConstraints, neededCount: number): RelaxationResult {
  const threshold = neededCount * 3

  const attempts: FilterConstraints[] = [
    constraints,
    { ...constraints, excludedRecipeIds: new Set() },
    { ...constraints, excludedRecipeIds: new Set(), skillCeiling: 3 },
    { ...constraints, excludedRecipeIds: new Set(), skillCeiling: 3, dislikedIngredientIds: new Set() },
  ]

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]
    const pool = filterCandidates(recipes, library, attempt)
    const isLastAttempt = i === attempts.length - 1
    if (pool.length >= threshold || isLastAttempt) {
      const relaxationsApplied: RelaxationResult['relaxationsApplied'] = []
      if (attempt.excludedRecipeIds.size < constraints.excludedRecipeIds.size) relaxationsApplied.push('dropped_exclusions')
      if (attempt.skillCeiling > constraints.skillCeiling) relaxationsApplied.push('relaxed_difficulty_cap')
      if (attempt.dislikedIngredientIds.size < constraints.dislikedIngredientIds.size) relaxationsApplied.push('ignored_dislikes')
      return { pool, relaxationsApplied }
    }
  }

  // Unreachable — the loop's last iteration always satisfies isLastAttempt.
  return { pool: filterCandidates(recipes, library, constraints), relaxationsApplied: [] }
}
