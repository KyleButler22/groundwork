import type { PlanItem, SetLog, UserExerciseLevel, WeekType } from '@/types/domain'

import type { MovementLibrary } from './library'
import { promotionOf, regressionOf } from './library'

/**
 * docs/generator.md §7 — double progression. Runs after every completed
 * workout; reads set_logs against the plan_items they were logged
 * against; updates user_exercise_levels. Deliberately takes `now` as an
 * input rather than calling `new Date()` internally — promotion is
 * triggered by a real event at a real time, but the function itself
 * stays pure and testable, same as every other module in this directory.
 */

export interface PromotionInput {
  library: MovementLibrary
  levels: UserExerciseLevel[]
  setLogs: SetLog[]
  planItems: PlanItem[]
  weekType: WeekType
  now: string // ISO timestamp
}

export type PromotionEvent =
  | { type: 'promoted'; patternId: number; from: number; to: number; ambiguousBranch: boolean }
  | { type: 'regressed'; patternId: number; from: number; to: number }
  | { type: 'held'; patternId: number; exerciseId: number }
  /** docs/generator.md §7 "top of the ladder": promotion has nowhere to
   *  go. The doc's fix is switching to load progression (added_weight_kg,
   *  already a set_logs column) — but user_exercise_levels has no field
   *  to record "this pattern is now in load-progression mode", so that
   *  switch isn't implemented here. This event exists so the ceiling is
   *  surfaced rather than silently swallowed; wiring it to an actual UI
   *  prompt or a schema addition is future work. */
  | { type: 'ceiling_reached'; patternId: number; exerciseId: number }
  /** docs/generator.md §7's own "regression floor" open question,
   *  resolved here: three straight failures at the floor of a ladder have
   *  nowhere to regress to. Per the doc's own suggested direction, this
   *  holds the exercise in place and resets the counter rather than
   *  looping — a real fix (reduced volume, a form-check prompt) is a UI
   *  concern layered on top of this event, not something this function
   *  can act on with only user_exercise_levels to write to. */
  | { type: 'regression_floor_reached'; patternId: number; exerciseId: number }
  /** A logged set with no plan_item_id (a freestyle/unplanned set) has no
   *  target to compare against, so it's excluded from evaluation — this
   *  says so rather than silently dropping it. */
  | { type: 'skipped_no_target'; patternId: number }

export interface PromotionOutcome {
  levels: UserExerciseLevel[]
  events: PromotionEvent[]
}

// A hold has only ONE stored target (target_seconds), not a min/max pair
// the way reps do — see prescription.ts and weekPlan.ts for why. There is
// therefore no stored "failure floor" for a hold; this fraction of the
// target stands in for one. Documented interpretation, not from the spec.
const HOLD_FAILURE_FRACTION = 0.7

export function applyWorkoutLog(input: PromotionInput): PromotionOutcome {
  // "deloads never count" — docs/generator.md §7.
  if (input.weekType === 'deload') return { levels: input.levels, events: [] }

  const planItemById = new Map(input.planItems.map((pi) => [pi.id, pi]))
  const levelByPattern = new Map(input.levels.map((l) => [l.patternId, l]))

  const logsByPattern = new Map<number, SetLog[]>()
  const skippedPatterns = new Set<number>()

  for (const log of input.setLogs) {
    const exercise = input.library.exerciseById.get(log.exerciseId)
    if (!exercise) continue
    const patternId = exercise.patternId

    if (!log.planItemId || !planItemById.has(log.planItemId)) {
      skippedPatterns.add(patternId)
      continue
    }
    const list = logsByPattern.get(patternId)
    if (list) list.push(log)
    else logsByPattern.set(patternId, [log])
  }

  const events: PromotionEvent[] = []
  const updated = new Map(levelByPattern)

  for (const [patternId, logs] of logsByPattern) {
    const state = levelByPattern.get(patternId)
    if (!state) continue // no placement recorded for this pattern yet — nothing to evaluate against

    let allHitTarget = true
    let anyBelowFloor = false

    for (const log of logs) {
      const item = planItemById.get(log.planItemId!)!
      if (item.targetSeconds !== null) {
        const actual = log.seconds ?? 0
        if (actual < item.targetSeconds) allHitTarget = false
        if (actual < item.targetSeconds * HOLD_FAILURE_FRACTION) anyBelowFloor = true
      } else {
        const actual = log.reps ?? 0
        const max = item.targetRepMax ?? Infinity
        const min = item.targetRepMin ?? -Infinity
        if (actual < max) allHitTarget = false
        if (actual < min) anyBelowFloor = true
      }
    }

    const next: UserExerciseLevel = { ...state }
    if (allHitTarget) {
      next.consecutiveSuccess += 1
      next.consecutiveFailure = 0
    } else if (anyBelowFloor) {
      next.consecutiveFailure += 1
      next.consecutiveSuccess = 0
    } else {
      // In range — neither a clean sweep nor a floor miss. Only the
      // success streak resets here; consecutiveFailure is deliberately
      // left untouched, exactly as written in docs/generator.md §7's
      // pseudocode. That means a failure streak survives an in-between
      // session and only needs one more real miss to trigger a
      // regression. This is what's specified, not an oversight — flag it
      // in docs/generator.md if it turns out to feel wrong in practice,
      // rather than quietly changing it here.
      next.consecutiveSuccess = 0
    }

    if (next.consecutiveSuccess >= 2) {
      const { exerciseId: target, ambiguous } = promotionOf(input.library, next.exerciseId)
      if (target !== null) {
        events.push({ type: 'promoted', patternId, from: next.exerciseId, to: target, ambiguousBranch: ambiguous })
        next.exerciseId = target
      } else {
        events.push({ type: 'ceiling_reached', patternId, exerciseId: next.exerciseId })
      }
      next.consecutiveSuccess = 0
    } else if (next.consecutiveFailure >= 3) {
      const target = regressionOf(input.library, next.exerciseId)
      if (target !== null) {
        events.push({ type: 'regressed', patternId, from: next.exerciseId, to: target })
        next.exerciseId = target
      } else {
        events.push({ type: 'regression_floor_reached', patternId, exerciseId: next.exerciseId })
      }
      next.consecutiveFailure = 0
    } else {
      events.push({ type: 'held', patternId, exerciseId: next.exerciseId })
    }

    next.lastEvaluatedAt = input.now
    updated.set(patternId, next)
  }

  for (const patternId of skippedPatterns) {
    if (!logsByPattern.has(patternId)) events.push({ type: 'skipped_no_target', patternId })
  }

  return { levels: [...updated.values()], events }
}
