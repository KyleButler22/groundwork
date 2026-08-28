import type { UserExerciseLevel } from '@/types/domain'
import type { MovementLibrary } from '@/generators/workout/library'
import { selectExercise } from '@/generators/workout/selectExercise'

/**
 * docs/intake.md "Ladder placement". Rep-test buckets for 5 of the 8 real
 * patterns; the other 3 (horizontal_pull, hinge, skill_handstand) default
 * to level 2, the doc's own stated fallback for a SKIPPED test — the doc
 * only ever specified 5 tests, written before the 8-pattern seed existed.
 *
 * The vertical_pull table also needed adaptation: the doc's own buckets
 * cross-reference "inverted row" (a horizontal_pull exercise) as a rung
 * on the vertical_pull ladder, which no longer lines up with the seed's
 * separated patterns. Re-mapped here to stay entirely within
 * vertical_pull's own 9 rungs (dead_hang -> band_assisted -> negative ->
 * ...) using the same hang-duration/pull-up-count signal the doc's test
 * already collects — see verticalPullLevel() below.
 */

export const UNTESTED_PATTERN_DEFAULT_LEVEL = 2

interface Bucket {
  /** Inclusive upper bound. The last bucket in a table should use
   *  Infinity so nothing falls through. */
  maxValue: number
  level: number
}

function levelFromBuckets(value: number, buckets: Bucket[]): number {
  for (const b of buckets) if (value <= b.maxValue) return b.level
  return buckets[buckets.length - 1].level
}

/** "0 knee -> wall push-up, 1-8 knee -> incline, 9+knee/0-2 full -> knee
 *  push-up, 3-8 full -> full push-up, 9-15 -> decline/diamond, 16-25 ->
 *  archer, 26+ -> pseudo-planche" — checked top-down so a higher full-rep
 *  count is never shadowed by also asking about knee reps. */
export function horizontalPushLevel(kneeReps: number, fullReps: number): number {
  if (fullReps >= 26) return 7
  if (fullReps >= 16) return 6
  if (fullReps >= 9) return 5
  if (fullReps >= 3) return 4
  if (fullReps >= 1 || kneeReps >= 9) return 3
  if (kneeReps >= 1) return 2
  return 1
}

/**
 * Re-mapped from the doc's table (see module note above) onto
 * vertical_pull's own 9 rungs: dead_hang(1) / band_assisted(2) /
 * negative(3) / pull-up(4) / chinup(5) / archer(6) / l_sit(7) /
 * weighted(8) / one_arm(9). `hangSeconds` is only meaningful — and only
 * asked in the UI — when `pullUpReps` is 0.
 */
export function verticalPullLevel(pullUpReps: number, hangSeconds: number): number {
  if (pullUpReps >= 15) return 8
  if (pullUpReps >= 9) return 6
  if (pullUpReps >= 4) return 5
  if (pullUpReps >= 1) return 4
  if (hangSeconds >= 30) return 3
  if (hangSeconds >= 15) return 2
  return 1
}

/** "0-10 -> box squat, 11-25 -> bodyweight squat, 26-40 -> split squat,
 *  41+ -> Bulgarian split squat" — maps directly onto squat's first 4
 *  rungs (assisted/bodyweight/split/Bulgarian); reaching the higher
 *  pistol-family rungs is the promotion engine's job, not the intake test. */
export function squatLevel(reps: number): number {
  return levelFromBuckets(reps, [
    { maxValue: 10, level: 1 },
    { maxValue: 25, level: 2 },
    { maxValue: 40, level: 3 },
    { maxValue: Infinity, level: 4 },
  ])
}

/**
 * Doc buckets against "knee plank / plank / hollow hold / hanging raise",
 * re-pointed at core's actual rungs: plank_knee(2) / plank_full(3) /
 * hollow_hold_bent(4) / hanging_knee_raise(6). dead_bug(1) is reachable
 * only below a 0s hold (i.e. via the untested-pattern default or a
 * skipped test), since a plank test can't distinguish "can't plank at
 * all" from "never tried" — asking someone to attempt a knee plank
 * first, and only reading none is not implemented here to keep the test
 * to one question; see docs/intake.md open questions.
 */
export function corePlankLevel(seconds: number): number {
  return levelFromBuckets(seconds, [
    { maxValue: 19, level: 2 },
    { maxValue: 45, level: 3 },
    { maxValue: 75, level: 4 },
    { maxValue: Infinity, level: 6 },
  ])
}

