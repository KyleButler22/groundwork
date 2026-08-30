import { toRaw } from 'vue'

import { supabase } from '@/lib/supabase'
import type { UserTargets } from '@/types/domain'

/**
 * Shared Supabase push/pull helpers — one place for the concerns every
 * sync call site needs, instead of ~15 near-identical try/catch blocks
 * spread across intake.ts/plan.ts/mealPlan.ts. See docs/schema.md's
 * "Offline sync rules" for the design this implements: updated_at-based
 * last-write-wins, full-replace for pure preference/join tables, pull-once
 * for content.
 *
 * Field names: rows are converted key-by-key between camelCase (the app's
 * domain types) and snake_case (Postgres) generically here — the two
 * naming conventions differ by nothing but casing for every table except
 * user_targets, whose activeMealSlots is a client-side array projection of
 * 4 separate boolean columns (wants_breakfast etc.) with no mechanical
 * relationship to a column name at all. That one case is mapped by hand at
 * its own call site; everything else goes through toSnakeCase/toCamelCase
 * below rather than ~40 hand-written per-table mappers.
 *
 * Every push is deep-cloned via JSON round-trip before being sent, not
 * just toRaw()'d — toRaw() only strips the OUTERMOST reactivity proxy
 * (see TASKS.md's toRaw() notes: this project has hit the reactive-Proxy-
 * into-a-storage-layer bug three separate times), and a row built by
 * spreading a value read from a Pinia ref can carry a live Proxy on a
 * NESTED field (an array, in this codebase's actual shapes) even after
 * the outer object is un-proxied. A JSON round-trip can't represent a
 * Proxy at any depth, only the plain data underneath it, and every value
 * this app actually stores (strings, numbers, booleans, null, arrays of
 * those, ISO date strings) survives that round-trip exactly.
 */

function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

// `[a-z0-9]`, not just `[a-z]`: ingredients.kcal_per_100g (and its
// protein/carb/fat/fiber siblings) put a digit right after the
// underscore. .toUpperCase() on a digit is a harmless no-op, so the same
// replacer handles both — kcal_per_100g -> kcalPer100g. This only needs
// to run in the snake_case -> camelCase direction: content rows (the only
// place this pattern occurs) are pulled, never pushed, since they're
// read-only from the client per RLS — toSnakeCase reversing kcalPer100g
// would be genuinely ambiguous (no case signal marks where "100g" was
// meant to start), but nothing ever calls it on a field shaped like this.
function toCamelCase(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

function deepUnwrap<T>(value: T): T {
  return JSON.parse(JSON.stringify(toRaw(value)))
}

/**
 * Domain object (camelCase) -> Postgres row (snake_case). Takes `object`
 * rather than `Record<string, unknown>` on purpose: every real domain
 * type (WorkoutPlan, Profile, ...) is a concrete interface with no index
 * signature, and TypeScript does not consider that assignable to
 * `Record<string, unknown>` even though every property trivially
 * satisfies it — `object` has no such restriction, and `Object.entries`
 * below works on any object regardless.
 */
export function toRow(obj: object): Record<string, unknown> {
  const raw = deepUnwrap(obj)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) out[toSnakeCase(k)] = v
  return out
}

/** Postgres row (snake_case) -> domain object (camelCase). */
export function fromRow<T = Record<string, unknown>>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[toCamelCase(k)] = v
  return out as T
}

/**
 * Best-effort upsert. Never throws and never blocks the caller — appends a
 * message to `warnings` on failure, matching intake.ts's existing
 * submitWarnings convention, since the Dexie write this always runs
 * alongside has already succeeded by the time this is called.
 */
export async function pushRows(table: string, objs: object[], warnings: string[]): Promise<void> {
  if (objs.length === 0) return
  try {
    const { error } = await supabase.from(table).upsert(objs.map(toRow))
    if (error) warnings.push(`Sync to ${table} failed: ${error.message}`)
  } catch (err) {
    warnings.push(`Sync to ${table} failed: ${(err as Error).message}`)
  }
}

export async function pushRow(table: string, obj: object, warnings: string[]): Promise<void> {
  return pushRows(table, [obj], warnings)
}

/**
 * user_targets.activeMealSlots is a client-side array projection of 4
 * separate boolean columns (wants_breakfast etc.) with no mechanical
 * relationship to a column name at all — the one real exception to the
 * generic toRow() mapping (see this module's own header comment). Shared
 * by intake.ts (first write) and claimLocalData.ts (re-push after
 * re-keying), rather than duplicated at each.
 */
export async function pushUserTargets(targets: UserTargets, warnings: string[]): Promise<void> {
  const slots = new Set(targets.activeMealSlots)
  await pushRow(
    'user_targets',
    {
      user_id: targets.userId,
      intake_response_id: targets.intakeResponseId,
      goal: targets.goal,
      activity_factor: targets.activityFactor,
      tdee_kcal: targets.tdeeKcal,
      kcal_target: targets.kcalTarget,
      protein_g: targets.proteinG,
      fat_g: targets.fatG,
      carb_g: targets.carbG,
      days_per_week: targets.daysPerWeek,
      session_minutes: targets.sessionMinutes,
      wants_breakfast: slots.has('breakfast'),
      wants_lunch: slots.has('lunch'),
      wants_dinner: slots.has('dinner'),
      wants_snack: slots.has('snack'),
      cook_time_ceiling: targets.cookTimeCeiling,
      updated_at: targets.updatedAt,
    },
    warnings,
  )
}

