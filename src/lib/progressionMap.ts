import { promotionOf } from '@/generators/workout/library'
import type { MovementLibrary } from '@/generators/workout/library'
import type { MovementPattern, PatternCategory, UserExerciseLevel } from '@/types/domain'

export type NodeStatus = 'completed' | 'current' | 'locked'

export interface ProgressionNode {
  exerciseId: number
  name: string
  level: number
  status: NodeStatus
}

export interface PatternProgress {
  patternId: number
  patternName: string
  category: PatternCategory
  nodes: ProgressionNode[]
}

export interface PromotionCandidate {
  patternId: number
  patternName: string
  consecutiveSuccess: number
}

/**
 * One entry per pattern in the library, ordered by sortOrder — sorted
 * explicitly here rather than trusting Map iteration order, which
 * reflects insertion order (ultimately whatever order Dexie's
 * `.toArray()` happens to return), not a documented sort_order guarantee.
 *
 * Below the user's current exercise for a pattern = completed, at it =
 * current, above = locked. No user_exercise_levels row yet for a pattern
 * = rung 1 (the lowest level) is treated as current — that's genuinely
 * where the generator would start someone on this pattern, so it's a
 * real answer, not a placeholder empty state.
 */
export function buildProgressionMap(library: MovementLibrary, levels: readonly UserExerciseLevel[]): PatternProgress[] {
  const levelByPattern = new Map(levels.map((l) => [l.patternId, l]))

  const patterns = [...library.patternById.values()].sort((a, b) => a.sortOrder - b.sortOrder)

  return patterns.map((pattern) => {
    const exercises = library.exercisesByPattern.get(pattern.id) ?? []
    const currentRow = levelByPattern.get(pattern.id)
    const currentExercise = currentRow ? library.exerciseById.get(currentRow.exerciseId) : undefined
    const currentLevel = currentExercise?.level ?? exercises[0]?.level

    const nodes: ProgressionNode[] = exercises.map((exercise) => {
      let status: NodeStatus = 'locked'
      if (currentLevel !== undefined) {
        if (exercise.level < currentLevel) status = 'completed'
        else if (exercise.level === currentLevel) status = 'current'
      }
      return { exerciseId: exercise.id, name: exercise.name, level: exercise.level, status }
    })

    return { patternId: pattern.id, patternName: pattern.name, category: pattern.category, nodes }
  })
}

/**
 * The pattern closest to its next promotion: highest consecutiveSuccess,
 * restricted to rows that are genuinely "one away" (a positive streak —
 * 0 means no current streak, not "far away") and genuinely promotable
 * (promotionOf returns null once a pattern is on its final rung, so a
 * streak there is real progress but not a "level up" nudge). Ties break
 * on the pattern's own sortOrder, lower wins.
 *
 * Returns null when nothing qualifies — no rows yet, every streak is
 * zero, or every positive streak belongs to an already-maxed pattern.
 * These are three shapes of "nothing to nudge about", not three cases to
 * special-case separately.
 */
export function findClosestToPromotion(
  patterns: readonly MovementPattern[],
  levels: readonly UserExerciseLevel[],
  library: MovementLibrary,
): PromotionCandidate | null {
  const patternById = new Map(patterns.map((p) => [p.id, p]))

  type Candidate = { level: UserExerciseLevel; pattern: MovementPattern }
  const candidates: Candidate[] = []
  for (const l of levels) {
    if (l.consecutiveSuccess <= 0) continue
    if (promotionOf(library, l.exerciseId).exerciseId === null) continue
    const pattern = patternById.get(l.patternId)
    if (!pattern) continue
    candidates.push({ level: l, pattern })
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.level.consecutiveSuccess - a.level.consecutiveSuccess || a.pattern.sortOrder - b.pattern.sortOrder)
  const best = candidates[0]
  return { patternId: best.pattern.id, patternName: best.pattern.name, consecutiveSuccess: best.level.consecutiveSuccess }
}