/**
 * `holdSeconds` is null for "can't hold it at all". Re-pointed at
 * vertical_push's actual rungs: pike_pushup_floor(1) /
 * pike_pushup_elevated(2) / handstand_hold_wall(3) / hspu_wall_negative(4)
 * — someone who can already hold a wall handstand is ready to start
 * negatives, not sent back to pike push-ups (the doc's literal buckets
 * would do that; re-mapped for internal consistency with the ladder's
 * own difficulty ordering).
 */
export function verticalPushLevel(holdSeconds: number | null): number {
  if (holdSeconds === null) return 1
  return levelFromBuckets(holdSeconds, [
    { maxValue: 19, level: 2 },
    { maxValue: 45, level: 3 },
    { maxValue: Infinity, level: 4 },
  ])
}

/** docs/intake.md §"Then apply three corrections" step 1: "level = max(1,
 *  table_lookup(test_result) - 1)". Self-reported reps are inflated;
 *  starting one rung too easy costs a week, too hard costs an injury and
 *  a user, and the promotion engine climbs fast enough to make up the
 *  difference within a fortnight. */
export function biasDown(testedLevel: number): number {
  return Math.max(1, testedLevel - 1)
}

export interface PlacementTestAnswers {
  skipped: boolean
  horizontalPush?: { kneeReps: number; fullReps: number }
  verticalPull?: { pullUpReps: number; hangSeconds: number }
  squat?: { reps: number }
  core?: { plankSeconds: number }
  verticalPush?: { holdSeconds: number | null }
}

/** Pattern slug -> biased-down target level, for every one of the 5
 *  tested patterns present in `answers`. A skipped test (or a pattern the
 *  doc never gave a table for) is the caller's job to default separately
 *  — see UNTESTED_PATTERN_DEFAULT_LEVEL and resolveStartingLevels(). */
export function computeTestedLevels(answers: PlacementTestAnswers): Record<string, number> {
  if (answers.skipped) return {}
  const levels: Record<string, number> = {}
  if (answers.horizontalPush) {
    levels.horizontal_push = biasDown(horizontalPushLevel(answers.horizontalPush.kneeReps, answers.horizontalPush.fullReps))
  }
  if (answers.verticalPull) {
    levels.vertical_pull = biasDown(verticalPullLevel(answers.verticalPull.pullUpReps, answers.verticalPull.hangSeconds))
  }
  if (answers.squat) {
    levels.squat = biasDown(squatLevel(answers.squat.reps))
  }
  if (answers.core) {
    levels.core = biasDown(corePlankLevel(answers.core.plankSeconds))
  }
  if (answers.verticalPush) {
    levels.vertical_push = biasDown(verticalPushLevel(answers.verticalPush.holdSeconds))
  }
  return levels
}

/**
 * Turns pattern-slug -> target-level into real UserExerciseLevel rows,
 * finding the highest real exercise at or below the target level and then
 * running it through the SAME selectExercise() the workout generator
 * uses (docs/intake.md's own placement pseudocode is equipment/injury
 * gating step for step identical to docs/generator.md's selectExercise —
 * reusing it here means a user's very first placement already reflects
 * what they own and can do, rather than waiting for the first plan
 * generation to discover it).
 */
export function resolveStartingLevels(
  library: MovementLibrary,
  userId: string,
  testedLevels: Record<string, number>,
  ownedEquipment: ReadonlySet<number>,
  flaggedRegions: ReadonlySet<number>,
  rng: () => number,
): UserExerciseLevel[] {
  const now = new Date().toISOString()
  const levels: UserExerciseLevel[] = []

  for (const pattern of library.patternById.values()) {
    const targetLevel = testedLevels[pattern.slug] ?? UNTESTED_PATTERN_DEFAULT_LEVEL
    const chain = library.exercisesByPattern.get(pattern.id) ?? []
    if (chain.length === 0) continue

    let floorMatch = chain[0]
    for (const exercise of chain) {
      if (exercise.level <= targetLevel) floorMatch = exercise
      else break
    }

    const selected = selectExercise(library, floorMatch.id, ownedEquipment, flaggedRegions, rng)
    // If nothing performable exists at all (the known vertical_pull gap —
    // see TASKS.md), still record a row at the untested floor rather than
    // silently omitting the pattern; the workout generator re-checks
    // equipment/injury at generation time regardless, and a missing row
    // here would read as "pattern never placed" rather than "placed, but
    // nothing currently fits".
    const exerciseId = selected.exerciseId ?? floorMatch.id

    levels.push({
      userId,
      patternId: pattern.id,
      exerciseId,
      consecutiveSuccess: 0,
      consecutiveFailure: 0,
      lastEvaluatedAt: now,
    })
  }

  return levels
}