/** Best-effort delete by id, mirroring a local hard-delete (workout_logs/
 *  set_logs when unchecking an exercise — the only tables this app's own
 *  write paths actually remove rows from client-side; see docs/schema.md's
 *  deleted_at note for why that's rare rather than the norm here). */
export async function deleteRows(table: string, ids: string[], warnings: string[]): Promise<void> {
  if (ids.length === 0) return
  try {
    const { error } = await supabase.from(table).delete().in('id', ids)
    if (error) warnings.push(`Sync delete from ${table} failed: ${error.message}`)
  } catch (err) {
    warnings.push(`Sync delete from ${table} failed: ${(err as Error).message}`)
  }
}

/**
 * Full-replace sync for pure join/preference tables (user_equipment,
 * user_allergens, etc.) — composite-PK tables with no independent row
 * identity, where "sync" really means "the current membership set for
 * this user", not a delta of individual row edits. Delete-then-insert is
 * simpler and just as correct as diffing for sets this small (never more
 * than a few dozen rows).
 */
export async function replaceSet(table: string, userId: string, objs: object[], warnings: string[]): Promise<void> {
  try {
    const { error: deleteError } = await supabase.from(table).delete().eq('user_id', userId)
    if (deleteError) {
      warnings.push(`Sync to ${table} failed: ${deleteError.message}`)
      return
    }
    if (objs.length > 0) {
      const { error: insertError } = await supabase.from(table).insert(objs.map(toRow))
      if (insertError) warnings.push(`Sync to ${table} failed: ${insertError.message}`)
    }
  } catch (err) {
    warnings.push(`Sync to ${table} failed: ${(err as Error).message}`)
  }
}

/**
 * Pull every row this user owns from an entity table, optionally only
 * those touched since `since` (delta pull, using the per-table watermark
 * in Dexie's syncMeta — see plan.ts/mealPlan.ts's loadActivePlan). Returns
 * null (not throwing) on any failure — a pull failing just means "keep
 * using whatever's already in Dexie", never a reason to break the view.
 */
export async function pullEntityRows(table: string, userId: string, updatedAtColumn: string | null, since: string | null): Promise<Record<string, unknown>[] | null> {
  try {
    let query = supabase.from(table).select('*').eq('user_id', userId)
    if (updatedAtColumn && since) query = query.gt(updatedAtColumn, since)
    const { data, error } = await query
    if (error) return null
    return data
  } catch {
    return null
  }
}

/** Pull every row of a read-only content table (no user filter). */
export async function pullContentTable(table: string): Promise<Record<string, unknown>[] | null> {
  try {
    const { data, error } = await supabase.from(table).select('*')
    if (error) return null
    return data
  } catch {
    return null
  }
}

/**
 * Same shape as pullContentTable, used instead at call sites for a
 * user-owned CHILD table (plan_sessions, plan_items, meal_plan_entries,
 * grocery_items) that has no user_id column of its own — RLS alone,
 * via the parent's user_id, already determines what an unfiltered
 * `select('*')` returns, so there's nothing extra for the client to add.
 */
export const pullOwnedRows = pullContentTable

/**
 * Pure merge, no Dexie/Supabase inside — unit-testable with plain fixture
 * arrays. Last-write-wins on `updatedAtKey` (docs/schema.md's documented
 * sync rule); the remote row wins on an exact tie, since it's the durable
 * copy once a push has already succeeded.
 */
export function mergeByUpdatedAt<T extends object>(local: T[], remote: T[], idKey: keyof T, updatedAtKey: keyof T): T[] {
  return mergeByUpdatedAtKeyed(local, remote, (row) => String(row[idKey]), updatedAtKey)
}

/**
 * Same merge, for a table with no single `id` field — user_exercise_levels
 * ([userId, patternId]), user_recipe_feedback ([userId, recipeId]).
 * `keyOf` derives a comparable string key from a row; everything else is
 * identical to mergeByUpdatedAt, which is really just this with
 * `keyOf = (row) => String(row[idKey])`.
 */
export function mergeByUpdatedAtKeyed<T extends object>(local: T[], remote: T[], keyOf: (row: T) => string, updatedAtKey: keyof T): T[] {
  const byKey = new Map<string, T>()
  for (const row of local) byKey.set(keyOf(row), row)
  for (const row of remote) {
    const key = keyOf(row)
    const existing = byKey.get(key)
    const remoteTime = new Date(row[updatedAtKey] as string).getTime()
    const localTime = existing ? new Date(existing[updatedAtKey] as string).getTime() : -Infinity
    if (remoteTime >= localTime) byKey.set(key, row)
  }
  return [...byKey.values()]
}
