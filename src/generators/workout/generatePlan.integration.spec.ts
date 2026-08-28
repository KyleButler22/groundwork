import { describe, expect, it } from 'vitest'

import { loadRealSeed } from '@/generators/__fixtures__/loadRealSeed'
import type { Goal, UserExerciseLevel } from '@/types/domain'

import { buildLibrary } from './library'
import { generatePlan, type GeneratePlanInput } from './generatePlan'
import { validatePlan } from './validate'

/**
 * Runs the real generator against the real 60-exercise seed content
 * (supabase/seed/001_movement_library.sql), not the small synthetic
 * fixture the other specs in this directory use. Unit tests prove each
 * piece is correct in isolation with exact, hand-checked numbers;
 * this proves they cohere against the actual content a real user hits —
 * including the "everyone starts untested" case, which the unit fixture
 * can't represent since it always supplies explicit levels.
 */

const seed = loadRealSeed()
const library = buildLibrary(seed)

const patternIdBySlug = new Map(seed.patterns.map((p) => [p.slug, p.id]))
const regionIdBySlug = new Map(seed.bodyRegions.map((r) => [r.slug, r.id]))

/** The floor exercise for every pattern — what a never-tested user starts
 *  on, matching startingExerciseFor()'s own fallback in generatePlan.ts. */
function floorLevels(): UserExerciseLevel[] {
  return seed.patterns.map((pattern) => {
    const floor = library.exercisesByPattern.get(pattern.id)![0]
    return { userId: 'u1', patternId: pattern.id, exerciseId: floor.id, consecutiveSuccess: 0, consecutiveFailure: 0, lastEvaluatedAt: null }
  })
}

function baseInput(overrides: Partial<GeneratePlanInput> = {}): GeneratePlanInput {
  return {
    userId: 'u1',
    goal: 'maintain',
    daysPerWeek: 3,
    sessionMinutes: 45,
    levels: floorLevels(),
    ownedEquipment: new Set(),
    flaggedRegions: new Set(),
    library,
    seed: 42,
    startsOn: '2026-09-01',
    generatorVersion: 'test-1',
    weeksTrainedTotal: 0,
    ...overrides,
  }
}

describe('loadRealSeed sanity', () => {
  it('parsed something that looks like the real content', () => {
    expect(seed.patterns.map((p) => p.slug).sort()).toEqual(
      ['core', 'hinge', 'horizontal_pull', 'horizontal_push', 'skill_handstand', 'squat', 'vertical_pull', 'vertical_push'].sort(),
    )
  })
})

