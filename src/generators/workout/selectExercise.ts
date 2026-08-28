import { canPerform, contraindicated, lateralOf, type MovementLibrary, regressionOf } from './library'

export type SubstitutionReason = 'equipment' | 'injury_lateral' | 'injury_regression'

export interface Substitution {
  from: number
  to: number
  reason: SubstitutionReason
}

export interface SelectExerciseResult {
  /** null if no performable, non-contraindicated exercise exists anywhere
   *  down the ladder from the starting rung. */
  exerciseId: number | null
  /** Every step taken to get there, in order — useful for tests and for a
   *  future UI explaining "swapped to X because of your wrist". */
  substitutions: Substitution[]
}

// Ladders in the real seed data are at most 9 rungs deep. This is a
// generous safety cap against an unbounded loop, not a tuned value — it
// should never actually bind, including once branches exist, since a
// pattern's edges always point toward strictly decreasing level.
const MAX_STEPS = 32

/**
 * docs/generator.md §2. Starting from the user's current rung on a
 * pattern, walks down for equipment first, then sideways-then-down for an
 * injury — re-checking both after every move, not just once, so a rung
 * reached by regressing for equipment can't slip through still
 * contraindicated (the doc's pseudocode shows one pass of each check;
 * this generalizes it to keep checking until a stable, valid rung is
 * found or the ladder is exhausted).
 */
export function selectExercise(
  library: MovementLibrary,
  startExerciseId: number,
  ownedEquipment: ReadonlySet<number>,
  flaggedRegions: ReadonlySet<number>,
  rng: () => number,
): SelectExerciseResult {
  const substitutions: Substitution[] = []
  let current = startExerciseId

  for (let step = 0; step < MAX_STEPS; step++) {
    if (!canPerform(library, current, ownedEquipment)) {
      const next = regressionOf(library, current)
      if (next === null) return { exerciseId: null, substitutions }
      substitutions.push({ from: current, to: next, reason: 'equipment' })
      current = next
      continue
    }

    if (contraindicated(library, current, flaggedRegions)) {
      // Sideways before down — wrist pain doesn't mean no pushing, it
      // means fists or parallettes (docs/generator.md §2).
      const lateral = lateralOf(library, current, rng)
      if (lateral !== null) {
        substitutions.push({ from: current, to: lateral, reason: 'injury_lateral' })
        current = lateral
        continue
      }
      const regressed = regressionOf(library, current)
      if (regressed === null) return { exerciseId: null, substitutions }
      substitutions.push({ from: current, to: regressed, reason: 'injury_regression' })
      current = regressed
      continue
    }

    return { exerciseId: current, substitutions }
  }

  // Unreachable given the real content (ladders are short, strictly
  // decreasing) — fail closed rather than return something unverified.
  return { exerciseId: null, substitutions }
}
