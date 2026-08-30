/**
 * Hand-authored domain types for the movement/training side of the schema
 * (docs/schema.md sections 1-3, docs/generator.md), the food/recipe/
 * meal-plan side added for the meal generator (docs/schema.md sections
 * 4-6, docs/mealgen.md §1-7,9), and the grocery-list side added for the
 * grocery generator (docs/schema.md section 7, docs/mealgen.md §8). These
 * are what the generators and UI actually import — not the Supabase-
 * generated `Database` type (see database.ts), which is wider,
 * snake_case, and churns every time a migration changes.
 *
 * Source of truth for the shape itself is supabase/migrations/*.sql. If
 * you change a column there, update the matching type here by hand; there
 * is no live Supabase project yet to run `supabase gen types` against.
 */

// ── identity & intake ───────────────────────────────────────────────────

export type SexAtBirth = 'male' | 'female' | 'unspecified'
export type UnitPreference = 'metric' | 'imperial'
export type Goal = 'fat_loss' | 'muscle_gain' | 'recomp' | 'maintain' | 'skill'

export interface Profile {
  id: string // uuid, == auth.users.id
  displayName: string | null
  birthYear: number | null
  sexAtBirth: SexAtBirth | null
  heightCm: number | null
  units: UnitPreference
  timezone: string
  householdSize: number
}

export interface UserTargets {
  userId: string
  intakeResponseId: string | null
  goal: Goal
  activityFactor: number
  tdeeKcal: number
  kcalTarget: number
  proteinG: number
  fatG: number
  carbG: number
  daysPerWeek: number
  sessionMinutes: number
  /** Which of the 4 schema slots to plan at all — not a count. Stored in
   *  Postgres as 4 booleans (`user_targets.wants_breakfast` etc., see
   *  0002_identity.sql) since it's a fixed, never-growing vocabulary, not
   *  a many-to-many join table the way diet tags/allergens are; this is
   *  the client-side array projection every generator call actually wants.
   *  Always non-empty — intake requires at least one, and the generator
   *  falls back to `['dinner']` defensively if it ever somehow isn't. */
  activeMealSlots: MealSlot[]
  cookTimeCeiling: number | null
  /** Added by migration 0010 — see that migration's own comment for why
   *  this table (like workout_plans/set_logs/meal_plan_entries) needed it
   *  added rather than already having it: it's genuinely updated in place
   *  (re-computed on a later intake run) but had never carried the column
   *  every OTHER syncable table already does. Trigger-managed, never set
   *  by application code — see 0010_sync_columns.sql. */
  updatedAt: string
}

// ── movement library ─────────────────────────────────────────────────────

export type PatternCategory = 'push' | 'pull' | 'legs' | 'core' | 'skill'

export interface MovementPattern {
  id: number
  slug: string
  name: string
  category: PatternCategory
  sortOrder: number
}

export type MetricType = 'reps' | 'time_seconds' | 'distance_m'

/**
 * The three metric types are mutually exclusive in practice: a `reps`
 * exercise has repMin/repMax set and the others null, and so on. Modelled
 * as one flat interface (matching the table) rather than a discriminated
 * union, because that's how it round-trips through Supabase — narrow with
 * `metricType` at the point of use instead.
 */
export interface Exercise {
  id: number
  slug: string
  name: string
  patternId: number
  level: number
  metricType: MetricType
  repMin: number | null
  repMax: number | null
  holdMinS: number | null
  holdMaxS: number | null
  distanceMinM: number | null
  distanceMaxM: number | null
  isUnilateral: boolean
  demoUrl: string | null
  cues: string | null
  isActive: boolean
}

export type ProgressionEdgeKind = 'progression' | 'regression' | 'lateral'

export interface ProgressionEdge {
  fromExerciseId: number
  toExerciseId: number
  kind: ProgressionEdgeKind
}

export interface Equipment {
  id: number
  slug: string
  name: string
}

export interface ExerciseEquipment {
  exerciseId: number
  equipmentId: number
  /** Same group on multiple rows means "any one satisfies this"; different
   *  groups (or the default 0) means every row is independently required. */
  alternativeGroup: number
}

export interface BodyRegion {
  id: number
  slug: string
  name: string
}

export type ContraindicationSeverity = 'avoid' | 'caution'

export interface ExerciseContraindication {
  exerciseId: number
  regionId: number
  severity: ContraindicationSeverity
}

export interface UserLimitation {
  userId: string
  regionId: number
  note: string | null
}

export interface UserEquipmentRow {
  userId: string
  equipmentId: number
}

// ── plans & logs ─────────────────────────────────────────────────────────

export type SplitType = 'full_body' | 'upper_lower' | 'push_pull_legs'
export type PlanStatus = 'active' | 'archived'
export type WeekType = 'build' | 'peak' | 'deload'