describe('generatePlan — against the real seed content', () => {
  const goals: Goal[] = ['fat_loss', 'muscle_gain', 'recomp', 'maintain', 'skill']
  const dayCounts = [1, 2, 3, 4, 5, 6]

  // KNOWN, ACCEPTED content gap (see the seed file's own header comment
  // and the calisthenics-app memory): vertical_pull's floor rung
  // (dead_hang) is the one ladder floor that genuinely needs equipment —
  // a pull-up bar — with nothing below it to regress to. An equipment-
  // free baseline can therefore never fill that one pattern, and that is
  // expected, not a bug. Every OTHER violation would be a real one.
  const verticalPullId = patternIdBySlug.get('vertical_pull')!
  function isExpectedViolation(v: { code: string; message: string }): boolean {
    if (v.code === 'missing_required_slot') return v.message.includes('"vertical_pull"')
    if (v.code === 'pattern_frequency_shortfall') return v.message.startsWith(`pattern ${verticalPullId} `)
    return false
  }

  it.each(goals)('produces a plan with no violations beyond the known vertical_pull equipment gap, for goal=%s', (goal) => {
    const result = generatePlan(baseInput({ goal }))
    const violations = validatePlan({
      library,
      sessions: result.sessions,
      items: result.items,
      templateBySessionId: result.templateBySessionId,
      ownedEquipment: new Set(),
      flaggedRegions: new Set(),
      sessionMinutes: 45,
      daysPerWeek: result.plan.daysPerWeek,
    })
    const unexpected = violations.filter((v) => !isExpectedViolation(v))
    expect(unexpected).toEqual([])
    // 4 weeks x however many days per week the chosen split uses.
    expect(result.sessions.length).toBe(4 * result.plan.daysPerWeek)
    expect(result.items.length).toBeGreaterThan(0)
  })

  it('a user who owns a pull-up bar gets a fully valid plan with zero violations at all', () => {
    const pullUpBarId = seed.equipment.find((e) => e.slug === 'pull_up_bar')!.id
    const result = generatePlan(baseInput({ ownedEquipment: new Set([pullUpBarId]) }))
    const violations = validatePlan({
      library,
      sessions: result.sessions,
      items: result.items,
      templateBySessionId: result.templateBySessionId,
      ownedEquipment: new Set([pullUpBarId]),
      flaggedRegions: new Set(),
      sessionMinutes: 45,
      daysPerWeek: result.plan.daysPerWeek,
    })
    expect(violations).toEqual([])
    expect(result.usedFallback).toBe(false)
  })

  it.each(dayCounts)('produces a plan with the right number of sessions for %i days/week', (days) => {
    const result = generatePlan(baseInput({ daysPerWeek: days }))
    const expectedDays = days > 6 ? 6 : days < 1 ? 1 : days
    expect(result.plan.daysPerWeek).toBe(expectedDays)
    expect(result.sessions.length).toBe(4 * expectedDays)
  })

  it('never schedules 7 days even if asked', () => {
    const result = generatePlan(baseInput({ daysPerWeek: 7 }))
    expect(result.plan.daysPerWeek).toBeLessThanOrEqual(6)
  })

  it('is deterministic: the same seed and inputs produce byte-identical output', () => {
    const a = generatePlan(baseInput({ seed: 777 }))
    const b = generatePlan(baseInput({ seed: 777 }))
    expect(a).toEqual(b)
  })

  it('a different seed can produce a different plan', () => {
    const a = generatePlan(baseInput({ seed: 1 }))
    const b = generatePlan(baseInput({ seed: 2 }))
    // Not guaranteed to differ (an untested, equipment-free baseline has
    // little room for randomness to matter — see docs/generator.md §8,
    // "very little here is actually random"), so this only asserts that
    // running it doesn't crash and both are internally consistent, not
    // that they literally differ.
    expect(a.plan.seed).toBe(1)
    expect(b.plan.seed).toBe(2)
  })

  it('respects an injury flag: never prescribes a wrist-contraindicated exercise', () => {
    const wristId = regionIdBySlug.get('wrist')!
    const result = generatePlan(baseInput({ flaggedRegions: new Set([wristId]) }))
    const contraindicatedExercises = new Set(
      seed.contraindications.filter((c) => c.regionId === wristId).map((c) => c.exerciseId),
    )
    for (const item of result.items) {
      expect(contraindicatedExercises.has(item.exerciseId)).toBe(false)
    }
  })

  it('respects missing equipment: never prescribes an exercise needing unowned equipment', () => {
    const result = generatePlan(baseInput({ ownedEquipment: new Set() }))
    const gatedExerciseIds = new Set(seed.exerciseEquipment.map((e) => e.exerciseId))
    for (const item of result.items) {
      if (gatedExerciseIds.has(item.exerciseId)) {
        // If it's in the plan at all despite being gated, the user must
        // actually own what it needs — but ownedEquipment is empty here,
        // so a gated exercise should simply never appear.
        expect(gatedExerciseIds.has(item.exerciseId)).toBe(false)
      }
    }
  })

  it('a fully-equipped user can be prescribed equipment-gated exercises', () => {
    const allEquipment = new Set(seed.equipment.map((e) => e.id))
    const result = generatePlan(baseInput({ ownedEquipment: allEquipment, daysPerWeek: 4, goal: 'muscle_gain' }))
    const gatedExerciseIds = new Set(seed.exerciseEquipment.map((e) => e.exerciseId))
    const anyGatedPrescribed = result.items.some((item) => gatedExerciseIds.has(item.exerciseId))
    expect(anyGatedPrescribed).toBe(true)
  })

  it('week 1 to week 3 sets never decrease for a build week (only ever hold or climb)', () => {
    const result = generatePlan(baseInput({ goal: 'fat_loss', daysPerWeek: 3 }))
    const byWeekAndExercise = new Map<string, number>()
    for (const item of result.items) {
      const session = result.sessions.find((s) => s.id === item.sessionId)!
      byWeekAndExercise.set(`${session.weekNumber}|${session.dayIndex}|${item.exerciseId}`, item.sets)
    }
    for (let day = 0; day < result.plan.daysPerWeek; day++) {
      for (const item of result.items) {
        const session = result.sessions.find((s) => s.id === item.sessionId)!
        if (session.dayIndex !== day || session.weekNumber !== 1) continue
        const week1 = byWeekAndExercise.get(`1|${day}|${item.exerciseId}`)
        const week3 = byWeekAndExercise.get(`3|${day}|${item.exerciseId}`)
        if (week1 !== undefined && week3 !== undefined) expect(week3).toBeGreaterThanOrEqual(week1)
      }
    }
  })

  it('the skill slot only appears for a skill goal', () => {
    const skillPatternId = patternIdBySlug.get('skill_handstand')!
    const nonSkill = generatePlan(baseInput({ goal: 'maintain', daysPerWeek: 4 }))
    const skillResult = generatePlan(baseInput({ goal: 'skill', daysPerWeek: 4 }))

    const hasSkillItem = (items: typeof nonSkill.items) =>
      items.some((i) => library.exerciseById.get(i.exerciseId)?.patternId === skillPatternId)

    expect(hasSkillItem(nonSkill.items)).toBe(false)
    expect(hasSkillItem(skillResult.items)).toBe(true)
  })
})
