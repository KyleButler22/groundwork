import type { Goal, PlanItem, PlanSession, UserExerciseLevel, WorkoutPlan } from '@/types/domain'

import { rngFor } from '../shared/rng'
import { canPerform, contraindicated, type MovementLibrary } from './library'
import { resolvePrescription, type ResolvedPrescription } from './prescription'
import { selectExercise } from './selectExercise'
import { chooseSplit, plainestFallback, type SessionTemplate, type SlotTemplate, type SplitChoice } from './splits'
import { pairForSuperset, type SupersetCandidate } from './supersets'
import { allocateBudget, type BudgetItem } from './timeBudget'
import { validatePlan, type Violation } from './validate'
import { anyPatternAtOrAboveLevel, resolveWeekTarget, weekType } from './weekPlan'

/**
 * docs/generator.md, top to bottom. Pure function: same inputs and seed
 * always produce the same plan (§8) — no network, no wall-clock reads
 * (see promotion.ts's `now` parameter for the same discipline applied
 * there), no randomness outside rngFor(seed, ...coordinates).
 *
 * IDs on the returned WorkoutPlan/PlanSession/PlanItem are synthetic
 * placeholders ("draft-..."), NOT real primary keys — deliberately, since
 * minting real ids (crypto.randomUUID() or a Postgres default) is an
 * impure, persistence-layer concern this function has no business owning.
 * The "draft-" prefix is not just a label: it also means a caller that
 * forgets to remap these before insert gets a hard failure at the
 * database's `uuid` column type check, rather than silently writing junk
 * rows — the same "fail loud, not quiet" instinct as elsewhere in this
 * codebase (see src/lib/supabase.ts's placeholder-client warning).
 */

const WEEKS_PER_BLOCK = 4

export interface GeneratePlanInput {
  userId: string
  goal: Goal
  daysPerWeek: number
  sessionMinutes: number
  levels: UserExerciseLevel[]
  ownedEquipment: ReadonlySet<number>
  flaggedRegions: ReadonlySet<number>
  library: MovementLibrary
  seed: number
  startsOn: string
  generatorVersion: string
  /** Drives the week-4 deload trigger alongside anyPatternAtOrAboveLevel5
   *  (docs/generator.md §6) — total weeks trained across every past plan,
   *  not just this one. */
  weeksTrainedTotal: number
}

export interface GeneratePlanResult {
  plan: WorkoutPlan
  sessions: PlanSession[]
  items: PlanItem[]
  /** Which SessionTemplate produced each session (keyed by the session's
   *  synthetic id) — exposed so a caller can re-run validatePlan() itself
   *  (this function already does, for the fallback decision below) or
   *  explain a missing slot in the UI, without having to re-derive which
   *  split/template was actually used, including in the fallback case. */
  templateBySessionId: Map<string, SessionTemplate>
  /** Non-fatal issues surfaced rather than swallowed: dropped slots,
   *  validation violations that survived the fallback attempt, etc. */
  warnings: string[]
  usedFallback: boolean
}

interface ResolvedSlot {
  slot: SlotTemplate
  patternId: number
  exerciseId: number
  prescription: ResolvedPrescription
}

/**
 * docs/intake.md's goal -> training-shape table gives 'skill' a low
 * rep count (2-3 sets x "low") — but that describes SKILL PRACTICE
 * itself (handstand work, quality over fatigue), not a rule for every
 * other pattern in the same session. Applying GOAL_PRESCRIPTIONS.skill's
 * 3-6 rep range to squats/pushes/core too was a real bug found via the
 * integration test: those patterns' normal exercises sit at 6-15+ reps,
 * so almost nothing overlapped and every non-skill slot failed to
 * resolve. A 'skill' plan's supporting work uses 'maintain' numbers
 * instead — "eating stays flat, training changes shape" (docs/intake.md)
 * describes the skill slot getting priority and low-fatigue treatment,
 * not the whole session collapsing to low reps.
 */
function effectivePrescriptionGoal(goal: Goal, patternSlug: string): Goal {
  if (goal === 'skill' && patternSlug !== 'skill_handstand') return 'maintain'
  return goal
}