export interface WorkoutPlan {
  id: string
  userId: string
  name: string
  splitType: SplitType
  daysPerWeek: number
  weeks: number
  startsOn: string // date, ISO yyyy-mm-dd
  status: PlanStatus
  generatorVersion: string
  seed: number
  /** Added by migration 0010, trigger-managed — see UserTargets.updatedAt's
   *  comment. Genuinely updated in place: archive-before-add sets
   *  `status: 'archived'` on the previous active row. */
  updatedAt: string
}

/**
 * dayIndex is an ORDER within the block, not a weekday — the block slides
 * when sessions are missed rather than sticking to a calendar (decided
 * 2026-08-27, see calisthenics-app-docs memory). Never derive a displayed
 * date from startsOn + arithmetic; use the corresponding WorkoutLog's
 * performedAt once the session has actually happened.
 */
export interface PlanSession {
  id: string
  planId: string
  weekNumber: number
  dayIndex: number
  name: string
  weekType: WeekType
  estMinutes: number | null
}

export interface PlanItem {
  id: string
  sessionId: string
  orderIndex: number
  exerciseId: number
  sets: number
  targetRepMin: number | null
  targetRepMax: number | null
  targetSeconds: number | null
  restSeconds: number
  tempo: string | null
  supersetGroup: number | null
  isAmrapLastSet: boolean
  note: string | null
}

export type WorkoutLogStatus = 'completed' | 'partial' | 'skipped'

export interface WorkoutLog {
  id: string
  userId: string
  planSessionId: string | null
  performedAt: string // timestamptz, ISO
  durationMinutes: number | null
  sessionRpe: number | null
  status: WorkoutLogStatus
  note: string | null
  /** Already existed in 0004_training.sql from the original scaffold —
   *  genuinely missing from this hand-authored type until the sync work
   *  needed to read/write it for real (see docs/schema.md's "update this
   *  type by hand" rule at the top of this file, and migration 0010's own
   *  comment for the OTHER 4 tables that needed the column itself added,
   *  not just the type). */
  updatedAt: string
}

export interface SetLog {
  id: string
  workoutLogId: string
  planItemId: string | null
  exerciseId: number // what was ACTUALLY done — may differ from the plan item
  setNumber: number
  reps: number | null
  seconds: number | null
  addedWeightKg: number | null
  assistBand: string | null
  rpe: number | null
  /** Added by migration 0010, trigger-managed — see UserTargets.updatedAt's
   *  comment. Genuinely updated in place: updateSetLog (stores/plan.ts)
   *  edits reps/seconds/addedWeightKg/rpe after the initial log. */
  updatedAt: string
}

/** The promotion engine's state — one row per pattern per user. */
export interface UserExerciseLevel {
  userId: string
  patternId: number
  exerciseId: number
  consecutiveSuccess: number
  consecutiveFailure: number
  lastEvaluatedAt: string | null
  /** Already existed in 0004_training.sql — see WorkoutLog.updatedAt's
   *  comment for why this was missing from the type until now. */
  updatedAt: string
}

// ── food reference (docs/schema.md §4) ──────────────────────────────────

export interface Aisle {
  id: number
  slug: string
  name: string
  sortOrder: number
}

export type UnitDimension = 'mass' | 'volume' | 'count'

export interface Unit {
  id: number
  slug: string
  name: string
  dimension: UnitDimension
  /** Grams per unit (mass), millilitres per unit (volume), or 1 (count —
   *  a count unit always needs an IngredientUnit override or
   *  Ingredient.gramsPerEach, since "1 clove" has no universal weight the
   *  way 1 kg always does). */
  baseFactor: number
}

/**
 * `id` is the ingredient's own slug for locally-seeded content (see
 * src/lib/devContentSeed.ts) — the real migration gives it a
 * `gen_random_uuid()` default with no way to predict it client-side, and
 * nothing downstream needs it to look uuid-shaped, only to be stable and
 * unique. Real Supabase-synced rows will carry the actual server uuid
 * once that sync exists (TASKS.md); everything here keys by `id` either
 * way, never by re-deriving the slug.
 */
export interface Ingredient {
  id: string
  slug: string
  name: string
  aisleId: number
  densityGPerMl: number | null
  gramsPerEach: number | null
  kcalPer100g: number
  proteinPer100g: number
  carbPer100g: number
  fatPer100g: number
  fiberPer100g: number | null
  fdcId: number | null
  isPantryStaple: boolean
  isActive: boolean
}

/** Exact volume/count -> mass override, beating density/gramsPerEach when
 *  present (1 cup flour = 120g, 1 clove garlic = 3g). */
export interface IngredientUnit {
  ingredientId: string
  unitId: number
  grams: number
}

export interface Allergen {
  id: number
  slug: string
  name: string
}

/** Allergens live on ingredients and are derived upward onto recipes —
 *  never hand-tagged on a recipe (docs/schema.md §4). */
export interface IngredientAllergen {
  ingredientId: string
  allergenId: number
}

export interface DietTag {
  id: number
  slug: string
  name: string
}

// ── recipes (docs/schema.md §5) ──────────────────────────────────────────

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type RecipeDifficulty = 1 | 2 | 3

