import type { UserExerciseLevel, WeekType } from '@/types/domain'

import type { MovementLibrary } from './library'
import type { ResolvedPrescription } from './prescription'

/**
 * docs/generator.md §6. Within a 4-week block the EXERCISE stays fixed —
 * changing it is the promotion engine's job (promotion.ts), on its own
 * schedule, not the calendar. What changes week to week here is volume
 * (sets) and where in the rep/hold range the target sits.
 */

/** Week 4 branches on real signal, not the calendar alone — a fixed
 *  "every 4th week is a deload" ignores whether anyone actually needs one. */
export function weekType(
  weekNumber: number,
  anyPatternAtOrAboveLevel5: boolean,
  weeksTrainedTotal: number,
): WeekType {
  if (weekNumber !== 4) return 'build'
  return anyPatternAtOrAboveLevel5 || weeksTrainedTotal >= 8 ? 'deload' : 'peak'
}

/** Whether ANY pattern's current rung has reached the given level —
 *  the deload trigger checks this across every pattern, not just one. */
export function anyPatternAtOrAboveLevel(
  library: MovementLibrary,
  levels: UserExerciseLevel[],
  threshold: number,
): boolean {
  return levels.some((l) => {
    const exercise = library.exerciseById.get(l.exerciseId)
    return exercise !== undefined && exercise.level >= threshold
  })
}

/**
 * Sets per week: base → base → base+1 → conditional (docs/generator.md §6
 * table). "base" is whatever timeBudget.ts allocated for the block — this
 * function only adjusts relative to it, it never re-runs budget
 * allocation, which means week 3's extra set (and a peak week 4's) is
 * allowed to make the session run a little over its nominal length. A
 * one-week intensification is treated as an accepted trade-off, not
 * re-fitted into the same time budget — see docs/generator.md open
 * questions for the related "warm-up generation" gap this sits next to;
 * neither is resolved by re-budgeting per week.
 */
export function weekSets(baseSets: number, weekNumber: number, type: WeekType, maxSets: number): number {
  if (weekNumber === 1 || weekNumber === 2) return baseSets
  if (weekNumber === 3) return Math.min(baseSets + 1, maxSets)
  // Week 4.
  if (type === 'deload') {
    // Floors at 1, deliberately NOT at minSets — minSets is the goal's
    // normal-week floor (e.g. 4 for a fixed muscle_gain prescription),
    // and a deload is explicitly supposed to drop below that. Flooring
    // at minSets here would cancel the deload for exactly the goals
    // where min === max.
    return Math.max(Math.ceil(baseSets / 2), 1)
  }
  return Math.min(baseSets + 1, maxSets) // peak: a second hard week, not a let-up
}

/**
 * Reps creep as a RANGE that narrows toward the top of the intersected
 * range across the block (bottom-half → centered-middle → top-half) —
 * matching plan_items storing both a min and a max for reps. Week 4
 * repeats week 1's band on deload, week 3's on peak.
 */
function creepRange(lo: number, hi: number, weekNumber: number, type: WeekType): { min: number; max: number } {
  const span = hi - lo
  if (weekNumber === 1) return { min: lo, max: Math.round(lo + span / 2) }
  if (weekNumber === 2) return { min: Math.round(lo + span / 4), max: Math.round(hi - span / 4) }
  if (weekNumber === 3) return { min: Math.round(hi - span / 2), max: hi }
  return type === 'deload' ? { min: lo, max: Math.round(lo + span / 2) } : { min: Math.round(hi - span / 2), max: hi }
}

/**
 * A hold's target is a single number (plan_items.target_seconds has no
 * min/max pair, unlike reps — see prescription.ts), creeping lo → mid →
 * hi across the block, same week-4 branch as reps.
 */
function creepPoint(lo: number, hi: number, weekNumber: number, type: WeekType): number {
  if (weekNumber === 1) return lo
  if (weekNumber === 2) return Math.round((lo + hi) / 2)
  if (weekNumber === 3) return hi
  return type === 'deload' ? lo : hi
}

export interface WeekTarget {
  sets: number
  targetRepMin: number | null
  targetRepMax: number | null
  targetSeconds: number | null
}

export function resolveWeekTarget(
  prescription: ResolvedPrescription,
  baseSets: number,
  weekNumber: number,
  type: WeekType,
): WeekTarget {
  const sets = weekSets(baseSets, weekNumber, type, prescription.maxSets)

  if (prescription.metricType === 'reps') {
    const { min, max } = creepRange(prescription.repMin!, prescription.repMax!, weekNumber, type)
    return { sets, targetRepMin: min, targetRepMax: max, targetSeconds: null }
  }
  if (prescription.metricType === 'time_seconds') {
    const point = creepPoint(prescription.holdMinS!, prescription.holdMaxS!, weekNumber, type)
    return { sets, targetRepMin: null, targetRepMax: null, targetSeconds: point }
  }
  // distance_m: no per-week creep model exists (see prescription.ts's
  // same documented gap) — sets still progress, the distance doesn't.
  return { sets, targetRepMin: null, targetRepMax: null, targetSeconds: null }
}