function startingExerciseFor(library: MovementLibrary, levels: UserExerciseLevel[], patternId: number): number | null {
  const existing = levels.find((l) => l.patternId === patternId)
  if (existing) return existing.exerciseId
  // No placement recorded for this pattern (shouldn't normally happen —
  // intake places every tested pattern — but fails safe rather than
  // crashing): start at the floor of the ladder.
  const chain = library.exercisesByPattern.get(patternId)
  return chain && chain.length > 0 ? chain[0].id : null
}

/** Resolves one slot to a concrete, goal-fit, equipment/injury-valid
 *  exercise, or null with a reason if nothing down the ladder works. */
function resolveSlot(
  library: MovementLibrary,
  slot: SlotTemplate,
  levels: UserExerciseLevel[],
  ownedEquipment: ReadonlySet<number>,
  flaggedRegions: ReadonlySet<number>,
  goal: Goal,
  rng: () => number,
  warnings: string[],
): ResolvedSlot | null {
  const pattern = library.patternBySlug.get(slot.patternSlug)
  if (!pattern) {
    warnings.push(`slot template references unknown pattern "${slot.patternSlug}"`)
    return null
  }

  const start = startingExerciseFor(library, levels, pattern.id)
  if (start === null) {
    warnings.push(`pattern "${slot.patternSlug}" has no exercises in the library at all`)
    return null
  }

  const selected = selectExercise(library, start, ownedEquipment, flaggedRegions, rng)
  if (selected.exerciseId === null) {
    warnings.push(`pattern "${slot.patternSlug}": no performable, non-contraindicated exercise found`)
    return null
  }

  const resolved = resolvePrescription(library, selected.exerciseId, effectivePrescriptionGoal(goal, slot.patternSlug))
  if (resolved === null) {
    warnings.push(`pattern "${slot.patternSlug}": no goal-compatible rep/hold range found down the ladder`)
    return null
  }

  // resolvePrescription may have regressed FURTHER than selectExercise did
  // (for goal-fit, not equipment/injury). Ladders only add equipment
  // requirements going up in the real seed data, so this is expected to
  // already be valid — but re-checking rather than assuming keeps that an
  // enforced property instead of a hopeful one. See prescription.ts's own
  // note on this integration contract.
  if (resolved.exerciseId !== selected.exerciseId) {
    const stillOk =
      canPerform(library, resolved.exerciseId, ownedEquipment) && !contraindicated(library, resolved.exerciseId, flaggedRegions)
    if (!stillOk) {
      warnings.push(`pattern "${slot.patternSlug}": goal-fit regression landed on an exercise that fails equipment/injury gating`)
      return null
    }
  }

  return { slot, patternId: pattern.id, exerciseId: resolved.exerciseId, prescription: resolved.prescription }
}

function costPerSetSeconds(prescription: ResolvedPrescription): number {
  if (prescription.metricType === 'reps') return (prescription.repMax ?? 0) * 3
  if (prescription.metricType === 'time_seconds') return prescription.holdMaxS ?? 0
  // distance_m: no per-set time-cost model exists (see prescription.ts's
  // matching gap) — contributes only rest/transition to the budget, which
  // understates real cost. Low-impact today: the only distance_m exercise
  // in the seed (handstand_walk) sits at the very ceiling of its ladder.
  return 0
}

/** Builds week 1's exercise selections, prescriptions, and time-budgeted
 *  sets for one session template — the only week that does real
 *  selection work; weeks 2-4 reuse it (docs/generator.md §6). */
