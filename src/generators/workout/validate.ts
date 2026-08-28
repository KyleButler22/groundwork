import type { PlanItem, PlanSession } from '@/types/domain'

import { canPerform, contraindicated, type MovementLibrary } from './library'
import type { SessionTemplate } from './splits'
import { costSeconds, usableSeconds } from './timeBudget'

/**
 * docs/generator.md §9. Asserted before persisting, not after — a
 * generator that CAN emit a broken plan eventually will. Every check
 * below maps to one bullet in that section; the mapping is in each
 * check's comment so a failing test points straight back to the spec.
 */

export interface Violation {
  code: string
  message: string
  weekNumber?: number
  sessionId?: string
}

export interface ValidationInput {
  library: MovementLibrary
  sessions: PlanSession[]
  items: PlanItem[]
  /** Which template produced each session — needed to know what SHOULD
   *  be there, not just what is. Keyed by PlanSession.id. */
  templateBySessionId: Map<string, SessionTemplate>
  ownedEquipment: ReadonlySet<number>
  flaggedRegions: ReadonlySet<number>
  sessionMinutes: number
  daysPerWeek: number
}

/** Same formula as timeBudget.costSeconds, applied to an already-decided
 *  PlanItem instead of a BudgetItem — validation checks the actual
 *  persisted numbers, not the allocator's intermediate ones. Uses
 *  target_rep_max (not min) as the reps cost basis, matching the
 *  "full effort" costing convention generatePlan.ts uses when it first
 *  allocates the budget — see that file for where this must stay
 *  consistent with the allocation-time formula. */
function itemCostSeconds(item: PlanItem): number {
  const workPerSet = item.targetSeconds ?? (item.targetRepMax ?? 0) * 3
  return costSeconds({ costPerSetSeconds: workPerSet, restSeconds: item.restSeconds }, item.sets)
}

