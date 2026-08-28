import { describe, expect, it } from 'vitest'

import { ageFromBirthYear, bmi, isUnderMinimumAge, isUnderweight, shouldSoftenGoalScreen } from './safetyGates'

describe('age and minimum-age gate', () => {
  it('computes age from birth year and a given current year', () => {
    expect(ageFromBirthYear(1992, 2026)).toBe(34)
  })

  it('flags under the minimum age', () => {
    expect(isUnderMinimumAge(2012, 2026)).toBe(true) // 14
    expect(isUnderMinimumAge(2015, 2026)).toBe(true) // 11
  })

  it('does not flag at or above the minimum age', () => {
    expect(isUnderMinimumAge(2010, 2026)).toBe(false) // exactly 16
    expect(isUnderMinimumAge(2000, 2026)).toBe(false) // 26
  })
})

describe('bmi and underweight gate', () => {
  it('computes standard BMI', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.86, 1)
  })

  it('flags underweight below 18.5', () => {
    expect(isUnderweight(50, 175)).toBe(true) // BMI ~16.3
  })

  it('does not flag at a healthy weight', () => {
    expect(isUnderweight(70, 175)).toBe(false)
  })
})

describe('shouldSoftenGoalScreen', () => {
  it('is false when neither question raises a concern', () => {
    expect(shouldSoftenGoalScreen({ clinicianRaisedConcern: false, thoughtsFeelIntrusive: false })).toBe(false)
  })

  it('is true if either question raises a concern', () => {
    expect(shouldSoftenGoalScreen({ clinicianRaisedConcern: true, thoughtsFeelIntrusive: false })).toBe(true)
    expect(shouldSoftenGoalScreen({ clinicianRaisedConcern: false, thoughtsFeelIntrusive: true })).toBe(true)
  })
})