function buildBaseSession(
  library: MovementLibrary,
  template: SessionTemplate,
  levels: UserExerciseLevel[],
  ownedEquipment: ReadonlySet<number>,
  flaggedRegions: ReadonlySet<number>,
  goal: Goal,
  sessionMinutes: number,
  seed: number,
  dayIndex: number,
  warnings: string[],
): { resolved: ResolvedSlot[]; baseSetsBySlug: Map<string, number>; supersetGroupBySlug: Map<string, number> } {
  const activeSlots = template.slots.filter((s) => !s.onlyIfSkillGoal || goal === 'skill')

  const resolvedSlots: ResolvedSlot[] = []
  for (const slot of activeSlots) {
    const rng = rngFor(seed, 'select', dayIndex, slot.patternSlug)
    const resolved = resolveSlot(library, slot, levels, ownedEquipment, flaggedRegions, goal, rng, warnings)
    if (resolved) resolvedSlots.push(resolved)
  }

  const budgetItems: BudgetItem[] = resolvedSlots.map((r) => ({
    slotId: r.slot.patternSlug,
    required: r.slot.required,
    priority: r.slot.priority,
    costPerSetSeconds: costPerSetSeconds(r.prescription),
    restSeconds: r.prescription.restSeconds,
    minSets: r.prescription.minSets,
    maxSets: r.prescription.maxSets,
  }))

  let allocation = allocateBudget(budgetItems, sessionMinutes)
  const supersetGroupBySlug = new Map<string, number>()

  // docs/generator.md §5: apply supersets for fat_loss, or whenever the
  // budget is tight enough that a required slot would otherwise be cut
  // (read here as: even reserving every required slot at its minimum
  // already overflows the budget).
  const shouldTrySupersets = goal === 'fat_loss' || allocation.remainingSeconds < 0
  if (shouldTrySupersets) {
    const candidates: SupersetCandidate[] = resolvedSlots.map((r) => ({
      slotId: r.slot.patternSlug,
      patternId: r.patternId,
      exerciseId: r.exerciseId,
    }))
    const pairing = pairForSuperset(library, candidates)

    if (pairing.pairs.length > 0) {
      const bySlug = new Map(budgetItems.map((b) => [b.slotId, b]))
      const paired = new Set<string>()
      const combinedItems: BudgetItem[] = []
      let nextGroup = 1

      for (const { a, b } of pairing.pairs) {
        const itemA = bySlug.get(a.slotId)!
        const itemB = bySlug.get(b.slotId)!
        combinedItems.push({
          slotId: `${a.slotId}+${b.slotId}`,
          required: itemA.required || itemB.required,
          priority: Math.min(itemA.priority, itemB.priority),
          // sets × (workA + workB + rest) + 30 — docs/generator.md §5.
          // restSeconds/min/maxSets are shared: both items come from the
          // same GOAL_PRESCRIPTIONS entry (one goal per plan), so there is
          // no "whose rest wins" conflict to resolve.
          costPerSetSeconds: itemA.costPerSetSeconds + itemB.costPerSetSeconds,
          restSeconds: itemA.restSeconds,
          minSets: itemA.minSets,
          maxSets: itemA.maxSets,
        })
        supersetGroupBySlug.set(a.slotId, nextGroup)
        supersetGroupBySlug.set(b.slotId, nextGroup)
        nextGroup += 1
        paired.add(a.slotId)
        paired.add(b.slotId)
      }
      for (const item of budgetItems) if (!paired.has(item.slotId)) combinedItems.push(item)

      allocation = allocateBudget(combinedItems, sessionMinutes)
    }
  }

  // Map the (possibly combined) allocation back to per-pattern base sets —
  // a paired item's sets apply to BOTH of its constituents.
  const baseSetsBySlug = new Map<string, number>()
  for (const included of allocation.included) {
    const parts = included.slotId.split('+')
    for (const part of parts) baseSetsBySlug.set(part, included.sets)
  }
  for (const dropped of allocation.dropped) {
    const parts = dropped.slotId.split('+')
    for (const part of parts) {
      if (!baseSetsBySlug.has(part)) warnings.push(`pattern "${part}" dropped from day ${dayIndex}: did not fit the time budget`)
    }
  }

  return { resolved: resolvedSlots, baseSetsBySlug, supersetGroupBySlug }
}

