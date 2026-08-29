import Dexie, { type EntityTable, type Table } from 'dexie'

import type {
  Aisle,
  Allergen,
  BodyRegion,
  DietTag,
  Equipment,
  Exercise,
  ExerciseContraindication,
  ExerciseEquipment,
  GroceryItem,
  GroceryList,
  Ingredient,
  IngredientAllergen,
  IngredientUnit,
  MealPlan,
  MealPlanEntry,
  MealSlot,
  MovementPattern,
  PlanItem,
  PlanSession,
  ProgressionEdge,
  ProgressionEdgeKind,
  Profile,
  Recipe,
  RecipeDietTag,
  RecipeIngredient,
  RecipeMealSlot,
  RecipeStep,
  SetLog,
  Unit,
  UserAllergenRow,
  UserDietTagRow,
  UserDislikedIngredient,
  UserEquipmentRow,
  UserExerciseLevel,
  UserLimitation,
  UserPantryRow,
  UserRecipeFeedback,
  UserTargets,
  WorkoutLog,
  WorkoutPlan,
} from '@/types/domain'

/**
 * Client-side cache, IndexedDB via Dexie. Supabase/Postgres is the source
 * of truth; this is what the app actually reads from day to day, and what
 * keeps the grocery list and today's workout usable with zero signal.
 * Works identically in a browser tab and inside a Capacitor webview later
 * — nothing to swap when that port happens (see calisthenics-app-stack
 * memory: this is *why* the client cache is IndexedDB and not SQLite).
 *
 * v1 scope was movement/training only; v2 added food/recipe/meal-plan
 * tables for the meal generator; v3 added the grocery tables for the
 * grocery generator; v4 (below) adds `profiles`/`userTargets` — a real
 * gap found while wiring the meal generator into the UI: `user_targets`
 * (the macro targets EVERY meal-generation call needs) and `profiles`
 * (householdSize) were being written to Supabase by intake's submit()
 * but never cached locally, so nothing durable could read them back on a
 * later visit — only the WORKOUT plan happened to survive a reload,
 * since rendering it needs no macro targets at all. Dexie only needs the
 * CHANGED/NEW stores listed on a given version; earlier versions' tables
 * carry forward untouched automatically.
 *
 * Primary keys mostly mirror the Postgres primary key so a synced row can
 * be `.put()` without translation. Pure join/content tables use a Postgres-
 * matching compound key (`[a+b]`) rather than a synthetic local id, since
 * that's what makes an upsert-by-natural-key sync loop simple later.
 */
export class GroundworkDB extends Dexie {
  movementPatterns!: EntityTable<MovementPattern, 'id'>
  exercises!: EntityTable<Exercise, 'id'>
  equipment!: EntityTable<Equipment, 'id'>
  bodyRegions!: EntityTable<BodyRegion, 'id'>

  // Compound-primary-key tables: no single column is unique on its own, so
  // these are typed as Table<Row, [tuple]> rather than EntityTable<Row, 'x'>
  // — EntityTable's second parameter implies that one field alone is how
  // you'd .get() a row, which isn't true for a join table.
  progressionEdges!: Table<ProgressionEdge, [number, number, ProgressionEdgeKind]>
  exerciseEquipment!: Table<ExerciseEquipment, [number, number]>
  exerciseContraindications!: Table<ExerciseContraindication, [number, number]>
  userEquipment!: Table<UserEquipmentRow, [string, number]>
  userLimitations!: Table<UserLimitation, [string, number]>
  userExerciseLevels!: Table<UserExerciseLevel, [string, number]>

  workoutPlans!: EntityTable<WorkoutPlan, 'id'>
  planSessions!: EntityTable<PlanSession, 'id'>
  planItems!: EntityTable<PlanItem, 'id'>
  workoutLogs!: EntityTable<WorkoutLog, 'id'>
  setLogs!: EntityTable<SetLog, 'id'>

  // ── v2: food reference / recipes / meal plans ─────────────────────────
  aisles!: EntityTable<Aisle, 'id'>
  units!: EntityTable<Unit, 'id'>
  ingredients!: EntityTable<Ingredient, 'id'>
  ingredientUnits!: Table<IngredientUnit, [string, number]>
  allergens!: EntityTable<Allergen, 'id'>
  ingredientAllergens!: Table<IngredientAllergen, [string, number]>
  dietTags!: EntityTable<DietTag, 'id'>

