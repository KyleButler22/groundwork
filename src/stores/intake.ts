import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'

import { db } from '@/lib/db'
import {
  DEFAULT_FAT_LOSS_RATE_KG_PER_WEEK,
  FAT_LOSS_RATE_OPTIONS_KG_PER_WEEK,
  NEAT_FACTORS,
  bmr as calcBmr,
  clampFatLossRate,
  kcalTargetForGoal,
  roundForDisplay,
  tdee as calcTdee,
  type NeatFactor,
} from '@/lib/intake/energy'
import { resolveMacros, referenceWeightKg } from '@/lib/intake/macros'
import { computeTestedLevels, resolveStartingLevels, type PlacementTestAnswers } from '@/lib/intake/placement'
import { ageFromBirthYear, isUnderMinimumAge, isUnderweight, shouldSoftenGoalScreen } from '@/lib/intake/safetyGates'
import { materializePlan } from '@/lib/materializePlan'
import { supabase } from '@/lib/supabase'
import { buildLibrary } from '@/generators/workout/library'
import { generatePlan } from '@/generators/workout'
import type { Goal, SexAtBirth, UnitPreference } from '@/types/domain'

export const TOTAL_STEPS = 8

interface IntakeAnswers {
  // Step 1 — about you
  birthYear: number | null
  sexAtBirth: SexAtBirth | null
  heightCm: number | null
  weightKg: number | null
  units: UnitPreference
  // Step 2 — your day
  neatFactor: NeatFactor | null
  // Step 3 — your week
  daysPerWeek: number | null
  sessionMinutes: number | null
  // Step 4 — what you have
  ownedEquipmentSlugs: string[]
  // Step 5 — where you're starting
  placement: PlacementTestAnswers
  // Step 6 — anything hurting
  flaggedRegionSlugs: string[]
  isPregnantOrPostpartum: boolean
  // Step 7 — your kitchen
  dietTagSlugs: string[]
  allergenSlugs: string[]
  cookTimeCeilingMinutes: number | null
  householdSize: number
  mealsPerDay: number
  // Step 8 — what you want
  goal: Goal | null
  fatLossRateKgPerWeek: number
  clinicianRaisedConcern: boolean | null
  thoughtsFeelIntrusive: boolean | null
}

function freshAnswers(): IntakeAnswers {
  return {
    birthYear: null,
    sexAtBirth: null,
    heightCm: null,
    weightKg: null,
    units: 'metric',
    neatFactor: null,
    daysPerWeek: null,
    sessionMinutes: null,
    ownedEquipmentSlugs: [],
    placement: { skipped: false },
    flaggedRegionSlugs: [],
    isPregnantOrPostpartum: false,
    dietTagSlugs: [],
    allergenSlugs: [],
    cookTimeCeilingMinutes: null,
    householdSize: 1,
    mealsPerDay: 3,
    goal: null,
    fatLossRateKgPerWeek: DEFAULT_FAT_LOSS_RATE_KG_PER_WEEK,
    clinicianRaisedConcern: null,
    thoughtsFeelIntrusive: null,
  }
}

