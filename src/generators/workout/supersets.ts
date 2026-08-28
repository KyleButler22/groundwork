import type { MovementLibrary } from './library'

/**
 * docs/generator.md §5. The doc states the four pairing rules as prose
 * ("antagonistic or unrelated", "co-locatable") without a formula for
 * either — both are made concrete here, documented as interpretations
 * rather than pretending they're spelled out in the spec:
 *
 *  - "Antagonistic or unrelated" -> different movement-pattern CATEGORY.
 *    Two push patterns (or two pull, two legs, two core) work overlapping
 *    muscle groups, which is exactly what a superset needs one side to
 *    rest FROM while the other works — same-category pairs would just be
 *    fatigue stacking, not the density benefit the doc is after.
 *  - "Co-locatable" -> either exercise needs no equipment at all (always
 *    fine), or the two share at least one piece of equipment. There's no
 *    spatial/gym-layout data in the schema to check real co-location
 *    against, so this is a conservative proxy: it may block some pairs
 *    that would in fact be fine side by side, but it never approves one
 *    that requires walking to a different station.
 */

export interface SupersetCandidate {
  slotId: string
  patternId: number
  exerciseId: number
}

export interface SupersetPair {
  a: SupersetCandidate
  b: SupersetCandidate
}

export interface PairingResult {
  pairs: SupersetPair[]
  /** Everything left over — either it never found a compatible partner,
   *  or there was an odd one out. Not a failure; these stay single items. */
  unpaired: SupersetCandidate[]
}

function equipmentIds(library: MovementLibrary, exerciseId: number): Set<number> {
  return new Set((library.equipmentByExercise.get(exerciseId) ?? []).map((r) => r.equipmentId))
}

function coLocatable(library: MovementLibrary, exerciseA: number, exerciseB: number): boolean {
  const eqA = equipmentIds(library, exerciseA)
  const eqB = equipmentIds(library, exerciseB)
  if (eqA.size === 0 || eqB.size === 0) return true
  for (const id of eqA) if (eqB.has(id)) return true
  return false
}

/** Rule 3's "level 7+" is read against the real seed data's ceiling —
 *  ladders in supabase/seed/001_movement_library.sql top out around 7-9,
 *  so this excludes roughly the top two rungs of any pattern from ever
 *  being supersetted. */
const NO_SUPERSET_LEVEL_FLOOR = 7

export function canPair(library: MovementLibrary, a: SupersetCandidate, b: SupersetCandidate): boolean {
  const patternA = library.patternById.get(a.patternId)
  const patternB = library.patternById.get(b.patternId)
  if (!patternA || !patternB) return false
  if (patternA.category === 'skill' || patternB.category === 'skill') return false
  if (patternA.category === patternB.category) return false

  const exerciseA = library.exerciseById.get(a.exerciseId)
  const exerciseB = library.exerciseById.get(b.exerciseId)
  if (!exerciseA || !exerciseB) return false
  if (exerciseA.level >= NO_SUPERSET_LEVEL_FLOOR || exerciseB.level >= NO_SUPERSET_LEVEL_FLOOR) return false

  return coLocatable(library, a.exerciseId, b.exerciseId)
}

/**
 * Greedy, order-dependent pairing: walk the candidates in performance
 * order, and for each still-unpaired item take the FIRST later compatible
 * partner. Not a globally-optimal matching — a real bipartite matching
 * would occasionally pair one or two more items — but it's simple,
 * deterministic given a deterministic input order (which performance
 * order already is), and "good enough" is the standard the whole
 * generator is built to, per docs/generator.md's own framing of the
 * meal-plan sibling problem as NP-hard-if-solved-exactly.
 */
export function pairForSuperset(library: MovementLibrary, candidates: SupersetCandidate[]): PairingResult {
  const used = new Set<string>()
  const pairs: SupersetPair[] = []

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i]
    if (used.has(a.slotId)) continue
    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j]
      if (used.has(b.slotId)) continue
      if (canPair(library, a, b)) {
        pairs.push({ a, b })
        used.add(a.slotId)
        used.add(b.slotId)
        break
      }
    }
  }

  const unpaired = candidates.filter((c) => !used.has(c.slotId))
  return { pairs, unpaired }
}
