import { computed, ref, toRaw } from 'vue'
import { defineStore } from 'pinia'

import { db } from '@/lib/db'
import { loadMealGenerationContext, type MealGenerationContext } from '@/lib/mealGenerationContext'
import { materializeGroceryList, materializeMealPlan } from '@/lib/materializeMealPlan'
import { buildGroceryList, generateMealPlan, regenerateWeek, swapOneMeal, type GenerateMealPlanInput, type GenerateMealPlanResult } from '@/generators/meal'
import type { Aisle, GroceryItem, GroceryList, Ingredient, MealPlan, MealPlanEntry, MealSlot, Recipe, Unit } from '@/types/domain'

const GENERATOR_VERSION = '2026-08-29.1'

/**
 * Reads the locally-cached active meal plan + grocery list (written by
 * generate/regenerate/swap below, or by a future intake-time generation —
 * see intake.ts's own note) — Dexie only, same "no Supabase sync yet"
 * caveat as src/stores/plan.ts. Mirrors that store's shape closely, plus
 * the meal-specific regenerate/swap/lock actions docs/mealgen.md §9 calls
 * for, which the workout side has no equivalent of.
 *
 * Single active plan per device, exactly like plan.ts's workoutPlans
 * query — not scoped by userId in the read, matching that same
 * established (no multi-profile support anywhere yet) assumption.
 */
