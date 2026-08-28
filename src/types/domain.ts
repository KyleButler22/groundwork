/**
 * Hand-authored domain types for the movement/training side of the schema
 * (docs/schema.md sections 1-3, docs/generator.md). These are what the
 * workout generator and UI actually import — not the Supabase-generated
 * `Database` type (see database.ts), which is wider, snake_case, and
 * churns every time a migration changes.
 *
 * Source of truth for the shape itself is supabase/migrations/*.sql. If
 * you change a column there, update the matching type here by hand; there
 * is no live Supabase project yet to run `supabase gen types` against.
 *
 * Food/recipe/meal-plan domain types are intentionally not modelled yet —
 * they land when the meal generator work starts (see calisthenics-recipe-corpus
 * memory). Adding them is additive and won't touch anything below.
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
  mealsPerDay: number
  cookTimeCeiling: number | null
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
}

/** The promotion engine's state — one row per pattern per user. */
export interface UserExerciseLevel {
  userId: string
  patternId: number
  exerciseId: number
  consecutiveSuccess: number
  consecutiveFailure: number
  lastEvaluatedAt: string | null
}
