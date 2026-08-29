import { computed, ref, toRaw } from 'vue'
import { defineStore } from 'pinia'

import { db } from '@/lib/db'
import { buildSetLogsForItem, selectNextSession, sessionStatusFor } from '@/lib/workoutLogging'
import { applyWorkoutLog, buildLibrary, type MovementLibrary, type PromotionEvent } from '@/generators/workout'
import type { Exercise, PlanItem, PlanSession, SetLog, UserExerciseLevel, WorkoutLog, WorkoutPlan } from '@/types/domain'

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
  const workoutLogs = ref<WorkoutLog[]>([])
  const setLogs = ref<SetLog[]>([])
  const levels = ref<UserExerciseLevel[]>([])
  const library = ref<MovementLibrary | null>(null)
  const loading = ref(true)

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

  function patternName(patternId: number): string {
    return library.value?.patternById.get(patternId)?.name ?? `Pattern ${patternId}`
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

  async function loadActivePlan() {
    loading.value = true
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

  // toggleItemChecked does read-then-write on setLogs.value/workoutLogs.value
  // (read the current array, compute the next one, assign it back) — safe
  // for one call at a time, but nothing stopped two overlapping calls
  // (checking off several exercises in quick succession) from each
  // reading setLogs.value before either had written its result back and
  // clobbering each other in memory. Each individual Dexie write would
  // still land safely (bulkAdd/bulkPut don't race), but the reactive
  // array applyWorkoutLog is built from could end up missing an
  // exercise's rows anyway, and the queue below is the fix for that
  // class of bug. This is a defensive fix from reading the code, not a
  // reproduced-and-confirmed one: real-device testing hit exactly this
  // symptom (a session's promotion evaluation covering only 1 of 4
  // logged exercises) after checking off several boxes in a row, but
  // that specific run turned out to be explained by the browser
  // automation tool re-resolving a stale element reference on a page
  // with several structurally-identical sections, not a live race —
  // rebuilding the same sequence with direct, individually-verified
  // clicks came back correct every time. The underlying risk is still
  // real on inspection alone (nothing serialized these calls before this
  // queue existed), so the fix stays; the anecdote just isn't proof.
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

    if (currentlyChecked) {
      const [keep, drop] = partition(setLogs.value, (l) => !(l.planItemId === item.id && l.workoutLogId === log?.id))
      await db.setLogs.bulkDelete(drop.map((l) => l.id))
      setLogs.value = keep

      const remainingForLog = log ? keep.filter((l) => l.workoutLogId === log!.id) : []
      if (log && remainingForLog.length === 0) {
        await db.workoutLogs.delete(log.id)
        workoutLogs.value = workoutLogs.value.filter((l) => l.id !== log!.id)
      } else if (log) {
        const { done, total } = sessionProgressFor(session, keep)
        const updated: WorkoutLog = { ...log, status: sessionStatusFor(done, total) }
        await db.workoutLogs.put(updated)
        workoutLogs.value = workoutLogs.value.map((l) => (l.id === updated.id ? updated : l))
      }
      return
    }

    if (!log) {
      log = { id: crypto.randomUUID(), userId, planSessionId: session.id, performedAt: new Date().toISOString(), durationMinutes: null, sessionRpe: null, status: 'partial', note: null }
      await db.workoutLogs.add(log)
      workoutLogs.value = [...workoutLogs.value, log]
    }

    const newLogs = buildSetLogsForItem(item, log.id)
    await db.setLogs.bulkAdd(newLogs)
    const allSetLogs = [...setLogs.value, ...newLogs]
    setLogs.value = allSetLogs

    const { done, total } = sessionProgressFor(session, allSetLogs)
    const status = sessionStatusFor(done, total)
    const wasComplete = log.status === 'completed'
    const updatedLog: WorkoutLog = { ...log, status }
    await db.workoutLogs.put(updatedLog)
    workoutLogs.value = workoutLogs.value.map((l) => (l.id === updatedLog.id ? updatedLog : l))

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
    hasPlan,
    sessionsByWeek,
    nextSession,
    weekProgress,
    blockProgress,
    promotionMessages,
    itemsForSession,
    exerciseName,
    isItemChecked,
    sessionProgress,
    loadActivePlan,
    toggleItemChecked,
    dismissPromotionMessages,
  }
})
