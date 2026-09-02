import { computed, ref, toRaw } from 'vue'
import { defineStore } from 'pinia'

import { db } from '@/lib/db'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { deleteRows, fromRow, mergeByUpdatedAt, mergeByUpdatedAtKeyed, pullEntityRows, pullOwnedRows, pushRow, pushRows } from '@/lib/sync'
import { buildSetLogsForItem, computeSessionStreak, selectNextSession, sessionStatusFor } from '@/lib/workoutLogging'
import { applyWorkoutLog, buildLibrary, type MovementLibrary, type PromotionEvent } from '@/generators/workout'
import type { Equipment, ExerciseEquipment, Exercise, PlanItem, PlanSession, SetLog, UserExerciseLevel, WorkoutLog, WorkoutPlan } from '@/types/domain'

/**
 * Reads the locally-cached active plan (written by the intake flow's
 * submit(), or by a future regenerate action) — Dexie only for now, since
 * there's no Supabase → Dexie sync yet (see TASKS.md). Once that sync
 * exists this store's read side doesn't need to change, only where the
 * data first lands.
 *
 * Also owns completion tracking: checking off an exercise writes real
 * workout_logs/set_logs rows (docs/schema.md §3), the same tables
 * docs/generator.md §7's promotion engine reads — see toggleItemChecked.
 */
