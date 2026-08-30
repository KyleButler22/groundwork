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
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { materializeGroceryList, materializeMealPlan } from '@/lib/materializeMealPlan'
import { materializePlan } from '@/lib/materializePlan'
import { supabase } from '@/lib/supabase'
import { pushRow, pushRows, pushUserTargets, replaceSet } from '@/lib/sync'
import { buildGroceryList, buildMealLibrary, generateMealPlan } from '@/generators/meal'
import { buildLibrary } from '@/generators/workout/library'
import { generatePlan } from '@/generators/workout'
import type { Goal, MealPlan, MealSlot, Profile, SexAtBirth, UnitPreference, UserAllergenRow, UserDietTagRow, UserTargets, WorkoutPlan } from '@/types/domain'

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
  /** Which meals to plan at all — an explicit per-slot choice, not a
   *  count (see UserTargets.activeMealSlots for why: a count + a fixed
   *  priority order can never express "breakfast and lunch, no dinner",
   *  only "the N highest-share slots"). Four flat booleans rather than a
   *  MealSlot[] here purely so each one binds to its own checkbox with no
   *  array-splice handler — toActiveMealSlots() below is the one place
   *  that converts to the array shape every generator call actually wants. */
  wantsBreakfast: boolean
  wantsLunch: boolean
  wantsDinner: boolean
  wantsSnack: boolean
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
    // Matches the old mealsPerDay=3 default's actual effect under the
    // former count+priority scheme (dinner, lunch, breakfast survived;
    // snack didn't) — same starting point, now arrived at explicitly.
    wantsBreakfast: true,
    wantsLunch: true,
    wantsDinner: true,
    wantsSnack: false,
    goal: null,
    fatLossRateKgPerWeek: DEFAULT_FAT_LOSS_RATE_KG_PER_WEEK,
    clinicianRaisedConcern: null,
    thoughtsFeelIntrusive: null,
  }
}

/** breakfast/lunch/dinner/snack checkboxes → the array every meal-
 *  generator call and UserTargets.activeMealSlots actually want. Order
 *  here doesn't matter — planActiveSlots (src/generators/meal/grid.ts)
 *  re-sorts into its own canonical order regardless. */
