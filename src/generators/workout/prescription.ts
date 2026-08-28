import type { Goal, MetricType } from '@/types/domain'

import type { MovementLibrary } from './library'
import { regressionOf } from './library'

export interface GoalPrescription {
  minSets: number
  maxSets: number
  repMin: number
  repMax: number
  /**
   * Holds get their own range, deliberately NOT the same numbers as reps.
   * docs/generator.md §4 only tables rep ranges per goal; a hold's
   * difficulty knob is duration, not a rep count, and reusing the rep
   * numbers verbatim would prescribe nonsense (a "10-15 second" fat-loss
   * hold is arbitrary; a "3-6 second" skill hold is too short to be a
   * real attempt). These are a documented interpretation, not from the
   * spec text — revisit if that section gets a hold-specific table.
   */
  holdMinS: number
  holdMaxS: number
  restSeconds: number
}

// docs/generator.md §4. Where the doc gives a range for sets, min !==
// max; where it gives a fixed number (muscle_gain: 4, maintain: 3),
// min === max, which also means timeBudget's upgrade pass has nothing to
// upgrade — correct, since "4 sets" isn't "up to 4 sets".
//
// Rest seconds are the doc's range, collapsed to its midpoint rounded to
// the nearest 5s. "skill" reps are the doc's "low" — read as 3-6, distinct
// from muscle_gain's 6-12 and fat_loss's 10-15 (documented interpretation,
// same reasoning as the hold-range note above).
export const GOAL_PRESCRIPTIONS: Record<Goal, GoalPrescription> = {
  fat_loss: { minSets: 3, maxSets: 4, repMin: 10, repMax: 15, holdMinS: 20, holdMaxS: 40, restSeconds: 55 },
  muscle_gain: { minSets: 4, maxSets: 4, repMin: 6, repMax: 12, holdMinS: 20, holdMaxS: 40, restSeconds: 120 },
  recomp: { minSets: 3, maxSets: 4, repMin: 8, repMax: 12, holdMinS: 20, holdMaxS: 40, restSeconds: 85 },
  maintain: { minSets: 3, maxSets: 3, repMin: 8, repMax: 12, holdMinS: 20, holdMaxS: 40, restSeconds: 90 },
  skill: { minSets: 2, maxSets: 3, repMin: 3, repMax: 6, holdMinS: 10, holdMaxS: 30, restSeconds: 150 },
}

export interface ResolvedPrescription {
  metricType: MetricType
  repMin: number | null
  repMax: number | null
  holdMinS: number | null
  holdMaxS: number | null
  restSeconds: number
  minSets: number
  maxSets: number
}

export interface PrescriptionResult {
  exerciseId: number
  prescription: ResolvedPrescription
}

/** docs/generator.md §4: `rep_min = max(goal.min, ex.min); rep_max =
 *  min(goal.max, ex.max)`. Empty intersection (min > max) means the goal's
 *  and the exercise's ranges don't overlap at all — returns null so the
 *  caller regresses and retries, rather than silently clamping to
 *  something incoherent like "reps: 12-8". */
export function intersectRange(
  goalMin: number,
  goalMax: number,
  exerciseMin: number,
  exerciseMax: number,
): { min: number; max: number } | null {
  const min = Math.max(goalMin, exerciseMin)
  const max = Math.min(goalMax, exerciseMax)
  return min <= max ? { min, max } : null
}

const MAX_STEPS = 32 // see selectExercise.ts — same bound, same justification

/**
 * Resolves sets/reps-or-hold/rest for an exercise against a goal,
 * regressing one rung at a time when the ranges don't overlap ("one-arm
 * push-up, 4×15" — docs/generator.md §4). Assumes `startExerciseId` has
 * already cleared equipment/injury gating via selectExercise() — this
 * only ever regresses further for a goal-fit reason, and the caller
 * should re-validate equipment/injury on whatever it returns (ladders
 * only add equipment requirements going UP in the real seed data, so
 * further regression is expected to stay valid, but that's a property of
 * the content, not something this function can guarantee on its own).
 */
export function resolvePrescription(
  library: MovementLibrary,
  startExerciseId: number,
  goal: Goal,
): PrescriptionResult | null {
  const goalRx = GOAL_PRESCRIPTIONS[goal]
  let current = startExerciseId

  for (let step = 0; step < MAX_STEPS; step++) {
    const exercise = library.exerciseById.get(current)
    if (!exercise) return null

    if (exercise.metricType === 'reps') {
      const range = intersectRange(goalRx.repMin, goalRx.repMax, exercise.repMin!, exercise.repMax!)
      if (range) {
        return {
          exerciseId: current,
          prescription: {
            metricType: 'reps',
            repMin: range.min,
            repMax: range.max,
            holdMinS: null,
            holdMaxS: null,
            restSeconds: goalRx.restSeconds,
            minSets: goalRx.minSets,
            maxSets: goalRx.maxSets,
          },
        }
      }
    } else if (exercise.metricType === 'time_seconds') {
      const range = intersectRange(goalRx.holdMinS, goalRx.holdMaxS, exercise.holdMinS!, exercise.holdMaxS!)
      if (range) {
        return {
          exerciseId: current,
          prescription: {
            metricType: 'time_seconds',
            repMin: null,
            repMax: null,
            holdMinS: range.min,
            holdMaxS: range.max,
            restSeconds: goalRx.restSeconds,
            minSets: goalRx.minSets,
            maxSets: goalRx.maxSets,
          },
        }
      }
    } else {
      // distance_m (handstand walks): no goal table has a distance
      // dimension, so there is nothing to intersect against — prescribe
      // the exercise's own range as-is. A real, documented gap in
      // docs/generator.md §4, not an oversight here; revisit if distance
      // exercises need goal-sensitive prescription later.
      return {
        exerciseId: current,
        prescription: {
          metricType: 'distance_m',
          repMin: null,
          repMax: null,
          holdMinS: null,
          holdMaxS: null,
          restSeconds: goalRx.restSeconds,
          minSets: goalRx.minSets,
          maxSets: goalRx.maxSets,
        },
      }
    }

    const next = regressionOf(library, current)
    if (next === null) return null
    current = next
  }

  return null
}