export const usePlanStore = defineStore('plan', () => {
  const plan = ref<WorkoutPlan | null>(null)
  const sessions = ref<PlanSession[]>([])
  const items = ref<PlanItem[]>([])
  const exercisesById = ref<Map<number, Exercise>>(new Map())
  const equipmentById = ref<Map<number, Equipment>>(new Map())
  const workoutLogs = ref<WorkoutLog[]>([])
  const setLogs = ref<SetLog[]>([])
  const levels = ref<UserExerciseLevel[]>([])
  const library = ref<MovementLibrary | null>(null)
  const loading = ref(true)
  // Best-effort sync failures (see sync.ts) — not currently rendered by
  // any view, same "data exists, UI catches up later" spirit as several
  // other things this session shipped without a display yet (see
  // TASKS.md). Never blocks anything; the Dexie write these follow has
  // already succeeded by the time one of these gets pushed.
  const warnings = ref<string[]>([])

  // Transient — the events applyWorkoutLog returned from the most recent
  // session completion, so any view can show "🎉 Promoted" etc. regardless
  // of which screen the checkbox was actually tapped on. Cleared by the
  // view once shown; a fresh toggleItemChecked call also replaces it.
  const promotionEvents = ref<PromotionEvent[]>([])

  const hasPlan = computed(() => plan.value !== null)

  const sessionsByWeek = computed(() => {
    const map = new Map<number, PlanSession[]>()
    for (const s of sessions.value) {
      const list = map.get(s.weekNumber)
      if (list) list.push(s)
      else map.set(s.weekNumber, [s])
    }
    for (const list of map.values()) list.sort((a, b) => a.dayIndex - b.dayIndex)
    return map
  })

  function itemsForSession(sessionId: string): PlanItem[] {
    return items.value.filter((i) => i.sessionId === sessionId).sort((a, b) => a.orderIndex - b.orderIndex)
  }

  function exerciseName(exerciseId: number): string {
    return exercisesById.value.get(exerciseId)?.name ?? `Exercise ${exerciseId}`
  }
  function exercise(exerciseId: number): Exercise | undefined {
    return exercisesById.value.get(exerciseId)
  }

  function patternName(patternId: number): string {
    return library.value?.patternById.get(patternId)?.name ?? `Pattern ${patternId}`
  }
  function patternSlug(patternId: number): string | undefined {
    return library.value?.patternById.get(patternId)?.slug
  }

  /** Raw exercise_equipment join rows for one exercise — a same
   *  (non-zero) alternativeGroup means "any one satisfies this"; group 0
   *  (or a different group) means every row is independently required.
   *  See ExerciseEquipment's own doc comment. Left as raw rows rather
   *  than pre-formatted text so the view decides how to render the OR/AND
   *  grouping, same "store hands back data, view formats it" split as
   *  everywhere else in this file. */
  function equipmentForExercise(exerciseId: number): ExerciseEquipment[] {
    return library.value?.equipmentByExercise.get(exerciseId) ?? []
  }
  function equipmentName(equipmentId: number): string {
    return equipmentById.value.get(equipmentId)?.name ?? `Equipment ${equipmentId}`
  }

  /** Plain-English readouts of the last toggleItemChecked call's
   *  promotion events, for a view to render directly without needing to
   *  know PromotionEvent's shape — same "store hands the view a string,
   *  not a discriminated union to interpret" convention mealPlan.ts's
   *  warnings uses. */
  const promotionMessages = computed(() => promotionEvents.value.map(describeEvent))

  function describeEvent(event: PromotionEvent): string {
    switch (event.type) {
      case 'promoted':
        return `${patternName(event.patternId)}: promoted from ${exerciseName(event.from)} to ${exerciseName(event.to)} 🎉`
      case 'regressed':
        return `${patternName(event.patternId)}: stepped back to ${exerciseName(event.to)} — a few tough sessions in a row.`
      case 'ceiling_reached':
        return `${patternName(event.patternId)}: you've topped out ${exerciseName(event.exerciseId)}! Try adding reps beyond the usual range, or weight.`
      case 'regression_floor_reached':
        return `${patternName(event.patternId)}: holding at ${exerciseName(event.exerciseId)} for now — that's the easiest variation there is.`
      case 'skipped_no_target':
        return `${patternName(event.patternId)}: logged a set with no matching exercise in today's plan.`
      case 'held':
        return `${patternName(event.patternId)}: on track.`
    }
  }

  /** Every plan_item id with at least one logged set, across all of this
   *  plan's history — a plan_item belongs to exactly one session
   *  occurrence, so this needs no separate per-session scoping. */
  const checkedItemIds = computed(() => {
    const ids = new Set<string>()
    for (const log of setLogs.value) if (log.planItemId) ids.add(log.planItemId)
    return ids
  })

  function isItemChecked(itemId: string): boolean {
    return checkedItemIds.value.has(itemId)
  }

  /** At most one workout_logs row per plan_session — enforced by
   *  toggleItemChecked below (find-or-create), not by a DB constraint. */
  const workoutLogBySessionId = computed(() => {
    const map = new Map<string, WorkoutLog>()
    for (const log of workoutLogs.value) if (log.planSessionId) map.set(log.planSessionId, log)
    return map
  })

  const completedSessionIds = computed(() => {
    const ids = new Set<string>()
    for (const [sessionId, log] of workoutLogBySessionId.value) if (log.status === 'completed') ids.add(sessionId)
    return ids
  })

  /** {done, total} exercises checked off for one session — drives both
   *  the per-session progress readout and (done >= total) its completed
   *  state, without those two ever being able to disagree. */
  function sessionProgress(sessionId: string): { done: number; total: number } {
    const sessionItems = itemsForSession(sessionId)
    const done = sessionItems.filter((i) => isItemChecked(i.id)).length
    return { done, total: sessionItems.length }
  }

  const weekProgress = computed(() => {
    const map = new Map<number, { done: number; total: number }>()
    for (const [weekNumber, weekSessions] of sessionsByWeek.value) {
      let done = 0
      for (const s of weekSessions) if (completedSessionIds.value.has(s.id)) done++
      map.set(weekNumber, { done, total: weekSessions.length })
    }
    return map
  })

  const blockProgress = computed(() => ({ done: completedSessionIds.value.size, total: sessions.value.length }))

  /** "Today's session" — see selectNextSession's own doc comment. null
   *  means every session in the plan has been completed. */
  const nextSession = computed(() => selectNextSession(sessions.value, completedSessionIds.value))

  /** See computeSessionStreak's own doc comment (workoutLogging.ts) for
   *  why this counts sessions, not calendar days. */
  const sessionStreak = computed(() => computeSessionStreak(sessions.value, workoutLogs.value))

  /**
   * Pulls this user's workout_plans/workout_logs/set_logs/
   * user_exercise_levels from Supabase and merges into Dexie before the
   * rest of loadActivePlan reads it — same last-write-wins-on-updatedAt
   * design as mealPlan.ts's pullMealData, see that function's own
   * comment for why there's no stored watermark. plan_sessions/plan_items
   * have no updatedAt (generated once, never updated after — see
   * docs/schema.md section 3) so those two are a plain upsert, not a
   * merge — there's no possible conflict to resolve for a row that never
   * changes once created.
   */
  async function pullWorkoutData(userId: string): Promise<void> {
    const [remotePlans, remoteLogs, remoteLevels] = await Promise.all([
      pullEntityRows('workout_plans', userId, null, null),
      pullEntityRows('workout_logs', userId, null, null),
      pullEntityRows('user_exercise_levels', userId, null, null),
    ])

    if (remotePlans) {
      const local = await db.workoutPlans.toArray()
      const merged = mergeByUpdatedAt(local, remotePlans.map((r) => fromRow<WorkoutPlan>(r)), 'id', 'updatedAt')
      await db.workoutPlans.bulkPut(merged)

      const planIds = merged.map((p) => p.id)
      const remoteSessions = await pullOwnedRows('plan_sessions')
      if (remoteSessions && planIds.length > 0) {
        const sessions = remoteSessions.map((r) => fromRow<PlanSession>(r)).filter((s) => planIds.includes(s.planId))
        await db.planSessions.bulkPut(sessions)

        const sessionIds = sessions.map((s) => s.id)
        const remoteItems = await pullOwnedRows('plan_items')
        if (remoteItems && sessionIds.length > 0) {
          await db.planItems.bulkPut(remoteItems.map((r) => fromRow<PlanItem>(r)).filter((i) => sessionIds.includes(i.sessionId)))
        }
      }
    }

    if (remoteLogs) {
      const local = await db.workoutLogs.toArray()
      const merged = mergeByUpdatedAt(local, remoteLogs.map((r) => fromRow<WorkoutLog>(r)), 'id', 'updatedAt')
      await db.workoutLogs.bulkPut(merged)

      const logIds = merged.map((l) => l.id)
      const remoteSetLogs = await pullOwnedRows('set_logs')
      if (remoteSetLogs && logIds.length > 0) {
        const localSetLogs = await db.setLogs.where('workoutLogId').anyOf(logIds).toArray()
        const remoteMapped = remoteSetLogs.map((r) => fromRow<SetLog>(r)).filter((s) => logIds.includes(s.workoutLogId))
        await db.setLogs.bulkPut(mergeByUpdatedAt(localSetLogs, remoteMapped, 'id', 'updatedAt'))
      }
    }

    if (remoteLevels) {
      const local = await db.userExerciseLevels.toArray()
      const merged = mergeByUpdatedAtKeyed(local, remoteLevels.map((r) => fromRow<UserExerciseLevel>(r)), (l) => `${l.userId}|${l.patternId}`, 'updatedAt')
      await db.userExerciseLevels.bulkPut(merged)
    }
  }

  async function loadActivePlan(userId: string) {
    loading.value = true
    if (userId !== LOCAL_DEV_USER_ID) await pullWorkoutData(userId)
    const active = await db.workoutPlans.where('status').equals('active').first()
    plan.value = active ?? null

    if (active) {
      sessions.value = await db.planSessions.where('planId').equals(active.id).toArray()
      const sessionIds = new Set(sessions.value.map((s) => s.id))
      items.value = (await db.planItems.toArray()).filter((i) => sessionIds.has(i.sessionId))

      const [allExercises, patterns, edges, equipment, exerciseEquipment, contraindications, allLogs, allSetLogs, allLevels] = await Promise.all([
        db.exercises.toArray(),
        db.movementPatterns.toArray(),
        db.progressionEdges.toArray(),
        db.equipment.toArray(),
        db.exerciseEquipment.toArray(),
        db.exerciseContraindications.toArray(),
        db.workoutLogs.toArray(),
        db.setLogs.toArray(),
        db.userExerciseLevels.toArray(),
      ])
      exercisesById.value = new Map(allExercises.map((e) => [e.id, e]))
      equipmentById.value = new Map(equipment.map((e) => [e.id, e]))
      library.value = buildLibrary({ patterns, exercises: allExercises, edges, equipment, exerciseEquipment, contraindications })

      const sessionLogIds = new Set(
        allLogs.filter((l) => l.planSessionId && sessionIds.has(l.planSessionId)).map((l) => l.id),
      )
      workoutLogs.value = allLogs.filter((l) => l.planSessionId && sessionIds.has(l.planSessionId))
      setLogs.value = allSetLogs.filter((l) => sessionLogIds.has(l.workoutLogId))
      levels.value = allLevels
    } else {
      sessions.value = []
      items.value = []
      workoutLogs.value = []
      setLogs.value = []
      levels.value = []
      library.value = null
    }
    loading.value = false
  }

  // Shared by every function below that does read-then-write on
  // setLogs.value/workoutLogs.value (read the current array, compute the
  // next one, assign it back) — safe for one call at a time, but nothing
  // stops two overlapping calls from each reading the array before
  // either had written its result back and clobbering each other in
  // memory, even though each individual Dexie write still lands safely
  // (bulkAdd/put don't race — the race is purely in which call's stale
  // in-memory snapshot gets written last). toggleItemChecked's own risk
  // here was originally a defensive, uncomfirmed one (see git history —
  // the live symptom that first prompted this queue turned out to be a
  // browser-automation artifact, not a real race). updateSetLog's is
  // not: editing a set's reps and then its weight in quick succession —
  // an entirely ordinary thing to do, tabbing between two fields on the
  // same row — reliably reproduced exactly this class of bug, the second
  // write silently reverting the first. One shared queue, not one per
  // function, because both touch the same underlying refs and could race
  // against EACH OTHER just as easily as against themselves.
  let mutationQueue: Promise<void> = Promise.resolve()

  function toggleItemChecked(userId: string, session: PlanSession, item: PlanItem): Promise<void> {
    const run = mutationQueue.then(() => toggleItemCheckedNow(userId, session, item))
    mutationQueue = run.catch(() => {})
    return run
  }

  /**
   * Check (or uncheck) one exercise for one session occurrence.
   *
   * Checking: find-or-create today's workout_logs row for this session,
   * write set_logs for every prescribed set (buildSetLogsForItem — each
   * defaulted to the item's own target, since a checkbox has no reps/
   * weight entry of its own), then recompute the session's status. The
   * MOMENT that status transitions to 'completed' (not on every toggle —
   * see below), docs/generator.md §7's promotion engine runs for real,
   * for the first time in this app: applyWorkoutLog reads exactly this
   * session's newly-written set_logs against user_exercise_levels and
   * returns which patterns promoted/regressed/held.
   *
   * Unchecking: deletes that item's set_logs; deletes the workout_logs
   * row entirely once it has zero remaining set_logs (no log = nothing
   * happened yet, same convention as everywhere else "delete when empty"
   * matters in this codebase). Deliberately does NOT reverse a promotion
   * that already fired — user_exercise_levels has no history to roll
   * back to, and an uncheck-after-completion is a rare, deliberate edge
   * case, not the common path. Documented in TASKS.md, not silently
   * "fixed" with an undo system nobody asked for.
   *
   * Completed-transition can refire if a session is un/re-completed after
   * the fact (same reasoning) — also documented there rather than solved
   * with a schema addition to track "has this workout already been
   * evaluated".
   */
  async function toggleItemCheckedNow(userId: string, session: PlanSession, item: PlanItem): Promise<void> {
    promotionEvents.value = []
    const currentlyChecked = isItemChecked(item.id)
    let log = workoutLogBySessionId.value.get(session.id) ?? null

    const sync = userId !== LOCAL_DEV_USER_ID

    if (currentlyChecked) {
      const [keep, drop] = partition(setLogs.value, (l) => !(l.planItemId === item.id && l.workoutLogId === log?.id))
      await db.setLogs.bulkDelete(drop.map((l) => l.id))
      setLogs.value = keep
      if (sync) await deleteRows('set_logs', drop.map((l) => l.id), warnings.value)

      const remainingForLog = log ? keep.filter((l) => l.workoutLogId === log!.id) : []
      if (log && remainingForLog.length === 0) {
        await db.workoutLogs.delete(log.id)
        workoutLogs.value = workoutLogs.value.filter((l) => l.id !== log!.id)
        if (sync) await deleteRows('workout_logs', [log.id], warnings.value)
      } else if (log) {
        const { done, total } = sessionProgressFor(session, keep)
        const updated: WorkoutLog = { ...log, status: sessionStatusFor(done, total), updatedAt: new Date().toISOString() }
        await db.workoutLogs.put(updated)
        workoutLogs.value = workoutLogs.value.map((l) => (l.id === updated.id ? updated : l))
        if (sync) await pushRow('workout_logs', updated, warnings.value)
      }
      return
    }

    if (!log) {
      log = {
        id: crypto.randomUUID(),
        userId,
        planSessionId: session.id,
        performedAt: new Date().toISOString(),
        durationMinutes: null,
        sessionRpe: null,
        status: 'partial',
        note: null,
        updatedAt: new Date().toISOString(),
      }
      await db.workoutLogs.add(log)
      workoutLogs.value = [...workoutLogs.value, log]
    }

    const newLogs = buildSetLogsForItem(item, log.id)
    await db.setLogs.bulkAdd(newLogs)
    if (sync) await pushRows('set_logs', newLogs, warnings.value)
    const allSetLogs = [...setLogs.value, ...newLogs]
    setLogs.value = allSetLogs

    const { done, total } = sessionProgressFor(session, allSetLogs)
    const status = sessionStatusFor(done, total)
    const wasComplete = log.status === 'completed'
    const updatedLog: WorkoutLog = { ...log, status, updatedAt: new Date().toISOString() }
    await db.workoutLogs.put(updatedLog)
    workoutLogs.value = workoutLogs.value.map((l) => (l.id === updatedLog.id ? updatedLog : l))
    if (sync) await pushRow('workout_logs', updatedLog, warnings.value)

    if (status === 'completed' && !wasComplete && library.value) {
      const sessionSetLogs = allSetLogs.filter((l) => l.workoutLogId === updatedLog.id)
      const outcome = applyWorkoutLog({
        library: library.value,
        // toRaw() per entry, not just on the array: applyWorkoutLog passes
        // every pattern with no logs this session straight through
        // unchanged into its return value, which means (without this)
        // outcome.levels below would be a MIX of fresh plain objects
        // (spread copies, for patterns it actually evaluated) and the
        // ORIGINAL live Vue reactive Proxy objects (for every pattern it
        // didn't touch) — still sitting inside levels.value. bulkPut()
        // throws DataCloneError on the first Proxy it hits and Dexie
        // never attempts the remaining rows, so whichever patterns
        // happened to sort after that point in the array silently never
        // got their promotion persisted at all. Exact same class of bug
        // as mealPlan.ts's toggleLock/toggleGroceryItemChecked (see
        // TASKS.md) — found here by manually completing a real session
        // and watching only ONE of four just-logged patterns actually
        // persist, then bisecting with a try/catch around bulkPut itself
        // until the DataCloneError surfaced.
        levels: levels.value.map((l) => toRaw(l)),
        setLogs: sessionSetLogs,
        planItems: items.value,
        weekType: session.weekType,
        now: new Date().toISOString(),
      })
      await db.userExerciseLevels.bulkPut(outcome.levels)
      if (sync) await pushRows('user_exercise_levels', outcome.levels, warnings.value)
      // outcome.levels is always a subset of levels.value that already
      // existed — applyWorkoutLog silently skips any pattern with no
      // prior placement row (see its own "no placement recorded yet"
      // comment) rather than inventing one, and intake's ladder
      // placement (src/lib/intake/placement.ts) writes one row per
      // pattern up front. So this is always an update, never an insert.
      const updatedByKey = new Map(outcome.levels.map((l) => [`${l.userId}|${l.patternId}`, l]))
      levels.value = levels.value.map((l) => updatedByKey.get(`${l.userId}|${l.patternId}`) ?? l)
      promotionEvents.value = outcome.events.filter((e) => e.type !== 'held')
    }
  }

  function sessionProgressFor(session: PlanSession, logs: readonly SetLog[]): { done: number; total: number } {
    const sessionItems = itemsForSession(session.id)
    const checked = new Set(logs.filter((l) => l.planItemId).map((l) => l.planItemId))
    return { done: sessionItems.filter((i) => checked.has(i.id)).length, total: sessionItems.length }
  }

  function dismissPromotionMessages(): void {
    promotionEvents.value = []
  }

  /** A checked item's logged sets, in set-number order — buildSetLogsForItem
   *  (src/lib/workoutLogging.ts) creates exactly item.sets of these,
   *  defaulted to the target, the moment the checkbox is first ticked; an
   *  unchecked item simply has none yet. */
  function setLogsForItem(itemId: string): SetLog[] {
    return setLogs.value.filter((l) => l.planItemId === itemId).sort((a, b) => a.setNumber - b.setNumber)
  }

  /**
   * Edits one already-logged set's actual reps/seconds/weight away from
   * the target-hit default buildSetLogsForItem wrote. SetLog has no
   * array/object fields, so unlike toggleItemChecked's writes there's no
   * toRaw() concern here — every field is a plain primitive.
   *
   * Deliberately does NOT re-run applyWorkoutLog even if this edit would
   * change whether the session's promotion evaluation should have gone
   * differently — same "a completed session's evaluation happened once,
   * at that moment, on whatever was logged then" philosophy
   * toggleItemChecked's own doc comment already states for the
   * uncheck/recheck case. Retroactively re-grading a decision the
   * promotion engine already made would need history this schema doesn't
   * keep; recording what actually happened, for its own sake, is the
   * whole point of this action, not a way to relitigate a promotion.
   *
   * Routed through the same mutationQueue as toggleItemChecked (both
   * read-modify-write setLogs.value) — found by literally reproducing it:
   * editing a set's reps and its weight in quick succession fired two
   * overlapping calls, the second of which read setLogs.value BEFORE the
   * first had written its result back, so its own put() carried the
   * stale pre-edit reps value forward and silently overwrote the first
   * edit the moment it resolved. Real, reproduced, not the accessibility-
   * ref red herring from the workout-completion session — tabbing
   * quickly between two fields on the same set is an entirely ordinary
   * way to trigger this.
   */
  function updateSetLog(setLogId: string, changes: Partial<Pick<SetLog, 'reps' | 'seconds' | 'addedWeightKg' | 'rpe'>>, userId: string): Promise<void> {
    const run = mutationQueue.then(() => updateSetLogNow(setLogId, changes, userId))
    mutationQueue = run.catch(() => {})
    return run
  }

  async function updateSetLogNow(
    setLogId: string,
    changes: Partial<Pick<SetLog, 'reps' | 'seconds' | 'addedWeightKg' | 'rpe'>>,
    userId: string,
  ): Promise<void> {
    const existing = setLogs.value.find((l) => l.id === setLogId)
    if (!existing) return
    const updated: SetLog = { ...existing, ...changes, updatedAt: new Date().toISOString() }
    await db.setLogs.put(updated)
    setLogs.value = setLogs.value.map((l) => (l.id === setLogId ? updated : l))
    if (userId !== LOCAL_DEV_USER_ID) await pushRow('set_logs', updated, warnings.value)
  }

  function partition<T>(arr: readonly T[], predicate: (item: T) => boolean): [T[], T[]] {
    const keep: T[] = []
    const drop: T[] = []
    for (const item of arr) (predicate(item) ? keep : drop).push(item)
    return [keep, drop]
  }

  return {
    plan,
    sessions,
    items,
    loading,
    warnings,
    hasPlan,
    library,
    levels,
    sessionsByWeek,
    nextSession,
    sessionStreak,
    weekProgress,
    blockProgress,
    promotionMessages,
    itemsForSession,
    exerciseName,
    exercise,
    patternName,
    patternSlug,
    equipmentForExercise,
    equipmentName,
    isItemChecked,
    sessionProgress,
    setLogsForItem,
    loadActivePlan,
    toggleItemChecked,
    updateSetLog,
    dismissPromotionMessages,
  }
})