function toActiveMealSlots(a: Pick<IntakeAnswers, 'wantsBreakfast' | 'wantsLunch' | 'wantsDinner' | 'wantsSnack'>): MealSlot[] {
  const slots: MealSlot[] = []
  if (a.wantsBreakfast) slots.push('breakfast')
  if (a.wantsLunch) slots.push('lunch')
  if (a.wantsDinner) slots.push('dinner')
  if (a.wantsSnack) slots.push('snack')
  return slots
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
    7: Boolean(answers.householdSize >= 1 && (answers.wantsBreakfast || answers.wantsLunch || answers.wantsDinner || answers.wantsSnack)),
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

      // Profile + UserTargets: written to Supabase below too, but ALSO
      // cached here — the meal generator (src/generators/meal/) needs
      // these on every visit, not just the one where intake just ran, and
      // until now nothing durable stored them client-side (see db.ts's v4
      // comment — a real gap found while wiring the meal generator up).
      const profile: Profile = {
        id: userId,
        displayName: null,
        birthYear: answers.birthYear,
        sexAtBirth: answers.sexAtBirth,
        heightCm: answers.heightCm,
        units: answers.units,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        householdSize: answers.householdSize,
      }
      const targets: UserTargets = {
        userId,
        intakeResponseId: null,
        goal: answers.goal,
        activityFactor: answers.neatFactor!,
        tdeeKcal: Math.round(tdeeValue.value!),
        kcalTarget: Math.round(selectedGoalKcal.value ?? tdeeValue.value!),
        proteinG: Math.round(macros.value!.proteinG),
        fatG: Math.round(macros.value!.fatG),
        carbG: Math.round(macros.value!.carbG),
        daysPerWeek: answers.daysPerWeek!,
        sessionMinutes: answers.sessionMinutes!,
        activeMealSlots: toActiveMealSlots(answers),
        cookTimeCeiling: answers.cookTimeCeilingMinutes,
        updatedAt: new Date().toISOString(),
      }

      // Diet tags/allergens: those content tables ARE seeded for real now
      // (see calisthenics-recipe-corpus memory), and StepKitchen.vue's
      // options come from them directly, so every slug here should always
      // resolve. The `undefined`-filtering below is defensive rather than
      // a known gap — a slug that somehow doesn't resolve is simply
      // skipped rather than failing the whole submit, since "no matching
      // diet tag" is equivalent in the generator to "no restriction" anyway.
      const dietTagIdBySlug = new Map((await db.dietTags.toArray()).map((t) => [t.slug, t.id]))
      const allergenIdBySlug = new Map((await db.allergens.toArray()).map((a) => [a.slug, a.id]))
      const userDietTags: UserDietTagRow[] = answers.dietTagSlugs
        .map((slug) => dietTagIdBySlug.get(slug))
        .filter((id): id is number => id !== undefined)
        .map((dietTagId) => ({ userId, dietTagId }))
      const userAllergens: UserAllergenRow[] = answers.allergenSlugs
        .map((slug) => allergenIdBySlug.get(slug))
        .filter((id): id is number => id !== undefined)
        .map((allergenId) => ({ userId, allergenId }))

      const archivedAt = new Date().toISOString()
      let previousActivePlan: WorkoutPlan | null = null
      await db.transaction(
        'rw',
        [db.workoutPlans, db.planSessions, db.planItems, db.userExerciseLevels, db.profiles, db.userTargets, db.userDietTags, db.userAllergens],
        async () => {
          // Archive whatever was active before adding the new one — a
          // real, pre-existing gap found while testing this session's
          // work: `.add()` alone leaves the OLD active row active too,
          // so a re-run of intake (a normal thing to do — goals change)
          // accumulates more than one workoutPlans row with
          // status='active', and which one plan.ts's `.first()` query
          // then returns is arbitrary, not "the newest." Captured before
          // the archive so the push below (a second, real gap found the
          // same way — archiving locally never used to reach Supabase at
          // all) has something to push.
          previousActivePlan = (await db.workoutPlans.where('status').equals('active').first()) ?? null
          await db.workoutPlans.where('status').equals('active').modify({ status: 'archived', updatedAt: archivedAt })
          await db.workoutPlans.add(materializedPlan)
          await db.planSessions.bulkAdd(sessions)
          await db.planItems.bulkAdd(items)
          for (const level of levels) await db.userExerciseLevels.put(level)

          await db.profiles.put(profile)
          await db.userTargets.put(targets)
          await db.userDietTags.where('userId').equals(userId).delete()
          await db.userDietTags.bulkAdd(userDietTags)
          await db.userAllergens.where('userId').equals(userId).delete()
          await db.userAllergens.bulkAdd(userAllergens)
        },
      )

      // The original pitch (see calisthenics-app memory): the SAME
      // questionnaire generates weekly meal plans too, not just a workout
      // plan. Best-effort and SEPARATE from the transaction above on
      // purpose — the recipe library seeds asynchronously and isn't
      // awaited before this runs (see main.ts), so someone racing through
      // intake fast enough could hit an empty db.recipes here. That must
      // never cost them the workout plan that already succeeded; it's
      // surfaced as a warning, and src/views/MealsView.vue has its own
      // "generate" fallback for exactly this case.
      try {
        const [recipes, ingredients, recipeIngredients, recipeMealSlots, recipeDietTags, ingredientAllergens, units, ingredientUnits, aisles] =
          await Promise.all([
            db.recipes.toArray(),
            db.ingredients.toArray(),
            db.recipeIngredients.toArray(),
            db.recipeMealSlots.toArray(),
            db.recipeDietTags.toArray(),
            db.ingredientAllergens.toArray(),
            db.units.toArray(),
            db.ingredientUnits.toArray(),
            db.aisles.toArray(),
          ])

        if (recipes.length === 0) {
          submitWarnings.value = [...submitWarnings.value, 'The recipe library has not loaded yet — your meal plan will be generated the first time you open Meals.']
        } else {
          const mealLibrary = buildMealLibrary({ recipes, ingredients, recipeIngredients, recipeMealSlots, recipeDietTags, ingredientAllergens })
          const mealSeed = Math.floor(Math.random() * 0xffffffff)
          const weekStartsOn = new Date().toISOString().slice(0, 10)

          const mealPlanResult = generateMealPlan({
            userId,
            weekStartsOn,
            dailyTargets: { kcalTarget: targets.kcalTarget, proteinG: targets.proteinG, carbG: targets.carbG, fatG: targets.fatG },
            activeMealSlots: targets.activeMealSlots,
            householdSize: profile.householdSize,
            cookTimeCeilingMinutes: targets.cookTimeCeiling,
            userAllergenIds: new Set(userAllergens.map((a) => a.allergenId)),
            userDietTagIds: new Set(userDietTags.map((t) => t.dietTagId)),
            dislikedIngredientIds: new Set(), // not collected by intake yet — see TASKS.md
            feedbackByRecipeId: new Map(), // brand-new user, nothing to read yet
            library: mealLibrary,
            seed: mealSeed,
            generatorVersion: '2026-08-29.1',
            now: new Date().toISOString(),
          })
          submitWarnings.value = [...submitWarnings.value, ...mealPlanResult.warnings]

          const { plan: materializedMealPlan, entries: materializedMealEntries } = materializeMealPlan(mealPlanResult)

          const groceryResult = buildGroceryList({
            mealPlanId: materializedMealPlan.id,
            userId,
            title: `Week of ${weekStartsOn}`,
            entries: materializedMealEntries,
            library: mealLibrary,
            units,
            ingredientUnits,
            aisles,
            now: new Date().toISOString(),
          })
          submitWarnings.value = [...submitWarnings.value, ...groceryResult.warnings]
          const { list: materializedGroceryList, items: materializedGroceryItems } = materializeGroceryList(groceryResult)

          const mealArchivedAt = new Date().toISOString()
          let previousActiveMealPlan: MealPlan | null = null
          await db.transaction('rw', [db.mealPlans, db.mealPlanEntries, db.groceryLists, db.groceryItems], async () => {
            // Same archive-before-add reasoning as the workout plan above,
            // including the same "push the archived one too" fix.
            previousActiveMealPlan = (await db.mealPlans.where('status').equals('active').first()) ?? null
            await db.mealPlans.where('status').equals('active').modify({ status: 'archived', updatedAt: mealArchivedAt })
            await db.mealPlans.add(materializedMealPlan)
            await db.mealPlanEntries.bulkAdd(materializedMealEntries)
            await db.groceryLists.add(materializedGroceryList)
            await db.groceryItems.bulkAdd(materializedGroceryItems)
          })

          if (userId !== LOCAL_DEV_USER_ID) {
            // Object.assign, not a spread literal — see mealPlan.ts's
            // applyGeneratedResult for why (TS won't narrow a `let`
            // assigned inside the transaction's closure back to non-null
            // out here for a spread, even via a fresh const).
            if (previousActiveMealPlan) {
              const archived: MealPlan = Object.assign({}, previousActiveMealPlan, { status: 'archived' as const, updatedAt: mealArchivedAt })
              await pushRow('meal_plans', archived, submitWarnings.value)
            }
            await pushRow('meal_plans', materializedMealPlan, submitWarnings.value)
            await pushRows('meal_plan_entries', materializedMealEntries, submitWarnings.value)
            await pushRow('grocery_lists', materializedGroceryList, submitWarnings.value)
            await pushRows('grocery_items', materializedGroceryItems, submitWarnings.value)
          }
        }
      } catch (err) {
        submitWarnings.value = [...submitWarnings.value, `Workout plan saved, but generating your meal plan failed: ${(err as Error).message}`]
      }

      // Best-effort Supabase sync — every pushRow/pushRows/replaceSet call
      // below is itself try/catch'd (see sync.ts) and only ever appends to
      // submitWarnings, never throws, so nothing here blocks on it: the
      // plan is already fully usable locally either way. Skipped entirely
      // for the local-dev-user fallback — RLS requires `authenticated`, so
      // this could only ever fail for that id.
      if (userId !== LOCAL_DEV_USER_ID) {
        await pushRow('profiles', profile, submitWarnings.value)
        // intake_responses is append-only (see 0002_identity.sql's own
        // comment) and isn't cached in Dexie at all — nothing to route
        // through pushRow's domain-object shape, so this stays a direct,
        // already-snake_case call, same as it's always been.
        try {
          const { error } = await supabase.from('intake_responses').insert({
            user_id: userId,
            schema_version: 1,
            answers: answers as unknown as Record<string, unknown>,
          })
          if (error) submitWarnings.value = [...submitWarnings.value, `Sync to intake_responses failed: ${error.message}`]
        } catch (err) {
          submitWarnings.value = [...submitWarnings.value, `Sync to intake_responses failed: ${(err as Error).message}`]
        }
        await pushUserTargets(targets, submitWarnings.value)

        // The just-archived previous plan (if any) needs pushing too, not
        // just the new one — otherwise it stays 'active' in Supabase
        // forever, and a future pull's last-write-wins merge could even
        // resurrect it as active locally once its updatedAt stops being
        // provably older than a remote copy that was never told it changed.
        // Object.assign, not a spread literal — see mealPlan.ts's
        // applyGeneratedResult for why.
        if (previousActivePlan) {
          const archived: WorkoutPlan = Object.assign({}, previousActivePlan, { status: 'archived' as const, updatedAt: archivedAt })
          await pushRow('workout_plans', archived, submitWarnings.value)
        }
        await pushRows('workout_plans', [materializedPlan], submitWarnings.value)
        await pushRows('plan_sessions', sessions, submitWarnings.value)
        await pushRows('plan_items', items, submitWarnings.value)
        await pushRows('user_exercise_levels', levels, submitWarnings.value)
        await replaceSet('user_diet_tags', userId, userDietTags, submitWarnings.value)
        await replaceSet('user_allergens', userId, userAllergens, submitWarnings.value)
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
