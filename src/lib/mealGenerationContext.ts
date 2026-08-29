import { db } from '@/lib/db'
import { buildMealLibrary, type MealLibrary } from '@/generators/meal'
import type { Aisle, IngredientUnit, Profile, Unit, UserRecipeFeedback, UserTargets } from '@/types/domain'

/**
 * Everything generateMealPlan()/regenerateWeek()/swapOneMeal()/
 * buildGroceryList() need, read fresh from Dexie for one user. Shared by
 * src/stores/mealPlan.ts's regenerate/swap/manual-generate actions —
 * intake.ts's submit() does NOT use this: it already has `targets` and
 * the diet/allergen id sets in hand as local consts at the point it
 * generates the FIRST meal plan (computed for the Profile/UserTargets
 * Dexie write moments earlier), so re-reading them back out of Dexie a
 * few lines later would be pure waste for that one call site.
 */
export interface MealGenerationContext {
  targets: UserTargets
  profile: Profile | null
  library: MealLibrary
  units: Unit[]
  ingredientUnits: IngredientUnit[]
  aisles: Aisle[]
  userAllergenIds: Set<number>
  userDietTagIds: Set<number>
  dislikedIngredientIds: Set<string>
  userPantryIngredientIds: Set<string>
  feedbackByRecipeId: Map<string, UserRecipeFeedback>
}

export async function loadMealGenerationContext(userId: string): Promise<MealGenerationContext | { error: string }> {
  const targets = await db.userTargets.get(userId)
  if (!targets) return { error: 'Finish the intake questionnaire first — no macro targets saved yet.' }

  const [recipes, ingredients, recipeIngredients, recipeMealSlots, recipeDietTags, ingredientAllergens, units, ingredientUnits, aisles] =
    await Promise.all([
      db.recipes.toArray(),
      db.ingredients.toArray(),
      db.recipeIngredients.toArray(),
      db.recipeMealSlots.toArray(),
      db.recipeDietTags.toArray(),
      db.ingredientAllergens.toArray(),
      db.units.toArray(),
      db.ingredientUnits.toArray(),
      db.aisles.toArray(),
    ])
  if (recipes.length === 0) return { error: 'The recipe library has not loaded yet — try again in a moment.' }

  const library = buildMealLibrary({ recipes, ingredients, recipeIngredients, recipeMealSlots, recipeDietTags, ingredientAllergens })

  const [profile, userAllergenRows, userDietTagRows, dislikedRows, pantryRows, feedbackRows] = await Promise.all([
    db.profiles.get(userId),
    db.userAllergens.where('userId').equals(userId).toArray(),
    db.userDietTags.where('userId').equals(userId).toArray(),
    db.userDislikedIngredients.where('userId').equals(userId).toArray(),
    db.userPantry.where('userId').equals(userId).toArray(),
    db.userRecipeFeedback.where('userId').equals(userId).toArray(),
  ])

  return {
    targets,
    profile: profile ?? null,
    library,
    units,
    ingredientUnits,
    aisles,
    userAllergenIds: new Set(userAllergenRows.map((r) => r.allergenId)),
    userDietTagIds: new Set(userDietTagRows.map((r) => r.dietTagId)),
    dislikedIngredientIds: new Set(dislikedRows.map((r) => r.ingredientId)),
    userPantryIngredientIds: new Set(pantryRows.map((r) => r.ingredientId)),
    feedbackByRecipeId: new Map(feedbackRows.map((r) => [r.recipeId, r])),
  }
}
