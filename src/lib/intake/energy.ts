import type { Goal, SexAtBirth } from '@/types/domain'

/**
 * docs/intake.md "Energy math" and "The goal screen". Pure functions,
 * verified against the doc's own worked example (34, 178cm, 82kg, male,
 * desk job with some walking, 4x/week at 45 min -> BMR 1,768, TDEE 2,478,
 * fat-loss target 1,930 at the default 0.5kg/week rate) — see energy.spec.ts.
 */

/** docs/intake.md: "10 x weight + 6.25 x height - 5 x age + s". `s` is
 *  +5/-161/-78 (male/female/unspecified — the midpoint of the other two,
 *  since Mifflin-St Jeor needs a sex input but not every user gives one). */
export function bmr(weightKg: number, heightCm: number, age: number, sex: SexAtBirth): number {
  const s = sex === 'male' ? 5 : sex === 'female' ? -161 : -78
  return 10 * weightKg + 6.25 * heightCm - 5 * age + s
}

export type NeatFactor = 1.2 | 1.3 | 1.45 | 1.6

/** The 4 "your day" options from intake step 2 — non-training activity
 *  only. Deliberately not the familiar single Harris-Benedict-style
 *  multiplier; see the doc for why that one is unreliable. */
export const NEAT_FACTORS: { value: NeatFactor; label: string; hint: string }[] = [
  { value: 1.2, label: 'Desk job, little walking', hint: 'under 4,000 steps' },
  { value: 1.3, label: 'Desk job, some walking', hint: '4,000–8,000 steps' },
  { value: 1.45, label: 'On your feet most of the day', hint: 'retail, teaching, nursing' },
  { value: 1.6, label: 'Physical labour', hint: 'trades, warehouse' },
]

/** "base = BMR x neat_factor; training = (days x minutes x 7kcal/min) / 7;
 *  TDEE = base + training" — training is spread across the week as a
 *  daily average, not added only on training days, since kcal_target is a
 *  single every-day number. */
export function tdee(bmrValue: number, neatFactor: NeatFactor, daysPerWeek: number, sessionMinutes: number): number {
  const base = bmrValue * neatFactor
  const training = (daysPerWeek * sessionMinutes * 7) / 7
  return base + training
}

const KCAL_PER_KG_FAT = 7700
export const DEFAULT_FAT_LOSS_RATE_KG_PER_WEEK = 0.5
export const FAT_LOSS_RATE_OPTIONS_KG_PER_WEEK = [0.25, 0.5, 0.75] as const

/**
 * docs/intake.md goal -> kcal_target table, plus the floor that "belongs
 * in the generator, not just the UI, so it can't be routed around" — kept
 * here rather than only in a component precisely so nothing can call this
 * and get an unfloored number by accident.
 */
export function kcalTargetForGoal(goal: Goal, tdeeValue: number, bmrValue: number, sex: SexAtBirth, rateKgPerWeek: number = DEFAULT_FAT_LOSS_RATE_KG_PER_WEEK): number {
  let target: number
  switch (goal) {
    case 'fat_loss':
      target = tdeeValue - (rateKgPerWeek * KCAL_PER_KG_FAT) / 7
      break
    case 'muscle_gain':
      target = tdeeValue + 300
      break
    case 'recomp':
      target = tdeeValue - 100
      break
    case 'maintain':
    case 'skill':
      target = tdeeValue
      break
  }
  const floor = sex === 'female' ? 1200 : 1500
  return Math.max(target, bmrValue, floor)
}

/** Safety-gates §: "cap the rate control at 1% of bodyweight/week
 *  regardless of what's requested" — enforced here, not just by limiting
 *  the UI's slider options, so a bad input can't slip past it. */
export function clampFatLossRate(requestedKgPerWeek: number, weightKg: number): number {
  const maxRate = weightKg * 0.01
  return Math.min(Math.max(requestedKgPerWeek, 0), maxRate)
}

/** Rounds to the nearest 10 for display, per the doc's honesty-about-
 *  error-bars note — an estimate shown to the exact kcal implies false
 *  precision. Stored values stay unrounded; only presentation rounds. */
export function roundForDisplay(kcal: number): number {
  return Math.round(kcal / 10) * 10
}
