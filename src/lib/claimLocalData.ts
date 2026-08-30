import { db } from '@/lib/db'
import { pullRealContent } from '@/lib/devContentSeed'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { supabase } from '@/lib/supabase'
import { pushRow, pushRows, pushUserTargets, replaceSet } from '@/lib/sync'

/**
 * Triggered once, from session.ts's onAuthStateChange, the first time a
 * real 'SIGNED_IN' event fires. Kyle's explicit choice (see the plan this
 * implements): existing local-dev-user data becomes the new account's
 * data, rather than being left orphaned or silently discarded.
 *
 * Eligibility check first: if the signed-into account already has any
 * real Supabase data, this does nothing — never overwrite an account's
 * real history with stale local-dev-user content just because THIS
 * browser happens to have some sitting in Dexie.
 *
 * The trickiest part isn't the user_id re-keying itself, it's that
 * ingredients/recipes need a real content pull as part of the same
 * operation, and their ids are NOT stable across that pull: a locally-
 * seeded Ingredient/Recipe uses its own slug as `id` (no way to predict
 * a real uuid client-side — see Ingredient's doc comment in
 * types/domain.ts), while the real Supabase rows carry a server-assigned
 * `gen_random_uuid()` with no relationship to the slug at all. Every
 * local row that references a recipe/ingredient id has to be remapped
 * through the one thing that's identical on both sides — the slug — or
 * every meal plan/grocery list claimed here would silently point at
 * nothing the moment real content replaces the local-file version.
 *
 * Movement-library ids (exercises, movement_patterns, equipment,
 * body_regions — all plain integers) do NOT have this problem and need no
 * remap: both the local parser (parseMovementLibrarySeed.ts) and
 * Postgres's own `serial`/`smallserial` sequence assign ids by strict
 * insertion order through the exact same seed file, so on a freshly-
 * seeded project (nothing else ever inserted into these tables first)
 * the two sides coincidentally, but reliably, agree.
 */