export const useIntakeStore = defineStore('intake', () => {
  const step = ref(1)
  const answers = reactive(freshAnswers())
  const submitting = ref(false)
  const submitError = ref<string | null>(null)
  const submitWarnings = ref<string[]>([])

  const currentYear = new Date().getFullYear()

  // ---- derived values, used by step 8's goal screen ----------------------

  const age = computed(() => (answers.birthYear ? ageFromBirthYear(answers.birthYear, currentYear) : null))

  const bmrValue = computed(() => {
    if (!answers.weightKg || !answers.heightCm || age.value === null || !answers.sexAtBirth) return null
    return calcBmr(answers.weightKg, answers.heightCm, age.value, answers.sexAtBirth)
  })

  const tdeeValue = computed(() => {
    if (bmrValue.value === null || !answers.neatFactor || !answers.daysPerWeek || !answers.sessionMinutes) return null
    return calcTdee(bmrValue.value, answers.neatFactor, answers.daysPerWeek, answers.sessionMinutes)
  })

  /** docs/intake.md safety gates, evaluated live so the UI can react —
   *  block a fat-loss deficit under 16 or while underweight, and cap the
   *  rate slider at 1% of bodyweight regardless of what's dragged in. */
  const isUnderage = computed(() => (answers.birthYear ? isUnderMinimumAge(answers.birthYear, currentYear) : false))
  const isUnderweightForFatLoss = computed(() =>
    answers.weightKg && answers.heightCm ? isUnderweight(answers.weightKg, answers.heightCm) : false,
  )
  const maxFatLossRateKgPerWeek = computed(() => (answers.weightKg ? clampFatLossRate(999, answers.weightKg) : 0))
  const softenGoalScreen = computed(() =>
    answers.clinicianRaisedConcern !== null && answers.thoughtsFeelIntrusive !== null
      ? shouldSoftenGoalScreen({
          clinicianRaisedConcern: answers.clinicianRaisedConcern,
          thoughtsFeelIntrusive: answers.thoughtsFeelIntrusive,
        })
      : false,
  )

  const fatLossBlocked = computed(() => isUnderage.value || isUnderweightForFatLoss.value)

  interface GoalCard {
    goal: Goal
    kcalTarget: number
    label: string
  }

  /** The goal screen's live numbers — docs/intake.md §"The goal screen".
   *  Returns [] until enough prior steps are answered to compute anything,
   *  which is what step 8 uses to know it can render for real. */
  const goalCards = computed<GoalCard[]>(() => {
    if (tdeeValue.value === null || bmrValue.value === null || !answers.sexAtBirth) return []
    const sex = answers.sexAtBirth
    const goals: { goal: Goal; label: string }[] = [
      { goal: 'fat_loss', label: 'Lose fat' },
      { goal: 'muscle_gain', label: 'Build muscle' },
      { goal: 'recomp', label: 'Recomposition' },
      { goal: 'maintain', label: 'Maintain' },
      { goal: 'skill', label: 'Chase a skill' },
    ]
    return goals.map(({ goal, label }) => ({
      goal,
      label,
      kcalTarget: roundForDisplay(
        kcalTargetForGoal(
          goal,
          tdeeValue.value!,
          bmrValue.value!,
          sex,
          goal === 'fat_loss' ? answers.fatLossRateKgPerWeek : undefined,
        ),
      ),
    }))
  })

  const selectedGoalKcal = computed(() => goalCards.value.find((g) => g.goal === answers.goal)?.kcalTarget ?? null)

  const macros = computed(() => {
    if (selectedGoalKcal.value === null || !answers.goal || !answers.weightKg || !answers.heightCm) return null
    const refWeight = referenceWeightKg(answers.weightKg, answers.heightCm)
    return resolveMacros(answers.goal, selectedGoalKcal.value, refWeight)
  })

  // ---- progressive validation ---------------------------------------------

  const stepValid = computed<Record<number, boolean>>(() => ({
    1: Boolean(answers.birthYear && answers.sexAtBirth && answers.heightCm && answers.weightKg),
    2: Boolean(answers.neatFactor),
    3: Boolean(answers.daysPerWeek && answers.sessionMinutes),
    4: true, // equipment can legitimately be "none" — no requirement to check
    5: true, // skippable by design
    6: answers.clinicianRaisedConcern !== null && answers.thoughtsFeelIntrusive !== null,
    7: Boolean(answers.householdSize >= 1 && answers.mealsPerDay >= 1),
    8: Boolean(answers.goal && !(answers.goal === 'fat_loss' && fatLossBlocked.value)),
  }))

  const canProceed = computed(() => stepValid.value[step.value] ?? false)
  const furthestUnlockedStep = computed(() => {
    for (let s = 1; s <= TOTAL_STEPS; s++) if (!stepValid.value[s]) return s
    return TOTAL_STEPS
  })

  function goNext() {
    if (canProceed.value && step.value < TOTAL_STEPS) step.value += 1
  }
  function goBack() {
    if (step.value > 1) step.value -= 1
  }
  function goToStep(n: number) {
    // Never jump PAST the furthest step whose prerequisites are actually
    // met — docs/intake.md: "nobody should reach the goal screen only to
    // be sent back for a missing height."
    if (n >= 1 && n <= TOTAL_STEPS && n <= furthestUnlockedStep.value + 1) step.value = n
  }

  // ---- submission ----------------------------------------------------------

  async function submit(userId: string): Promise<{ planId: string } | null> {
    submitting.value = false
    submitError.value = null
    submitWarnings.value = []

    if (!answers.goal || tdeeValue.value === null || bmrValue.value === null || !macros.value) {
      submitError.value = 'Not enough answers yet to generate a plan.'
      return null
    }
    submitting.value = true

    try {
      const patterns = await db.movementPatterns.toArray()
      const exercises = await db.exercises.toArray()
      const edges = await db.progressionEdges.toArray()
      const equipment = await db.equipment.toArray()
      const exerciseEquipment = await db.exerciseEquipment.toArray()
      const bodyRegions = await db.bodyRegions.toArray()
      const contraindications = await db.exerciseContraindications.toArray()

      if (patterns.length === 0 || exercises.length === 0) {
        submitError.value = 'The movement library has not loaded yet — try again in a moment.'
        return null
      }

      const library = buildLibrary({ patterns, exercises, edges, equipment, exerciseEquipment, contraindications })

      const equipmentIdBySlug = new Map(equipment.map((e) => [e.slug, e.id]))
      const ownedEquipment = new Set(
        answers.ownedEquipmentSlugs.map((slug) => equipmentIdBySlug.get(slug)).filter((id): id is number => id !== undefined),
      )

      const regionIdBySlug = new Map(bodyRegions.map((r) => [r.slug, r.id]))
      const flaggedRegions = new Set(
        answers.flaggedRegionSlugs.map((slug) => regionIdBySlug.get(slug)).filter((id): id is number => id !== undefined),
      )

      const seed = Math.floor(Math.random() * 0xffffffff)
      const rngForPlacement = () => Math.random() // lateral substitution has no laterals in the seed today; not seed-critical for a one-time placement

      const testedLevels = computeTestedLevels(answers.placement)
      const levels = resolveStartingLevels(library, userId, testedLevels, ownedEquipment, flaggedRegions, rngForPlacement)

      const plan = generatePlan({
        userId,
        goal: answers.goal,
        daysPerWeek: answers.daysPerWeek ?? 3,
        sessionMinutes: answers.sessionMinutes ?? 30,
        levels,
        ownedEquipment,
        flaggedRegions,
        library,
        seed,
        startsOn: new Date().toISOString().slice(0, 10),
        generatorVersion: '2026-08-28.1',
        weeksTrainedTotal: 0,
      })
      submitWarnings.value = plan.warnings

      const { plan: materializedPlan, sessions, items } = materializePlan(plan)

      await db.transaction('rw', [db.workoutPlans, db.planSessions, db.planItems, db.userExerciseLevels], async () => {
        await db.workoutPlans.add(materializedPlan)
        await db.planSessions.bulkAdd(sessions)
        await db.planItems.bulkAdd(items)
        for (const level of levels) await db.userExerciseLevels.put(level)
      })

      // Best-effort Supabase write — expected to fail against the
      // placeholder client until a real project exists (see
      // src/lib/supabase.ts). The plan is already usable locally either
      // way; this never blocks on it.
      try {
        await supabase.from('profiles').upsert({
          id: userId,
          birth_year: answers.birthYear,
          sex_at_birth: answers.sexAtBirth,
          height_cm: answers.heightCm,
          household_size: answers.householdSize,
        })
        await supabase.from('intake_responses').insert({
          user_id: userId,
          schema_version: 1,
          answers: answers as unknown as Record<string, unknown>,
        })
        await supabase.from('user_targets').upsert({
          user_id: userId,
          goal: answers.goal,
          activity_factor: answers.neatFactor,
          tdee_kcal: Math.round(tdeeValue.value),
          kcal_target: Math.round(selectedGoalKcal.value ?? tdeeValue.value),
          protein_g: Math.round(macros.value.proteinG),
          fat_g: Math.round(macros.value.fatG),
          carb_g: Math.round(macros.value.carbG),
          days_per_week: answers.daysPerWeek,
          session_minutes: answers.sessionMinutes,
          meals_per_day: answers.mealsPerDay,
          cook_time_ceiling: answers.cookTimeCeilingMinutes,
        })
      } catch (err) {
        submitWarnings.value = [...submitWarnings.value, `Saved locally, but syncing to your account failed: ${(err as Error).message}`]
      }

      return { planId: materializedPlan.id }
    } catch (err) {
      submitError.value = (err as Error).message
      return null
    } finally {
      submitting.value = false
    }
  }

  return {
    step,
    answers,
    submitting,
    submitError,
    submitWarnings,
    age,
    bmrValue,
    tdeeValue,
    isUnderage,
    isUnderweightForFatLoss,
    fatLossBlocked,
    maxFatLossRateKgPerWeek,
    softenGoalScreen,
    goalCards,
    selectedGoalKcal,
    macros,
    stepValid,
    canProceed,
    furthestUnlockedStep,
    goNext,
    goBack,
    goToStep,
    submit,
    NEAT_FACTORS,
    FAT_LOSS_RATE_OPTIONS_KG_PER_WEEK,
  }
})
