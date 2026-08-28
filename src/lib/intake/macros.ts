import type { Goal } from '@/types/domain'

/**
 * docs/intake.md "Macros". Resolution order matters: protein first (the
 * one that changes body composition outcomes), then a fat floor, then
 * carbs absorb whatever's left (the one people can flex without harm).
 * Verified against the doc's worked example (fat loss, 1,930 kcal, 82kg
 * -> 180g protein / 66g fat / 154g carbs) in macros.spec.ts.
 */

export interface Macros {
  proteinG: number
  fatG: number
  carbG: number
}

function proteinGPerKgForGoal(goal: Goal): number {
  // docs/intake.md's macro table lists only "2.2 cut · 2.0 gain · 2.0
  // maintain" — recomp isn't named directly, but the goal screen's own
  // description of it ("near maintenance, protein high") points at the
  // higher value, and recomp is a mild deficit where preserving muscle
  // matters the same way it does for fat_loss.
  if (goal === 'fat_loss' || goal === 'recomp') return 2.2
  return 2.0
}

/**
 * docs/intake.md: "use a reference weight, not scale weight... where body
 * fat % is known, use lean mass; otherwise cap ref_weight_kg at the
 * weight corresponding to a BMI of 27 for their height." `bodyFatPct` is
 * optional because almost nobody knows theirs at intake time (same
 * reasoning as Katch-McArdle being an optional upgrade, not the default,
 * in the energy math).
 */
export function referenceWeightKg(weightKg: number, heightCm: number, bodyFatPct?: number | null): number {
  if (bodyFatPct !== undefined && bodyFatPct !== null) {
    return weightKg * (1 - bodyFatPct / 100)
  }
  const heightM = heightCm / 100
  const bmi27WeightKg = 27 * heightM * heightM
  return Math.min(weightKg, bmi27WeightKg)
}

const FAT_KCAL_PER_PERCENT = 0.27
const FAT_FLOOR_G_PER_KG = 0.8

export function resolveMacros(goal: Goal, kcalTarget: number, refWeightKg: number): Macros {
  const proteinG = refWeightKg * proteinGPerKgForGoal(goal)
  const fatG = Math.max((FAT_KCAL_PER_PERCENT * kcalTarget) / 9, refWeightKg * FAT_FLOOR_G_PER_KG)
  const carbG = (kcalTarget - 4 * proteinG - 9 * fatG) / 4
  return { proteinG, fatG, carbG }
}