export async function claimLocalDataIfNeeded(realUserId: string): Promise<string[]> {
  const warnings: string[] = []
  if (realUserId === LOCAL_DEV_USER_ID) return warnings

  const { data: existingProfile } = await supabase.from('profiles').select('id').eq('id', realUserId).maybeSingle()
  if (existingProfile) return warnings // this account already has real data — never clobber it

  const hasLocalData =
    (await db.workoutPlans.where('userId').equals(LOCAL_DEV_USER_ID).count()) > 0 ||
    (await db.mealPlans.where('userId').equals(LOCAL_DEV_USER_ID).count()) > 0
  if (!hasLocalData) return warnings

  console.info('[claimLocalData] Claiming existing local-dev-user data for the newly signed-in account.')

  // 1. Snapshot the OLD (local-file, slug-keyed) content ids before they
  //    get replaced by the real pull.
  const oldIngredientIdBySlug = new Map((await db.ingredients.toArray()).map((i) => [i.slug, i.id]))
  const oldRecipeIdBySlug = new Map((await db.recipes.toArray()).map((r) => [r.slug, r.id]))

  // 2. Force the real content pull now, not waiting for the next reload.
  await pullRealContent()

  // 3. Build old-id -> new-id maps via the one thing both sides share:
  //    the slug. A slug present locally but missing from the real pull
  //    (shouldn't happen against a correctly-seeded project, but content
  //    drift is exactly the kind of thing to fail soft, not throw, on)
  //    leaves that id unmapped — remapId falls back to the original id
  //    rather than nulling out a reference outright.
  const newIngredients = await db.ingredients.toArray()
  const newRecipes = await db.recipes.toArray()
  const ingredientIdRemap = buildRemap(oldIngredientIdBySlug, newIngredients)
  const recipeIdRemap = buildRemap(oldRecipeIdBySlug, newRecipes)
  const remapIngredientId = (id: string | null): string | null => (id === null ? null : (ingredientIdRemap.get(id) ?? id))
  const remapRecipeId = (id: string): string => recipeIdRemap.get(id) ?? id

  // 4. Re-key every user-owned table. Two shapes, matching db.ts's own
  //    split: a plain FK column can be updated in place (`.modify()`); a
  //    column that's part of the Dexie PRIMARY key (every compound-key
  //    table, plus profiles/userTargets whose PK IS the user id) can't be
  //    renamed in place at all — delete the old-keyed row, add a new one.
  await db.transaction(
    'rw',
    [
      db.profiles,
      db.userTargets,
      db.workoutPlans,
      db.workoutLogs,
      db.mealPlans,
      db.groceryLists,
      db.userExerciseLevels,
      db.userRecipeFeedback,
      db.userAllergens,
      db.userDietTags,
      db.userLimitations,
      db.userEquipment,
      db.userDislikedIngredients,
      db.userPantry,
      db.mealPlanEntries,
      db.groceryItems,
    ],
    async () => {
      const profile = await db.profiles.get(LOCAL_DEV_USER_ID)
      if (profile) {
        await db.profiles.delete(LOCAL_DEV_USER_ID)
        await db.profiles.add({ ...profile, id: realUserId })
      }
      const targets = await db.userTargets.get(LOCAL_DEV_USER_ID)
      if (targets) {
        await db.userTargets.delete(LOCAL_DEV_USER_ID)
        await db.userTargets.add({ ...targets, userId: realUserId })
      }

      await db.workoutPlans.where('userId').equals(LOCAL_DEV_USER_ID).modify({ userId: realUserId })
      await db.workoutLogs.where('userId').equals(LOCAL_DEV_USER_ID).modify({ userId: realUserId })
      await db.mealPlans.where('userId').equals(LOCAL_DEV_USER_ID).modify({ userId: realUserId })
      await db.groceryLists.where('userId').equals(LOCAL_DEV_USER_ID).modify({ userId: realUserId })

      for (const row of await db.userExerciseLevels.where('userId').equals(LOCAL_DEV_USER_ID).toArray()) {
        await db.userExerciseLevels.delete([LOCAL_DEV_USER_ID, row.patternId])
        await db.userExerciseLevels.add({ ...row, userId: realUserId })
      }
      for (const row of await db.userRecipeFeedback.where('userId').equals(LOCAL_DEV_USER_ID).toArray()) {
        await db.userRecipeFeedback.delete([LOCAL_DEV_USER_ID, row.recipeId])
        await db.userRecipeFeedback.add({ ...row, userId: realUserId, recipeId: remapRecipeId(row.recipeId) })
      }
      for (const row of await db.userAllergens.where('userId').equals(LOCAL_DEV_USER_ID).toArray()) {
        await db.userAllergens.delete([LOCAL_DEV_USER_ID, row.allergenId])
        await db.userAllergens.add({ ...row, userId: realUserId })
      }
      for (const row of await db.userDietTags.where('userId').equals(LOCAL_DEV_USER_ID).toArray()) {
        await db.userDietTags.delete([LOCAL_DEV_USER_ID, row.dietTagId])
        await db.userDietTags.add({ ...row, userId: realUserId })
      }
      for (const row of await db.userLimitations.where('userId').equals(LOCAL_DEV_USER_ID).toArray()) {
        await db.userLimitations.delete([LOCAL_DEV_USER_ID, row.regionId])
        await db.userLimitations.add({ ...row, userId: realUserId })
      }
      for (const row of await db.userEquipment.where('userId').equals(LOCAL_DEV_USER_ID).toArray()) {
        await db.userEquipment.delete([LOCAL_DEV_USER_ID, row.equipmentId])
        await db.userEquipment.add({ ...row, userId: realUserId })
      }
      for (const row of await db.userDislikedIngredients.where('userId').equals(LOCAL_DEV_USER_ID).toArray()) {
        await db.userDislikedIngredients.delete([LOCAL_DEV_USER_ID, row.ingredientId])
        await db.userDislikedIngredients.add({ ...row, userId: realUserId, ingredientId: remapIngredientId(row.ingredientId) as string })
      }
      for (const row of await db.userPantry.where('userId').equals(LOCAL_DEV_USER_ID).toArray()) {
        await db.userPantry.delete([LOCAL_DEV_USER_ID, row.ingredientId])
        await db.userPantry.add({ ...row, userId: realUserId, ingredientId: remapIngredientId(row.ingredientId) as string })
      }

      // mealPlanEntries/groceryItems carry no userId of their own (owned
      // via mealPlanId/listId, already re-keyed above) but DO reference
      // the just-replaced content tables. Scoped to the plans/lists that
      // were actually just claimed, not the whole table — this browser's
      // cache is expected to only ever hold one user's data at a time,
      // but there's no reason to rely on that when the ids to scope by
      // are already sitting right here.
      const claimedMealPlanIds = (await db.mealPlans.where('userId').equals(realUserId).toArray()).map((p) => p.id)
      const claimedGroceryListIds = (await db.groceryLists.where('userId').equals(realUserId).toArray()).map((l) => l.id)

      await db.mealPlanEntries
        .where('mealPlanId')
        .anyOf(claimedMealPlanIds)
        .modify((entry) => {
          entry.recipeId = remapRecipeId(entry.recipeId)
        })
      await db.groceryItems
        .where('listId')
        .anyOf(claimedGroceryListIds)
        .modify((item) => {
          if (item.ingredientId) item.ingredientId = remapIngredientId(item.ingredientId)
        })
    },
  )

  // 5. Push everything, now correctly keyed, up to Supabase.
  await pushClaimedData(realUserId, warnings)

  return warnings
}