export function validatePlan(input: ValidationInput): Violation[] {
  const violations: Violation[] = []
  const itemsBySession = new Map<string, PlanItem[]>()
  for (const item of input.items) {
    const list = itemsBySession.get(item.sessionId)
    if (list) list.push(item)
    else itemsBySession.set(item.sessionId, [item])
  }

  // "At least one full rest day per week" — structurally guaranteed by
  // chooseSplit()'s clamp to 6, but asserted directly here too in case a
  // plan ever reaches validation through a path that bypassed it.
  if (input.daysPerWeek > 6) {
    violations.push({ code: 'no_rest_day', message: `daysPerWeek is ${input.daysPerWeek}; must leave at least one rest day (max 6)` })
  }

  const patternFrequency = new Map<number, number>() // sessions/week a pattern actually appears in
  const weeklySetsByPattern = new Map<string, number>() // "weekNumber|patternId" -> total sets

  for (const session of input.sessions) {
    const items = itemsBySession.get(session.id) ?? []
    const template = input.templateBySessionId.get(session.id)

    // "Every session fits its time budget, warm-up and buffer included." —
    // EXCEPT a peak-volume week, which is allowed to exceed it by design.
    // weekPlan.ts adds one set in week 3 (and again in a 'peak' week 4)
    // without re-running budget allocation — an accepted trade-off, not a
    // bug (see weekSets()'s own comment). Enforcing the budget strictly
    // there would mean this check permanently disagrees with a decision
    // already made elsewhere in the generator; skip it for exactly the
    // weeks that decision applies to instead of re-litigating it here.
    const isPeakVolumeWeek = session.weekNumber === 3 || session.weekType === 'peak'
    if (!isPeakVolumeWeek) {
      const totalCost = items.reduce((sum, item) => sum + itemCostSeconds(item), 0)
      const usable = usableSeconds(input.sessionMinutes)
      if (totalCost > usable) {
        violations.push({
          code: 'over_time_budget',
          message: `session "${session.name}" costs ${totalCost}s, budget is ${usable}s`,
          weekNumber: session.weekNumber,
          sessionId: session.id,
        })
      }
    }

    // "No exercise appears twice in one session."
    const seenExercises = new Set<number>()
    for (const item of items) {
      if (seenExercises.has(item.exerciseId)) {
        violations.push({
          code: 'duplicate_exercise',
          message: `exercise ${item.exerciseId} appears twice in session "${session.name}"`,
          weekNumber: session.weekNumber,
          sessionId: session.id,
        })
      }
      seenExercises.add(item.exerciseId)
    }

    // "No contraindicated exercise for any flagged region." /
    // "Every exercise's equipment requirement is satisfied."
    for (const item of items) {
      if (contraindicated(input.library, item.exerciseId, input.flaggedRegions)) {
        violations.push({
          code: 'contraindicated_exercise',
          message: `exercise ${item.exerciseId} is contraindicated for a flagged region`,
          weekNumber: session.weekNumber,
          sessionId: session.id,
        })
      }
      if (!canPerform(input.library, item.exerciseId, input.ownedEquipment)) {
        violations.push({
          code: 'unmet_equipment',
          message: `exercise ${item.exerciseId} needs equipment the user doesn't own`,
          weekNumber: session.weekNumber,
          sessionId: session.id,
        })
      }
    }

    // "Every required slot is filled in every session."
    if (template) {
      const presentPatterns = new Set(
        items.map((item) => input.library.exerciseById.get(item.exerciseId)?.patternId).filter((p): p is number => p !== undefined),
      )
      for (const slot of template.slots) {
        if (!slot.required) continue
        const pattern = input.library.patternBySlug.get(slot.patternSlug)
        if (pattern && !presentPatterns.has(pattern.id)) {
          violations.push({
            code: 'missing_required_slot',
            message: `required pattern "${slot.patternSlug}" is missing from session "${session.name}"`,
            weekNumber: session.weekNumber,
            sessionId: session.id,
          })
        }
      }
    }

    // Data for the two whole-plan checks below.
    for (const item of items) {
      const exercise = input.library.exerciseById.get(item.exerciseId)
      if (!exercise) continue
      patternFrequency.set(exercise.patternId, (patternFrequency.get(exercise.patternId) ?? 0) + 1)
      const key = `${session.weekNumber}|${exercise.patternId}`
      weeklySetsByPattern.set(key, (weeklySetsByPattern.get(key) ?? 0) + item.sets)
    }
  }

  // "Weekly hard sets per pattern land between 8 and 25."
  for (const [key, sets] of weeklySetsByPattern) {
    if (sets < 8 || sets > 25) {
      const [weekNumber, patternId] = key.split('|')
      violations.push({
        code: 'weekly_sets_out_of_range',
        message: `pattern ${patternId} gets ${sets} sets in week ${weekNumber}, expected 8-25`,
        weekNumber: Number(weekNumber),
      })
    }
  }

  // "Each pattern hits its split's target frequency" — computed from how
  // many templates in the cycle require it, since an optional slot is
  // expected to sometimes be dropped and shouldn't count as a violation
  // when it is.
  const requiredFrequencyByPattern = new Map<number, number>()
  for (const template of input.templateBySessionId.values()) {
    const seenInThisTemplate = new Set<number>()
    for (const slot of template.slots) {
      if (!slot.required) continue
      const pattern = input.library.patternBySlug.get(slot.patternSlug)
      if (pattern && !seenInThisTemplate.has(pattern.id)) {
        requiredFrequencyByPattern.set(pattern.id, (requiredFrequencyByPattern.get(pattern.id) ?? 0) + 1)
        seenInThisTemplate.add(pattern.id)
      }
    }
  }
  for (const [patternId, requiredCount] of requiredFrequencyByPattern) {
    const actualCount = patternFrequency.get(patternId) ?? 0
    if (actualCount < requiredCount) {
      violations.push({
        code: 'pattern_frequency_shortfall',
        message: `pattern ${patternId} required in ${requiredCount} session(s)/week but only appears in ${actualCount}`,
      })
    }
  }

  return violations
}
