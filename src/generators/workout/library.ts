import type {
  Equipment,
  Exercise,
  ExerciseContraindication,
  ExerciseEquipment,
  MovementPattern,
  ProgressionEdge,
} from '@/types/domain'

/**
 * Indexed view over the movement library content tables, built once per
 * generator run. Every other module in this directory takes a
 * MovementLibrary rather than raw arrays — nothing here re-scans a full
 * table to answer a lookup.
 */
export interface MovementLibrary {
  exerciseById: Map<number, Exercise>
  patternById: Map<number, MovementPattern>
  patternBySlug: Map<string, MovementPattern>
  /** Exercises for a pattern, sorted by level ascending (rung 1 first). */
  exercisesByPattern: Map<number, Exercise[]>
  /** Outgoing edges from an exercise, e.g. edgesFrom.get(x) for promotion/regression targets. */
  edgesFrom: Map<number, ProgressionEdge[]>
  /** Incoming edges to an exercise — used to derive "regress" as the
   *  reverse of "promote" when no explicit regression edge exists. */
  edgesTo: Map<number, ProgressionEdge[]>
  equipmentByExercise: Map<number, ExerciseEquipment[]>
  contraindicationsByExercise: Map<number, ExerciseContraindication[]>
}

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = map.get(k)
    if (list) list.push(item)
    else map.set(k, [item])
  }
  return map
}

export function buildLibrary(input: {
  patterns: MovementPattern[]
  exercises: Exercise[]
  edges: ProgressionEdge[]
  equipment: Equipment[]
  exerciseEquipment: ExerciseEquipment[]
  contraindications: ExerciseContraindication[]
}): MovementLibrary {
  const exerciseById = new Map(input.exercises.map((e) => [e.id, e]))
  const patternById = new Map(input.patterns.map((p) => [p.id, p]))
  const patternBySlug = new Map(input.patterns.map((p) => [p.slug, p]))

  const exercisesByPattern = groupBy(input.exercises, (e) => e.patternId)
  for (const list of exercisesByPattern.values()) list.sort((a, b) => a.level - b.level)

  const edgesFrom = groupBy(input.edges, (e) => e.fromExerciseId)
  const edgesTo = groupBy(input.edges, (e) => e.toExerciseId)
  const equipmentByExercise = groupBy(input.exerciseEquipment, (e) => e.exerciseId)
  const contraindicationsByExercise = groupBy(input.contraindications, (c) => c.exerciseId)

  return {
    exerciseById,
    patternById,
    patternBySlug,
    exercisesByPattern,
    edgesFrom,
    edgesTo,
    equipmentByExercise,
    contraindicationsByExercise,
  }
}

/**
 * Same-group rows (a non-zero `alternativeGroup`) are an OR — owning any
 * one satisfies the whole group. Group 0 is not a group in that sense:
 * every group-0 row is its own independent, always-required item (e.g.
 * band-assisted pull-up needs BOTH a bar AND a band — two separate group-0
 * rows, not a choice between them). See ExerciseEquipment in domain.ts.
 */
export function canPerform(
  library: MovementLibrary,
  exerciseId: number,
  ownedEquipment: ReadonlySet<number>,
): boolean {
  const reqs = library.equipmentByExercise.get(exerciseId) ?? []
  const singles = reqs.filter((r) => r.alternativeGroup === 0)
  const groups = groupBy(
    reqs.filter((r) => r.alternativeGroup !== 0),
    (r) => r.alternativeGroup,
  )
  const singlesOk = singles.every((r) => ownedEquipment.has(r.equipmentId))
  const groupsOk = [...groups.values()].every((rows) => rows.some((r) => ownedEquipment.has(r.equipmentId)))
  return singlesOk && groupsOk
}

/**
 * Whether an exercise is off-limits for any currently-flagged body region.
 *
 * Deliberately excludes on BOTH severities, not just 'avoid'. docs/schema.md
 * is explicit about the equivalent allergen case — "exclude outright rather
 * than adding a warning note; a warning on a screen is not a safety
 * feature" — and letting 'caution' through with just a note is exactly
 * that warning-shaped exception. `severity` is kept for display (e.g. an
 * exercise-substitution history explaining *why* something was swapped)
 * but never softens the hard exclusion at generation time.
 */
export function contraindicated(
  library: MovementLibrary,
  exerciseId: number,
  flaggedRegions: ReadonlySet<number>,
): boolean {
  const rows = library.contraindicationsByExercise.get(exerciseId) ?? []
  return rows.some((r) => flaggedRegions.has(r.regionId))
}

/**
 * One rung down. Prefers an explicit 'regression' edge (for future content
 * where the way down isn't just the reverse of the way up); falls back to
 * reversing an incoming 'progression' edge, which is the only kind that
 * exists in the seed data today (see supabase/seed/001_movement_library.sql
 * header comment — no ladder branches yet).
 */
export function regressionOf(library: MovementLibrary, exerciseId: number): number | null {
  const outgoing = library.edgesFrom.get(exerciseId) ?? []
  const explicit = outgoing.find((e) => e.kind === 'regression')
  if (explicit) return explicit.toExerciseId

  const incoming = library.edgesTo.get(exerciseId) ?? []
  const promotionSource = incoming.find((e) => e.kind === 'progression')
  return promotionSource?.fromExerciseId ?? null
}

/**
 * A same-difficulty alternative (e.g. fist push-ups instead of flat-palm,
 * for a wrist issue). Only 'lateral' edges qualify. None exist in the
 * current seed data, so this always returns null for now — that's
 * expected, not a bug (see docs/generator.md §7 "choosing a branch").
 * `rng` is threaded through even though it's unused today so call sites
 * don't need to change when lateral content is added and a real choice
 * among multiple laterals needs to be made deterministically.
 */
export function lateralOf(
  library: MovementLibrary,
  exerciseId: number,
  rng: () => number,
): number | null {
  const laterals = (library.edgesFrom.get(exerciseId) ?? []).filter((e) => e.kind === 'lateral')
  if (laterals.length === 0) return null
  const pick = laterals[Math.floor(rng() * laterals.length)]
  return pick.toExerciseId
}

/**
 * One rung up, for the promotion engine (docs/generator.md §7). Where a
 * rung has more than one outgoing 'progression' edge (a branch — none
 * exist yet), the spec says to pick by goal ("skill takes the skill
 * branch, everything else takes strength") but nothing in the schema
 * tags *which* edge is the skill branch, and there's no real branch to
 * verify a heuristic against yet. Rather than fabricate goal-matching
 * logic with nothing to test it on, this picks deterministically (lowest
 * target exercise id) and reports the ambiguity so it surfaces instead of
 * silently guessing — revisit once branch content exists.
 */
export function promotionOf(
  library: MovementLibrary,
  exerciseId: number,
): { exerciseId: number | null; ambiguous: boolean } {
  const outgoing = (library.edgesFrom.get(exerciseId) ?? []).filter((e) => e.kind === 'progression')
  if (outgoing.length === 0) return { exerciseId: null, ambiguous: false }
  if (outgoing.length === 1) return { exerciseId: outgoing[0].toExerciseId, ambiguous: false }
  const sorted = [...outgoing].sort((a, b) => a.toExerciseId - b.toExerciseId)
  return { exerciseId: sorted[0].toExerciseId, ambiguous: true }
}