/** `id` is the recipe's own slug for locally-seeded content — same
 *  reasoning as Ingredient.id above. */
export interface Recipe {
  id: string
  slug: string
  title: string
  summary: string | null
  servings: number
  prepMinutes: number
  cookMinutes: number
  cuisine: string | null
  imageUrl: string | null
  difficulty: RecipeDifficulty
  /** Per-serving macro cache — computed from RecipeIngredient rows at
   *  authoring time (scripts/generate-recipes.mjs), stored denormalised.
   *  Treat as a single-writer cache: never hand-edit, recompute on save. */
  kcalPerServing: number
  proteinPerServing: number
  carbPerServing: number
  fatPerServing: number
  isActive: boolean
  updatedAt: string
}

export interface RecipeIngredient {
  id: string
  recipeId: string
  ingredientId: string
  quantity: number
  unitId: number
  prepNote: string | null
  isOptional: boolean
  orderIndex: number
}

export interface RecipeStep {
  recipeId: string
  stepNumber: number
  instruction: string
}

export interface RecipeMealSlot {
  recipeId: string
  slot: MealSlot
}

export interface RecipeDietTag {
  recipeId: string
  dietTagId: number
}

// ── per-user food preferences (docs/schema.md §5) ────────────────────────

export interface UserAllergenRow {
  userId: string
  allergenId: number
}

export interface UserDietTagRow {
  userId: string
  dietTagId: number
}

export interface UserDislikedIngredient {
  userId: string
  ingredientId: string
}

export interface UserPantryRow {
  userId: string
  ingredientId: string
}

// ── meal plans (docs/schema.md §6, docs/mealgen.md) ──────────────────────

export type MealPlanStatus = 'active' | 'archived'

export interface MealPlan {
  id: string
  userId: string
  weekStartsOn: string // date, ISO yyyy-mm-dd
  kcalTarget: number
  proteinTargetG: number
  carbTargetG: number
  fatTargetG: number
  generatorVersion: string
  seed: number
  regenCount: number
  status: MealPlanStatus
  createdAt: string
  updatedAt: string
}

/**
 * `servings` is what's EATEN in this entry, always — including a fresh
 * dinner that also spawns a leftover: that entry's `servings` is one
 * night's portion, same as any other entry, not the doubled batch. This
 * keeps every entry's macro contribution readable on its own (sum
 * `servings * recipe.kcalPerServing` across a day with no special-casing
 * — see ../generators/meal/repair.ts), at the cost of the total batch
 * actually cooked being a small derived sum rather than a stored field:
 * `entry.servings + Σ(servings of entries where leftoverOfId === entry.id)`.
 * docs/mealgen.md §8's grocery derivation (not yet built — TASKS.md) does
 * that sum once, at the point it actually needs "how much to buy."
 */
export interface MealPlanEntry {
  id: string
  mealPlanId: string
  serveOn: string // date, ISO yyyy-mm-dd
  slot: MealSlot
  recipeId: string
  servings: number
  isLocked: boolean
  leftoverOfId: string | null
  /** Added by migration 0010, trigger-managed — see UserTargets.updatedAt's
   *  comment. Genuinely updated in place: toggleLock and swapMeal both
   *  edit an existing entry rather than replacing it. */
  updatedAt: string
}

export type RecipeRating = 'loved' | 'ok' | 'never'

/** One table doing three jobs at once (docs/schema.md §6): exclusion
 *  ('never'), personalisation ('loved'), and the recency cooldown
 *  (`lastServedOn`, docs/mealgen.md §4's `recency()` term). */
export interface UserRecipeFeedback {
  userId: string
  recipeId: string
  rating: RecipeRating | null
  lastServedOn: string | null // date, ISO yyyy-mm-dd
  serveCount: number
  updatedAt: string
}

// ── grocery (docs/schema.md §7, docs/mealgen.md §8) ──────────────────────

export type GroceryListStatus = 'active' | 'done' | 'archived'

export interface GroceryList {
  id: string
  userId: string
  mealPlanId: string | null
  title: string
  status: GroceryListStatus
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Its own table, not a view (docs/schema.md §7) — people edit it (check
 * things off, add a manual item) independently of the plan it came from.
 * Exactly one of `ingredientId`/`manualLabel` is set, matching the
 * migration's own check constraint — the generator (src/generators/meal/
 * groceryList.ts) only ever produces the `ingredientId` kind; a
 * `manualLabel` row is something a user adds by hand later.
 */
export interface GroceryItem {
  id: string
  listId: string
  ingredientId: string | null
  manualLabel: string | null
  totalGrams: number | null
  displayQuantity: number | null
  displayUnitId: number | null
  aisleId: number | null
  isChecked: boolean
  checkedAt: string | null
  /** Which MealPlanEntry row(s) this quantity was aggregated from — a
   *  fresh entry only, never a leftover (see groceryList.ts §8 step 1). */
  sourceEntryIds: string[]
  sortIndex: number
  updatedAt: string
  deletedAt: string | null
}
