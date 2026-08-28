import { describe, expect, it } from 'vitest'

import { referenceWeightKg, resolveMacros } from './macros'

// The doc's worked example: fat loss, 1,930 kcal, 82kg, no known body fat %.
describe('docs/intake.md worked example — fat loss at 1,930 kcal, 82kg', () => {
  it('protein = 180g (720 kcal)', () => {
    const macros = resolveMacros('fat_loss', 1930, 82)
    expect(macros.proteinG).toBeCloseTo(180.4, 1)
  })

  it('fat = 66g (594 kcal) — the 0.8 g/kg floor binds, not the 27% route', () => {
    const macros = resolveMacros('fat_loss', 1930, 82)
    // 27% route would give 1930*0.27/9 = 57.9g; the floor (82*0.8=65.6g) wins.
    expect(macros.fatG).toBeCloseTo(65.6, 1)
    expect(macros.fatG).toBeGreaterThan((0.27 * 1930) / 9)
  })

  it('carbs = 154g (616 kcal), and the three macros sum back to kcalTarget', () => {
    const macros = resolveMacros('fat_loss', 1930, 82)
    expect(macros.carbG).toBeCloseTo(154.5, 1)
    const total = 4 * macros.proteinG + 9 * macros.fatG + 4 * macros.carbG
    expect(total).toBeCloseTo(1930, 0)
  })
})

describe('resolveMacros — protein by goal', () => {
  it('uses 2.2 g/kg for fat_loss and recomp (the doc calls recomp "protein high")', () => {
    expect(resolveMacros('fat_loss', 2000, 80).proteinG).toBeCloseTo(176, 1)
    expect(resolveMacros('recomp', 2000, 80).proteinG).toBeCloseTo(176, 1)
  })

  it('uses 2.0 g/kg for muscle_gain, maintain, and skill', () => {
    expect(resolveMacros('muscle_gain', 2500, 80).proteinG).toBeCloseTo(160, 1)
    expect(resolveMacros('maintain', 2500, 80).proteinG).toBeCloseTo(160, 1)
    expect(resolveMacros('skill', 2500, 80).proteinG).toBeCloseTo(160, 1)
  })
})

describe('referenceWeightKg', () => {
  it('uses lean mass when body fat % is known', () => {
    // 100kg at 20% body fat -> 80kg lean mass.
    expect(referenceWeightKg(100, 175, 20)).toBeCloseTo(80, 1)
  })

  it('caps at the BMI-27 weight when body fat % is unknown', () => {
    // A very heavy user should not get an unreachable 2.2 g/kg-of-scale-weight target.
    const heightM = 1.6
    const bmi27Weight = 27 * heightM * heightM // ~69.1kg
    expect(referenceWeightKg(140, 160)).toBeCloseTo(bmi27Weight, 1)
  })

  it('does not cap someone already under the BMI-27 weight', () => {
    expect(referenceWeightKg(60, 175)).toBe(60)
  })
})
