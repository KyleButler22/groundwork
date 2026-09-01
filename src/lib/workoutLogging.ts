import type { PlanItem, PlanSession, SetLog, WorkoutLog, WorkoutLogStatus } from '@/types/domain'

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

/**
 * How many of the most recently prescribed sessions, counting backward
 * from the latest one actually reached, were completed with nothing
 * partial or skipped in between. Deliberately NOT a calendar-day streak
 * — Strava/Hevy's daily-streak model assumes daily logging, but a
 * periodized 3-5-day/week plan has programmed rest days that would
 * break a naive "consecutive days" count for no real reason. Rest days
 * are simply not their own PlanSession rows, so consecutive `sessions`
 * entries are already only the scheduled training days regardless of
 * how many calendar days sit between them — no special-casing needed.
 * A session with no log at all only avoids breaking the streak when
 * it's LATER than the most recently reached session — i.e. genuinely
 * "not yet gotten to" (see the "ignores sessions later in the plan"
 * test). A gap sitting BEFORE the most recently reached session was
 * bypassed rather than pending, and breaks the streak exactly like an
 * explicit skip does — the same way missing a day breaks a
 * Duolingo-style streak even if a later day was completed (see the
 * "skipped over entirely" test). The most recently reached session
 * being only 'partial' (not fully checked off yet) reads as streak 0,
 * matching how Duolingo-style streaks only count once a day/session is
 * actually finished, not while it's still in progress.
 */
export function computeSessionStreak(sessions: readonly PlanSession[], logs: readonly WorkoutLog[]): number {
  const sorted = [...sessions].sort((a, b) => a.weekNumber - b.weekNumber || a.dayIndex - b.dayIndex)
  const statusBySessionId = new Map<string, WorkoutLogStatus>()
  for (const log of logs) {
    if (log.planSessionId) statusBySessionId.set(log.planSessionId, log.status)
  }

  let lastReachedIndex = -1
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (statusBySessionId.has(sorted[i].id)) {
      lastReachedIndex = i
      break
    }
  }
  if (lastReachedIndex === -1) return 0

  let streak = 0
  for (let i = lastReachedIndex; i >= 0; i--) {
    if (statusBySessionId.get(sorted[i].id) === 'completed') streak++
    else break
  }
  return streak
}
