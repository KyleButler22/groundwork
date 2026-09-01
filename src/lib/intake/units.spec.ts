import { describe, expect, it } from 'vitest'

import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg } from './units'

describe('cmToFeetInches', () => {
  it('never lets inches round up to 12 without carrying into feet', () => {
    // The exact regression: 152cm is 59.84 total inches, which used to
    // floor to 4 feet with an 11.84-inch remainder that rounded to a
    // literal "4 feet, 12 inches" instead of carrying to 5'0".
    expect(cmToFeetInches(152)).toEqual({ feet: 5, inches: 0 })
  })

  it('round-trips a clean 5-foot-10 exactly', () => {
    expect(cmToFeetInches(feetInchesToCm(5, 10))).toEqual({ feet: 5, inches: 10 })
  })

  it('handles 0 cm', () => {
    expect(cmToFeetInches(0)).toEqual({ feet: 0, inches: 0 })
  })

  it('never returns inches outside 0-11', () => {
    for (let cm = 0; cm < 250; cm++) {
      const { inches } = cmToFeetInches(cm)
      expect(inches).toBeGreaterThanOrEqual(0)
      expect(inches).toBeLessThanOrEqual(11)
    }
  })
})

describe('feetInchesToCm', () => {
  it('converts a known height', () => {
    expect(feetInchesToCm(5, 10)).toBeCloseTo(177.8, 1)
  })

  it('treats feet and inches as additive (5\'12" behaves like 6\'0")', () => {
    expect(feetInchesToCm(5, 12)).toBeCloseTo(feetInchesToCm(6, 0), 6)
  })
})

describe('lbToKg / kgToLb', () => {
  it('round-trips within floating-point tolerance', () => {
    expect(kgToLb(lbToKg(165))).toBeCloseTo(165, 6)
  })
})