function buildAttempt(
  input: GeneratePlanInput,
  split: SplitChoice,
): { plan: WorkoutPlan; sessions: PlanSession[]; items: PlanItem[]; templateBySessionId: Map<string, SessionTemplate>; warnings: string[] } {
  const warnings: string[] = []
  const sessions: PlanSession[] = []
  const items: PlanItem[] = []
  const templateBySessionId = new Map<string, SessionTemplate>()

  const anyAtOrAbove5 = anyPatternAtOrAboveLevel(input.library, input.levels, 5)

  split.cycle.forEach((template, dayIndex) => {
    const { resolved, baseSetsBySlug, supersetGroupBySlug } = buildBaseSession(
      input.library,
      template,
      input.levels,
      input.ownedEquipment,
      input.flaggedRegions,
      input.goal,
      input.sessionMinutes,
      input.seed,
      dayIndex,
      warnings,
    )

    for (let week = 1; week <= WEEKS_PER_BLOCK; week++) {
      const type = weekType(week, anyAtOrAbove5, input.weeksTrainedTotal)
      const sessionId = `draft-w${week}-d${dayIndex}`
      sessions.push({
        id: sessionId,
        planId: 'draft-plan',
        weekNumber: week,
        dayIndex,
        name: template.name,
        weekType: type,
        estMinutes: input.sessionMinutes,
      })
      templateBySessionId.set(sessionId, template)

      resolved.forEach((r, orderIndex) => {
        const baseSets = baseSetsBySlug.get(r.slot.patternSlug)
        if (baseSets === undefined) return // dropped by the time budget — already warned about above

        const target = resolveWeekTarget(r.prescription, baseSets, week, type)
        items.push({
          id: `draft-w${week}-d${dayIndex}-${orderIndex}`,
          sessionId,
          orderIndex,
          exerciseId: r.exerciseId,
          sets: target.sets,
          targetRepMin: target.targetRepMin,
          targetRepMax: target.targetRepMax,
          targetSeconds: target.targetSeconds,
          restSeconds: r.prescription.restSeconds,
          tempo: null,
          supersetGroup: supersetGroupBySlug.get(r.slot.patternSlug) ?? null,
          isAmrapLastSet: false,
          note: null,
        })
      })
    }
  })

  const plan: WorkoutPlan = {
    id: 'draft-plan',
    userId: input.userId,
    // Placeholder — this generator is pure/deterministic on purpose (a
    // fixed seed must always produce the exact same output), so it never
    // calls Date.now() itself; materializePlan.ts stamps the real value
    // right before this ever reaches Dexie/Supabase.
    updatedAt: '',
    name: `${input.goal.replace('_', ' ')} plan`,
    splitType: split.splitType,
    daysPerWeek: split.cycle.length,
    weeks: WEEKS_PER_BLOCK,
    startsOn: input.startsOn,
    status: 'active',
    generatorVersion: input.generatorVersion,
    seed: input.seed,
  }

  return { plan, sessions, items, templateBySessionId, warnings }
}

export function generatePlan(input: GeneratePlanInput): GeneratePlanResult {
  const primarySplit = chooseSplit(input.daysPerWeek)
  const primary = buildAttempt(input, primarySplit)
  const primaryViolations = validatePlan({
    library: input.library,
    sessions: primary.sessions,
    items: primary.items,
    templateBySessionId: primary.templateBySessionId,
    ownedEquipment: input.ownedEquipment,
    flaggedRegions: input.flaggedRegions,
    sessionMinutes: input.sessionMinutes,
    daysPerWeek: primarySplit.cycle.length,
  })

  if (primaryViolations.length === 0) {
    return { ...primary, warnings: primary.warnings, usedFallback: false }
  }

  const fallbackSplit = plainestFallback(input.daysPerWeek)
  const isSameShape = fallbackSplit.splitType === primarySplit.splitType && fallbackSplit.cycle.length === primarySplit.cycle.length
  if (isSameShape) {
    // The primary attempt WAS already the plainest shape — rebuilding
    // would just reproduce the same violations. Return it as-is with the
    // violations surfaced; "a conservative plan beats a broken one" still
    // means returning something rather than throwing.
    return { ...primary, warnings: [...primary.warnings, ...describeViolations(primaryViolations)], usedFallback: false }
  }

  const fallback = buildAttempt(input, fallbackSplit)
  const fallbackViolations = validatePlan({
    library: input.library,
    sessions: fallback.sessions,
    items: fallback.items,
    templateBySessionId: fallback.templateBySessionId,
    ownedEquipment: input.ownedEquipment,
    flaggedRegions: input.flaggedRegions,
    sessionMinutes: input.sessionMinutes,
    daysPerWeek: fallbackSplit.cycle.length,
  })

  const useFallback = fallbackViolations.length < primaryViolations.length
  const chosen = useFallback ? fallback : primary
  const chosenViolations = useFallback ? fallbackViolations : primaryViolations

  return {
    plan: chosen.plan,
    sessions: chosen.sessions,
    items: chosen.items,
    templateBySessionId: chosen.templateBySessionId,
    warnings: [...chosen.warnings, ...describeViolations(chosenViolations)],
    usedFallback: useFallback,
  }
}

function describeViolations(violations: Violation[]): string[] {
  return violations.map((v) => `validation: ${v.code} — ${v.message}`)
}
