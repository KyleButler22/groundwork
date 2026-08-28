/**
 * docs/intake.md "Safety gates". These "belong in the generator, not the
 * UI" per the doc — meaning the intake flow calls these same functions to
 * decide what to show, and generatePlan()'s own callers should re-check
 * before ever producing a plan, so a gate can't be routed around by
 * skipping the UI. Every function here is a pure predicate; what the UI
 * DOES with a true result (block, hide, warn) is the component's job.
 */

/** Takes `currentYear` as a parameter rather than reading the clock
 *  itself, same discipline as promotion.ts's `now` — keeps this testable
 *  without mocking time. */
export function ageFromBirthYear(birthYear: number, currentYear: number): number {
  return currentYear - birthYear
}

export const MINIMUM_AGE = 16

export function isUnderMinimumAge(birthYear: number, currentYear: number): boolean {
  return ageFromBirthYear(birthYear, currentYear) < MINIMUM_AGE
}

export function bmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100
  return weightKg / (heightM * heightM)
}

export const UNDERWEIGHT_BMI_THRESHOLD = 18.5

/** "BMI < 18.5 with a fat-loss goal — block the deficit, offer
 *  maintenance/gain." Only meaningful paired with a fat_loss goal check
 *  at the call site; being underweight isn't itself a gate on anything
 *  else. */
export function isUnderweight(weightKg: number, heightCm: number): boolean {
  return bmi(weightKg, heightCm) < UNDERWEIGHT_BMI_THRESHOLD
}

/**
 * Two short, non-clinical, non-diagnostic questions — not a validated
 * screening instrument, and not trying to be one. If either answer
 * suggests concern, the intake store quietly narrows the goal screen
 * (docs/intake.md: withhold the aggressive rate options and the daily
 * calorie display) rather than blocking or labelling anything. Never
 * shown as "you were flagged" anywhere in the UI.
 */
export interface WellbeingScreenAnswers {
  /** "Has a doctor or therapist ever raised concerns with you about your
   *  relationship with food, eating, or exercise?" */
  clinicianRaisedConcern: boolean
  /** "Right now, do thoughts about food, weight, or exercise take up a
   *  lot of your day?" */
  thoughtsFeelIntrusive: boolean
}

export function shouldSoftenGoalScreen(answers: WellbeingScreenAnswers): boolean {
  return answers.clinicianRaisedConcern || answers.thoughtsFeelIntrusive
}