export const useMealPlanStore = defineStore('mealPlan', () => {
  const plan = ref<MealPlan | null>(null)
  const entries = ref<MealPlanEntry[]>([])
  const groceryList = ref<GroceryList | null>(null)
  const groceryItems = ref<GroceryItem[]>([])

  const recipesById = ref<Map<string, Recipe>>(new Map())
  const ingredientsById = ref<Map<string, Ingredient>>(new Map())
  const unitsById = ref<Map<number, Unit>>(new Map())
  const aislesById = ref<Map<number, Aisle>>(new Map())

  const loading = ref(true)
  const generating = ref(false)
  const error = ref<string | null>(null)
  const warnings = ref<string[]>([])

  // In-memory only, per docs/mealgen.md §9's hash(seed, day, slot, n) —
  // resets on reload. No schema field tracks this across sessions; a
  // fresh page load's first swap of any slot just starts back at n=1,
  // same as a brand new session genuinely would.
  const swapCountByKey = new Map<string, number>()

  const hasPlan = computed(() => plan.value !== null)

  const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

  const entriesByDay = computed(() => {
    const map = new Map<string, MealPlanEntry[]>()
    for (const e of entries.value) {
      const list = map.get(e.serveOn)
      if (list) list.push(e)
      else map.set(e.serveOn, [e])
    }
    for (const list of map.values()) list.sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot))
    return map
  })

  const sortedDays = computed(() => [...entriesByDay.value.keys()].sort())

  const sortedGroceryItems = computed(() => [...groceryItems.value].sort((a, b) => a.sortIndex - b.sortIndex))

  /** docs/mealgen.md §8 step 7: "group by aisle.sort_order" — sortedGroceryItems
   *  is already in that order (see groceryList.ts), so grouping is just a
   *  single pass collecting consecutive same-aisle runs, not a re-sort. */
  const groceryGroups = computed(() => {
    const groups: { aisleId: number | null; aisleName: string; items: GroceryItem[] }[] = []
    for (const item of sortedGroceryItems.value) {
      const last = groups[groups.length - 1]
      if (last && last.aisleId === item.aisleId) last.items.push(item)
      else groups.push({ aisleId: item.aisleId, aisleName: aisleName(item.aisleId), items: [item] })
    }
    return groups
  })

  function recipeTitle(recipeId: string): string {
    return recipesById.value.get(recipeId)?.title ?? `Recipe ${recipeId}`
  }
  function recipe(recipeId: string): Recipe | undefined {
    return recipesById.value.get(recipeId)
  }
  function entryMacros(e: MealPlanEntry): { kcal: number; proteinG: number } | null {
    const r = recipesById.value.get(e.recipeId)
    if (!r) return null
    return { kcal: r.kcalPerServing * e.servings, proteinG: r.proteinPerServing * e.servings }
  }
  function ingredientName(ingredientId: string | null): string {
    if (!ingredientId) return ''
    return ingredientsById.value.get(ingredientId)?.name ?? 'Unknown ingredient'
  }
  function unitLabel(unitId: number | null): string {
    if (unitId === null) return ''
    return unitsById.value.get(unitId)?.slug ?? ''
  }
  function aisleName(aisleId: number | null): string {
    if (aisleId === null) return 'Other'
    return aislesById.value.get(aisleId)?.name ?? 'Other'
  }

  async function loadActivePlan() {
    loading.value = true
    error.value = null

    const active = await db.mealPlans.where('status').equals('active').first()
    plan.value = active ?? null

    if (active) {
      entries.value = await db.mealPlanEntries.where('mealPlanId').equals(active.id).toArray()
      const list = await db.groceryLists.where('mealPlanId').equals(active.id).first()
      groceryList.value = list ?? null
      groceryItems.value = list ? await db.groceryItems.where('listId').equals(list.id).toArray() : []
    } else {
      entries.value = []
      groceryList.value = null
      groceryItems.value = []
    }

    const [recipes, ingredients, units, aisles] = await Promise.all([db.recipes.toArray(), db.ingredients.toArray(), db.units.toArray(), db.aisles.toArray()])
    recipesById.value = new Map(recipes.map((r) => [r.id, r]))
    ingredientsById.value = new Map(ingredients.map((i) => [i.id, i]))
    unitsById.value = new Map(units.map((u) => [u.id, u]))
    aislesById.value = new Map(aisles.map((a) => [a.id, a]))

    loading.value = false
  }

  function buildGeneratorInput(
    userId: string,
    ctx: MealGenerationContext,
    overrides: Partial<GenerateMealPlanInput> & Pick<GenerateMealPlanInput, 'weekStartsOn' | 'seed'>,
  ): GenerateMealPlanInput {
    return {
      userId,
      dailyTargets: { kcalTarget: ctx.targets.kcalTarget, proteinG: ctx.targets.proteinG, carbG: ctx.targets.carbG, fatG: ctx.targets.fatG },
      mealsPerDay: ctx.targets.mealsPerDay,
      householdSize: ctx.profile?.householdSize ?? 1,
      cookTimeCeilingMinutes: ctx.targets.cookTimeCeiling,
      userAllergenIds: ctx.userAllergenIds,
      userDietTagIds: ctx.userDietTagIds,
      dislikedIngredientIds: ctx.dislikedIngredientIds,
      feedbackByRecipeId: ctx.feedbackByRecipeId,
      library: ctx.library,
      generatorVersion: GENERATOR_VERSION,
      now: new Date().toISOString(),
      ...overrides,
    }
  }

  /** Materializes a generator result, derives its grocery list, and
   *  persists both — shared by generate/regenerate/swap below, which
   *  differ only in which generator entry point produced `result` and
   *  whether an existing plan/list id should be reused in place. */
  async function applyGeneratedResult(userId: string, ctx: MealGenerationContext, result: GenerateMealPlanResult, existingPlanId?: string): Promise<void> {
    warnings.value = result.warnings

    const { plan: materializedPlan, entries: materializedEntries } = materializeMealPlan(result, { existingPlanId })

    const groceryResult = buildGroceryList({
      mealPlanId: materializedPlan.id,
      userId,
      title: groceryList.value?.title ?? `Week of ${materializedPlan.weekStartsOn}`,
      entries: materializedEntries,
      library: ctx.library,
      units: ctx.units,
      ingredientUnits: ctx.ingredientUnits,
      aisles: ctx.aisles,
      userPantryIngredientIds: ctx.userPantryIngredientIds,
      now: new Date().toISOString(),
    })
    warnings.value = [...warnings.value, ...groceryResult.warnings]
    const existingListId = groceryList.value?.id
    const { list: materializedList, items: materializedItems } = materializeGroceryList(groceryResult, { existingListId })

    await db.transaction('rw', [db.mealPlans, db.mealPlanEntries, db.groceryLists, db.groceryItems], async () => {
      if (existingPlanId) {
        await db.mealPlans.put(materializedPlan)
        await db.mealPlanEntries.where('mealPlanId').equals(existingPlanId).delete()
      } else {
        // Same reasoning as intake.ts's submit(): archive whatever was
        // active before adding a new one, so a stray already-active row
        // (e.g. left over from before that archive-on-generate existed)
        // can never make loadActivePlan()'s `.first()` query ambiguous.
        await db.mealPlans.where('status').equals('active').modify({ status: 'archived' })
        await db.mealPlans.add(materializedPlan)
      }
      await db.mealPlanEntries.bulkAdd(materializedEntries)

      if (existingListId) {
        await db.groceryLists.put(materializedList)
        await db.groceryItems.where('listId').equals(existingListId).delete()
      } else {
        await db.groceryLists.add(materializedList)
      }
      await db.groceryItems.bulkAdd(materializedItems)
    })

    plan.value = materializedPlan
    entries.value = materializedEntries
    groceryList.value = materializedList
    groceryItems.value = materializedItems
  }

  /** Manual fallback for the rare case intake-time generation didn't
   *  happen (see intake.ts) — e.g. a plan that failed to save, or dev
   *  data cleared by hand. Not the primary path: intake's submit() is. */
  async function generateFreshPlan(userId: string): Promise<boolean> {
    generating.value = true
    error.value = null
    warnings.value = []
    try {
      const ctx = await loadMealGenerationContext(userId)
      if ('error' in ctx) {
        error.value = ctx.error
        return false
      }
      const weekStartsOn = new Date().toISOString().slice(0, 10)
      const seed = Math.floor(Math.random() * 0xffffffff)
      const result = generateMealPlan(buildGeneratorInput(userId, ctx, { weekStartsOn, seed }))
      await applyGeneratedResult(userId, ctx, result)
      return true
    } catch (err) {
      error.value = (err as Error).message
      return false
    } finally {
      generating.value = false
    }
  }

  async function regenerate(userId: string): Promise<boolean> {
    if (!plan.value) {
      error.value = 'No plan to regenerate yet.'
      return false
    }
    generating.value = true
    error.value = null
    warnings.value = []
    try {
      const ctx = await loadMealGenerationContext(userId)
      if ('error' in ctx) {
        error.value = ctx.error
        return false
      }
      const currentPlan = plan.value
      const input = buildGeneratorInput(userId, ctx, { weekStartsOn: currentPlan.weekStartsOn, seed: currentPlan.seed, regenCount: currentPlan.regenCount })
      const result = regenerateWeek(input, entries.value)
      await applyGeneratedResult(userId, ctx, result, currentPlan.id)
      return true
    } catch (err) {
      error.value = (err as Error).message
      return false
    } finally {
      generating.value = false
    }
  }

  async function swapMeal(userId: string, serveOn: string, slot: MealSlot): Promise<boolean> {
    if (!plan.value) {
      error.value = 'No plan to swap a meal in yet.'
      return false
    }
    generating.value = true
    error.value = null
    warnings.value = []
    try {
      const ctx = await loadMealGenerationContext(userId)
      if ('error' in ctx) {
        error.value = ctx.error
        return false
      }
      const currentPlan = plan.value
      const key = `${serveOn}|${slot}`
      const swapCount = (swapCountByKey.get(key) ?? 0) + 1
      swapCountByKey.set(key, swapCount)

      const input = buildGeneratorInput(userId, ctx, { weekStartsOn: currentPlan.weekStartsOn, seed: currentPlan.seed, regenCount: currentPlan.regenCount })
      const result = swapOneMeal(input, entries.value, serveOn, slot, swapCount)
      await applyGeneratedResult(userId, ctx, result, currentPlan.id)
      return true
    } catch (err) {
      error.value = (err as Error).message
      return false
    } finally {
      generating.value = false
    }
  }

  async function toggleLock(entryId: string): Promise<void> {
    const target = entries.value.find((e) => e.id === entryId)
    if (!target) return
    // toRaw(): target comes from a reactive ref — spreading it directly
    // would carry any nested array/object through as a Vue Proxy, and
    // IndexedDB's structured-clone algorithm rejects those outright
    // (DataCloneError) rather than silently stripping the reactivity.
    // MealPlanEntry has no array/object fields today, but see
    // toggleGroceryItemChecked below for where this bit for real.
    const updated: MealPlanEntry = { ...toRaw(target), isLocked: !target.isLocked }
    await db.mealPlanEntries.put(updated)
    entries.value = entries.value.map((e) => (e.id === entryId ? updated : e))
  }

  async function toggleGroceryItemChecked(itemId: string): Promise<void> {
    const target = groceryItems.value.find((i) => i.id === itemId)
    if (!target) return
    // toRaw() is load-bearing here, not defensive: sourceEntryIds is a
    // real array field, and without this `db.groceryItems.put()` throws
    // "DataCloneError: [object Array] could not be cloned" — found by
    // actually clicking the checkbox in the browser, not by typechecking
    // or a unit test, since Dexie/TypeScript both accept a Proxy-wrapped
    // array as a plain `string[]` without complaint. IndexedDB's
    // structured-clone algorithm is the thing that actually rejects it,
    // at write time, in the browser only.
    const updated: GroceryItem = { ...toRaw(target), isChecked: !target.isChecked, checkedAt: !target.isChecked ? new Date().toISOString() : null }
    await db.groceryItems.put(updated)
    groceryItems.value = groceryItems.value.map((i) => (i.id === itemId ? updated : i))
  }

  return {
    plan,
    entries,
    groceryList,
    groceryItems,
    loading,
    generating,
    error,
    warnings,
    hasPlan,
    entriesByDay,
    sortedDays,
    sortedGroceryItems,
    groceryGroups,
    recipeTitle,
    recipe,
    entryMacros,
    ingredientName,
    unitLabel,
    aisleName,
    loadActivePlan,
    generateFreshPlan,
    regenerate,
    swapMeal,
    toggleLock,
    toggleGroceryItemChecked,
  }
})
