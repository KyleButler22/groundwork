import type { GroceryItem, GroceryList, MealPlan, MealPlanEntry } from '@/types/domain'
import type { BuildGroceryListResult, GenerateMealPlanResult } from '@/generators/meal'

/**
 * The meal-generation equivalent of materializePlan.ts — same reasoning,
 * same boundary: generateMealPlan()/buildGroceryList() never mint real
 * ids (that's a persistence concern), so this is called once, right
 * before writing to Dexie/Supabase, to swap every synthetic id and
 * foreign key for a real `crypto.randomUUID()`.
 *
 * Entries may already carry a REAL (non-"draft-") id here — regenerateWeek()
 * and swapOneMeal() both pass previously-materialized entries straight
 * through as `lockedEntries`, so a "regenerate"/"swap" result is a MIX of
 * already-real ids (kept as-is) and fresh synthetic ones (newly picked).
 * Both cases resolve through the same `entryIdMap`, so `leftoverOfId`
 * always finds its target regardless of which side of that mix it's on.
 */
export function materializeMealPlan(
  draft: Pick<GenerateMealPlanResult, 'plan' | 'entries'>,
  options: { existingPlanId?: string } = {},
): { plan: MealPlan; entries: MealPlanEntry[] } {
  const planId = options.existingPlanId ?? crypto.randomUUID()

  const entryIdMap = new Map<string, string>()
  for (const entry of draft.entries) {
    entryIdMap.set(entry.id, entry.id.startsWith('draft-') ? crypto.randomUUID() : entry.id)
  }

  const entries: MealPlanEntry[] = draft.entries.map((entry) => {
    let leftoverOfId: string | null = null
    if (entry.leftoverOfId) {
      const mapped = entryIdMap.get(entry.leftoverOfId)
      if (!mapped) throw new Error(`materializeMealPlan: entry ${entry.id} references leftoverOfId ${entry.leftoverOfId}, which is not in draft.entries`)
      leftoverOfId = mapped
    }
    return { ...entry, id: entryIdMap.get(entry.id)!, mealPlanId: planId, leftoverOfId }
  })

  return { plan: { ...draft.plan, id: planId }, entries }
}

/**
 * Grocery items have no "keep some, regenerate others" concept the way
 * meal entries do (no per-item locking exists in the schema) — every call
 * replaces the list's items wholesale, so this function itself has no
 * idea whether an item existed before. `is_checked`/`checked_at` still
 * survive a regenerate/swap in practice: src/stores/mealPlan.ts's
 * `applyGeneratedResult` carries them over by matching `ingredientId`
 * across the old and new item lists BEFORE calling this function, since
 * that's the one place that actually has both lists in hand to compare.
 */
export function materializeGroceryList(
  draft: Pick<BuildGroceryListResult, 'list' | 'items'>,
  options: { existingListId?: string } = {},
): { list: GroceryList; items: GroceryItem[] } {
  const listId = options.existingListId ?? crypto.randomUUID()
  const items: GroceryItem[] = draft.items.map((item) => ({ ...item, id: crypto.randomUUID(), listId }))
  return { list: { ...draft.list, id: listId }, items }
}