  recipes!: EntityTable<Recipe, 'id'>
  recipeIngredients!: EntityTable<RecipeIngredient, 'id'>
  recipeSteps!: Table<RecipeStep, [string, number]>
  recipeMealSlots!: Table<RecipeMealSlot, [string, MealSlot]>
  recipeDietTags!: Table<RecipeDietTag, [string, number]>

  userAllergens!: Table<UserAllergenRow, [string, number]>
  userDietTags!: Table<UserDietTagRow, [string, number]>
  userDislikedIngredients!: Table<UserDislikedIngredient, [string, string]>
  userPantry!: Table<UserPantryRow, [string, string]>

  mealPlans!: EntityTable<MealPlan, 'id'>
  mealPlanEntries!: EntityTable<MealPlanEntry, 'id'>
  userRecipeFeedback!: Table<UserRecipeFeedback, [string, string]>

  // ── v3: grocery ────────────────────────────────────────────────────────
  groceryLists!: EntityTable<GroceryList, 'id'>
  groceryItems!: EntityTable<GroceryItem, 'id'>

  // ── v4: profile + macro targets ───────────────────────────────────────
  profiles!: EntityTable<Profile, 'id'>
  userTargets!: EntityTable<UserTargets, 'userId'>

  /** table name -> ISO timestamp of the last successful pull from Supabase. */
  syncMeta!: EntityTable<{ table: string; lastSyncedAt: string }, 'table'>

  constructor() {
    super('groundwork')

    this.version(1).stores({
      // ── content: synced down, read-only from the client ──────────────
      movementPatterns: '&id, slug',
      exercises: '&id, slug, [patternId+level]',
      progressionEdges: '[fromExerciseId+toExerciseId+kind], fromExerciseId, toExerciseId',
      equipment: '&id, slug',
      exerciseEquipment: '[exerciseId+equipmentId], exerciseId',
      bodyRegions: '&id, slug',
      exerciseContraindications: '[exerciseId+regionId], exerciseId, regionId',

      // ── per-user state: written offline, synced up when connected ────
      userEquipment: '[userId+equipmentId], userId',
      userLimitations: '[userId+regionId], userId',
      userExerciseLevels: '[userId+patternId], userId',

      workoutPlans: '&id, userId, status',
      planSessions: '&id, planId, [planId+weekNumber+dayIndex]',
      planItems: '&id, sessionId, orderIndex',
      // id must be a client-generated UUID at creation time (see
      // calisthenics-app-stack memory) so a workout logged offline never
      // collides with one synced down from another device.
      workoutLogs: '&id, userId, performedAt',
      setLogs: '&id, workoutLogId, exerciseId',

      syncMeta: '&table',
    })

    this.version(2).stores({
      // ── content: synced down, read-only from the client ──────────────
      aisles: '&id, slug',
      units: '&id, slug',
      ingredients: '&id, slug, aisleId',
      ingredientUnits: '[ingredientId+unitId], ingredientId',
      allergens: '&id, slug',
      ingredientAllergens: '[ingredientId+allergenId], ingredientId, allergenId',
      dietTags: '&id, slug',

      recipes: '&id, slug, [kcalPerServing+proteinPerServing]',
      recipeIngredients: '&id, recipeId, ingredientId',
      recipeSteps: '[recipeId+stepNumber], recipeId',
      recipeMealSlots: '[recipeId+slot], recipeId, slot',
      recipeDietTags: '[recipeId+dietTagId], recipeId, dietTagId',

      // ── per-user state: written offline, synced up when connected ────
      userAllergens: '[userId+allergenId], userId',
      userDietTags: '[userId+dietTagId], userId',
      userDislikedIngredients: '[userId+ingredientId], userId',
      userPantry: '[userId+ingredientId], userId',

      mealPlans: '&id, userId, status, [userId+weekStartsOn]',
      mealPlanEntries: '&id, mealPlanId, [mealPlanId+serveOn], leftoverOfId',
      userRecipeFeedback: '[userId+recipeId], userId, recipeId',
    })

    this.version(3).stores({
      // ── per-user state: written offline, synced up when connected ────
      groceryLists: '&id, userId, mealPlanId, status',
      groceryItems: '&id, listId, ingredientId, [listId+sortIndex]',
    })

    this.version(4).stores({
      // ── per-user state: written offline, synced up when connected ────
      profiles: '&id',
      userTargets: '&userId',
    })
  }
}

export const db = new GroundworkDB()