function buildRemap<T extends { slug: string; id: string }>(oldIdBySlug: Map<string, string>, newRows: T[]): Map<string, string> {
  const newIdBySlug = new Map(newRows.map((r) => [r.slug, r.id]))
  const remap = new Map<string, string>()
  for (const [slug, oldId] of oldIdBySlug) {
    const newId = newIdBySlug.get(slug)
    if (newId) remap.set(oldId, newId)
  }
  return remap
}

async function pushClaimedData(userId: string, warnings: string[]): Promise<void> {
  const profile = await db.profiles.get(userId)
  if (profile) await pushRow('profiles', profile, warnings)
  const targets = await db.userTargets.get(userId)
  if (targets) await pushUserTargets(targets, warnings)

  await replaceSet('user_equipment', userId, await db.userEquipment.where('userId').equals(userId).toArray(), warnings)
  await replaceSet('user_limitations', userId, await db.userLimitations.where('userId').equals(userId).toArray(), warnings)
  await replaceSet('user_allergens', userId, await db.userAllergens.where('userId').equals(userId).toArray(), warnings)
  await replaceSet('user_diet_tags', userId, await db.userDietTags.where('userId').equals(userId).toArray(), warnings)
  await replaceSet('user_disliked_ingredients', userId, await db.userDislikedIngredients.where('userId').equals(userId).toArray(), warnings)
  await replaceSet('user_pantry', userId, await db.userPantry.where('userId').equals(userId).toArray(), warnings)

  const workoutPlans = await db.workoutPlans.where('userId').equals(userId).toArray()
  await pushRows('workout_plans', workoutPlans, warnings)
  for (const plan of workoutPlans) {
    const sessions = await db.planSessions.where('planId').equals(plan.id).toArray()
    await pushRows('plan_sessions', sessions, warnings)
    for (const s of sessions) {
      await pushRows('plan_items', await db.planItems.where('sessionId').equals(s.id).toArray(), warnings)
    }
  }
  const workoutLogs = await db.workoutLogs.where('userId').equals(userId).toArray()
  await pushRows('workout_logs', workoutLogs, warnings)
  for (const log of workoutLogs) {
    await pushRows('set_logs', await db.setLogs.where('workoutLogId').equals(log.id).toArray(), warnings)
  }
  await pushRows('user_exercise_levels', await db.userExerciseLevels.where('userId').equals(userId).toArray(), warnings)

  const mealPlans = await db.mealPlans.where('userId').equals(userId).toArray()
  await pushRows('meal_plans', mealPlans, warnings)
  for (const plan of mealPlans) {
    await pushRows('meal_plan_entries', await db.mealPlanEntries.where('mealPlanId').equals(plan.id).toArray(), warnings)
  }
  await pushRows('user_recipe_feedback', await db.userRecipeFeedback.where('userId').equals(userId).toArray(), warnings)

  const groceryLists = await db.groceryLists.where('userId').equals(userId).toArray()
  await pushRows('grocery_lists', groceryLists, warnings)
  for (const list of groceryLists) {
    await pushRows('grocery_items', await db.groceryItems.where('listId').equals(list.id).toArray(), warnings)
  }
}

