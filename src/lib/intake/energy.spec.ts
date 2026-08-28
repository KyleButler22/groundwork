import { describe, expect, it } from 'vitest'

import { bmr, clampFatLossRate, kcalTargetForGoal, roundForDisplay, tdee } from './energy'

// The worked example carried through docs/intake.md: 34, 178cm, 82kg,
// male, desk job with some walking, 4x/week at 45 min. The doc's own
// numbers (BMR 1,768, TDEE 2,478...) are already rounded for display —
// 6.25 x 178 lands on a .5, which cascades a .25 or .75 fraction through
// every downstream value. Asserted here against the PRECISE unrounded
// values (independently recomputed — see the session transcript — not
// derived from this same implementation), with roundForDisplay() checked
// separately to confirm it reproduces the doc's rounded numbers.
describe('the docs/intake.md worked example', () => {
  const AGE = 34
  const HEIGHT_CM = 178
  const WEIGHT_KG = 82

  it('BMR = 1,767.5 (displays as 1,768)', () => {
    const value = bmr(WEIGHT_KG, HEIGHT_CM, AGE, 'male')
    expect(value).toBe(1767.5)
    expect(roundForDisplay(value)).toBe(1770) // nearest 10, not nearest 1
    expect(Math.round(value)).toBe(1768)
  })

  it('TDEE = 2,477.75 (displays as 2,480)', () => {
    const bmrValue = bmr(WEIGHT_KG, HEIGHT_CM, AGE, 'male')
    const tdeeValue = tdee(bmrValue, 1.3, 4, 45)
    expect(tdeeValue).toBe(2477.75)
    expect(roundForDisplay(tdeeValue)).toBe(2480)
  })

  it('fat_loss at the default 0.5kg/week rate = 1,927.75 (displays as 1,930)', () => {
    const bmrValue = bmr(WEIGHT_KG, HEIGHT_CM, AGE, 'male')
    const tdeeValue = tdee(bmrValue, 1.3, 4, 45)
    const target = kcalTargetForGoal('fat_loss', tdeeValue, bmrValue, 'male')
    expect(target).toBe(1927.75)
    expect(roundForDisplay(target)).toBe(1930)
  })

  it('muscle_gain = 2,777.75 (displays as 2,780)', () => {
    const bmrValue = bmr(WEIGHT_KG, HEIGHT_CM, AGE, 'male')
    const tdeeValue = tdee(bmrValue, 1.3, 4, 45)
    const target = kcalTargetForGoal('muscle_gain', tdeeValue, bmrValue, 'male')
    expect(target).toBe(2777.75)
    expect(roundForDisplay(target)).toBe(2780)
  })

  it('recomp = 2,377.75 (displays as 2,380)', () => {
    const bmrValue = bmr(WEIGHT_KG, HEIGHT_CM, AGE, 'male')
    const tdeeValue = tdee(bmrValue, 1.3, 4, 45)
    const target = kcalTargetForGoal('recomp', tdeeValue, bmrValue, 'male')
    expect(target).toBe(2377.75)
    expect(roundForDisplay(target)).toBe(2380)
  })

  it('maintain and skill both equal TDEE exactly', () => {
    const bmrValue = bmr(WEIGHT_KG, HEIGHT_CM, AGE, 'male')
    const tdeeValue = tdee(bmrValue, 1.3, 4, 45)
    expect(kcalTargetForGoal('maintain', tdeeValue, bmrValue, 'male')).toBe(tdeeValue)
    expect(kcalTargetForGoal('skill', tdeeValue, bmrValue, 'male')).toBe(tdeeValue)
  })
})

describe('bmr', () => {
  it('uses the midpoint offset for an unspecified sex', () => {
    const male = bmr(82, 178, 34, 'male')
    const female = bmr(82, 178, 34, 'female')
    const unspecified = bmr(82, 178, 34, 'unspecified')
    expect(unspecified).toBeGreaterThan(female)
    expect(unspecified).toBeLessThan(male)
    expect(unspecified).toBe((male + female) / 2)
  })
})

describe('kcalTargetForGoal — the floor', () => {
  it('never returns below BMR, even for an aggressive deficit', () => {
    // A very light, short person at the max fat-loss rate could otherwise
    // compute a target below their own BMR.
    const bmrValue = bmr(45, 150, 25, 'female')
    const tdeeValue = tdee(bmrValue, 1.2, 1, 20)
    const target = kcalTargetForGoal('fat_loss', tdeeValue, bmrValue, 'female', 0.75)
    expect(target).toBeGreaterThanOrEqual(bmrValue)
  })

  it('applies the 1,500 / 1,200 sex-specific absolute floor', () => {
    const bmrValue = 1000 // contrived low BMR to isolate the absolute floor
    expect(kcalTargetForGoal('fat_loss', 1000, bmrValue, 'male', 0.75)).toBeGreaterThanOrEqual(1500)
    expect(kcalTargetForGoal('fat_loss', 1000, bmrValue, 'female', 0.75)).toBeGreaterThanOrEqual(1200)
  })
})

describe('clampFatLossRate', () => {
  it('caps at 1% of bodyweight per week regardless of what is requested', () => {
    expect(clampFatLossRate(5, 80)).toBe(0.8) // 5kg/week requested, capped to 1% of 80kg
  })

  it('passes through a reasonable request unchanged', () => {
    expect(clampFatLossRate(0.5, 80)).toBe(0.5)
  })

  it('never goes negative', () => {
    expect(clampFatLossRate(-1, 80)).toBe(0)
  })
})
