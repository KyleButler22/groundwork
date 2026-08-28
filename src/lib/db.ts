import Dexie, { type EntityTable, type Table } from 'dexie'

import type {
  BodyRegion,
  Equipment,
  Exercise,
  ExerciseContraindication,
  ExerciseEquipment,
  MovementPattern,
  PlanItem,
  PlanSession,
  ProgressionEdge,
  ProgressionEdgeKind,
  SetLog,
  UserEquipmentRow,
  UserExerciseLevel,
  UserLimitation,
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
 * Scope for this version: movement/training only — the tables the workout
 * generator needs. Food/recipe/meal-plan/grocery tables get added as a v2
 * schema bump (`db.version(2).stores({...})`) when the meal generator work
 * starts; Dexie migrates existing installs forward automatically, so there
 * is no cost to not pre-declaring them now.
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
  }
}

export const db = new GroundworkDB()
