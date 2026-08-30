import type { PlanItem, PlanSession, SetLog, WorkoutLogStatus } from '@/types/domain'

/**
 * Turns "the user tapped the checkbox next to this exercise" into the
 * set_logs rows docs/generator.md §7's promotion engine actually reads.
 * A checkbox has no reps/weight/RPE entry of its own, so ticking it is
 * read as "I did this exactly as prescribed" — every set defaults to the
 * item's own target (top of the rep range for reps, the full hold for
 * seconds). That's a genuine, honest signal for applyWorkoutLog to
 * evaluate, not a placeholder: promotion.ts's "hit target" check is
 * exactly `actual >= target`, and a checked box asserts actual === target.
 * Letting a set's actual value be edited away from the prescription
 * (fewer reps, added weight) is real future work — see TASKS.md — not
 * built here.
 */
export function buildSetLogsForItem(item: PlanItem, workoutLogId: string): SetLog[] {
  const updatedAt = new Date().toISOString()
  return Array.from({ length: item.sets }, (_, i) => ({
    id: crypto.randomUUID(),
    workoutLogId,
    planItemId: item.id,
    exerciseId: item.exerciseId,
    setNumber: i + 1,
    reps: item.targetSeconds === null ? (item.targetRepMax ?? item.targetRepMin ?? null) : null,
    seconds: item.targetSeconds,
    addedWeightKg: null,
    assistBand: null,
    rpe: null,
    updatedAt,
  }))
}

/** A session's status is derived from how many of its items have at
 *  least one logged set — never stored independently of that count, so
 *  the two can't drift apart. Only meaningful once `done >= 1`; a
 *  session with zero logged items has no workout_logs row at all (see
 *  plan.ts's toggleItemChecked), so this is never called with done === 0. */
export function sessionStatusFor(done: number, total: number): WorkoutLogStatus {
  return done >= total ? 'completed' : 'partial'
}

/**
 * "Today's session" — the earliest (by week, then day-within-block order;
 * PlanSession.dayIndex is an order, not a weekday, see that field's own
 * doc comment) session that hasn't been logged as completed yet. Returns
 * null once every session in the plan is done — a real, newly-reachable
 * state now that completion is tracked, which it never was before this.
 */
export function selectNextSession(sessions: readonly PlanSession[], completedSessionIds: ReadonlySet<string>): PlanSession | null {
  const sorted = [...sessions].sort((a, b) => a.weekNumber - b.weekNumber || a.dayIndex - b.dayIndex)
  return sorted.find((s) => !completedSessionIds.has(s.id)) ?? null
}
