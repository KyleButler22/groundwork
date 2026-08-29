import type { MealPlanEntry, MealSlot } from '@/types/domain'

import { addDays } from './dateMath'
import { DAYS_PER_WEEK } from './grid'
import type { MealLibrary } from './library'
import { SERVING_SCALE_MAX, SERVING_SCALE_MIN } from './scoring'

/**
 * Asserted before persisting, not after — same discipline as
 * ../workout/validate.ts, and for the same reason: a generator that CAN
 * emit a broken plan eventually will. Scoped to what should be
 * STRUCTURALLY impossible given filter.ts/assemble.ts's own logic
 * (allergens, diet tags, duplicate slots, orphaned leftovers, an
 * out-of-range serving count) — not to the SOFT constraints
 * (dislikes, skill ceiling, cook time) that docs/mealgen.md §1 allows to
 * be deliberately relaxed; flagging those here would just be noise on top
 * of the warning filterWithRelaxation already produced for exactly that.
 */
export interface Violation {
  code: string
  message: string
  serveOn?: string
  slot?: MealSlot
}

export interface ValidationInput {
  entries: readonly MealPlanEntry[]
  library: MealLibrary
  userAllergenIds: ReadonlySet<number>
  userDietTagIds: ReadonlySet<number>
  householdSize: number
  activeSlots: readonly MealSlot[]
  weekStartsOn: string
}

export function validateMealPlan(input: ValidationInput): Violation[] {
  const violations: Violation[] = []
  const householdSize = Math.max(1, input.householdSize)
  const entryById = new Map(input.entries.map((e) => [e.id, e]))
  const seenSlotKeys = new Set<string>()

  for (const entry of input.entries) {
    const key = `${entry.serveOn}|${entry.slot}`
    if (seenSlotKeys.has(key)) {
      violations.push({ code: 'duplicate_slot', message: `more than one entry for ${entry.serveOn} ${entry.slot}`, serveOn: entry.serveOn, slot: entry.slot })
    }
    seenSlotKeys.add(key)

    const recipe = input.library.recipeById.get(entry.recipeId)
    if (!recipe) {
      violations.push({ code: 'unknown_recipe', message: `entry ${entry.id} references unknown recipe "${entry.recipeId}"`, serveOn: entry.serveOn, slot: entry.slot })
      continue
    }

    const allergens = input.library.allergensByRecipe.get(recipe.id) ?? new Set<number>()
    for (const allergenId of input.userAllergenIds) {
      if (allergens.has(allergenId)) {
        violations.push({
          code: 'allergen_violation',
          message: `"${recipe.title}" on ${entry.serveOn} ${entry.slot} contains a user allergen (id ${allergenId})`,
          serveOn: entry.serveOn,
          slot: entry.slot,
        })
      }
    }

    const dietTags = input.library.dietTagsByRecipe.get(recipe.id) ?? new Set<number>()
    for (const required of input.userDietTagIds) {
      if (!dietTags.has(required)) {
        violations.push({
          code: 'diet_violation',
          message: `"${recipe.title}" on ${entry.serveOn} ${entry.slot} is missing required diet tag (id ${required})`,
          serveOn: entry.serveOn,
          slot: entry.slot,
        })
        break // one mention per entry is enough, not one per missing tag
      }
    }

    // Leftover entries are exempt: they represent one night's portion of
    // an already-scaled batch, not an independent scale decision.
    if (!entry.leftoverOfId) {
      const min = SERVING_SCALE_MIN * householdSize - 0.01 // small epsilon for round2's rounding
      const max = SERVING_SCALE_MAX * householdSize + 0.01
      if (entry.servings < min || entry.servings > max) {
        violations.push({
          code: 'servings_out_of_range',
          message: `"${recipe.title}" on ${entry.serveOn} ${entry.slot} has ${entry.servings} servings, expected ${min.toFixed(2)}-${max.toFixed(2)}`,
          serveOn: entry.serveOn,
          slot: entry.slot,
        })
      }
    }

    if (entry.leftoverOfId && !entryById.has(entry.leftoverOfId)) {
      violations.push({
        code: 'leftover_orphan',
        message: `entry ${entry.id} claims to be a leftover of ${entry.leftoverOfId}, which isn't in this plan`,
        serveOn: entry.serveOn,
        slot: entry.slot,
      })
    }
  }

  for (let dayIndex = 0; dayIndex < DAYS_PER_WEEK; dayIndex++) {
    const serveOn = addDays(input.weekStartsOn, dayIndex)
    for (const slot of input.activeSlots) {
      if (!seenSlotKeys.has(`${serveOn}|${slot}`)) {
        violations.push({ code: 'missing_slot', message: `no entry for ${serveOn} ${slot} (an active slot for this plan)`, serveOn, slot })
      }
    }
  }

  return violations
}
