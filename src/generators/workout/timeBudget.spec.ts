import { describe, expect, it } from 'vitest'

import { allocateBudget, type BudgetItem, costSeconds, usableSeconds } from './timeBudget'

describe('usableSeconds', () => {
  it('subtracts warm-up and buffer from the session length', () => {
    // docs/generator.md §3: "usable = session_minutes × 60 − 360s warm-up − 180s buffer"
    expect(usableSeconds(30)).toBe(1260)
    expect(usableSeconds(45)).toBe(2160)
    expect(usableSeconds(60)).toBe(3060)
  })
})

describe('costSeconds', () => {
  it('matches docs/generator.md §3: sets × work + (sets − 1) × rest + 30s transition', () => {
    expect(costSeconds({ costPerSetSeconds: 24, restSeconds: 120 }, 4)).toBe(4 * 24 + 3 * 120 + 30)
  })

  it('is zero for zero sets', () => {
    expect(costSeconds({ costPerSetSeconds: 24, restSeconds: 120 }, 0)).toBe(0)
  })

  it('has no rest cost for a single set', () => {
    expect(costSeconds({ costPerSetSeconds: 24, restSeconds: 120 }, 1)).toBe(24 + 30)
  })
})

describe('allocateBudget', () => {
  // Worked example, independently hand-computed (see the session transcript
  // — a standalone script implementing the same formula, not this module,
  // was run first and produced these exact numbers) rather than asserting
  // whatever the implementation happens to output.
  const upperDayMuscleGain: BudgetItem[] = [
    { slotId: 'vertical_pull', required: true, priority: 2, costPerSetSeconds: 24, restSeconds: 120, minSets: 2, maxSets: 4 },
    { slotId: 'horizontal_push', required: true, priority: 3, costPerSetSeconds: 24, restSeconds: 120, minSets: 2, maxSets: 4 },
    { slotId: 'core', required: true, priority: 4, costPerSetSeconds: 36, restSeconds: 60, minSets: 2, maxSets: 3 },
    { slotId: 'horizontal_pull', required: false, priority: 5, costPerSetSeconds: 24, restSeconds: 120, minSets: 2, maxSets: 4 },
    { slotId: 'vertical_push', required: false, priority: 6, costPerSetSeconds: 24, restSeconds: 120, minSets: 2, maxSets: 4 },
  ]

  it('reproduces the hand-computed worked example exactly', () => {
    const result = allocateBudget(upperDayMuscleGain, 30)

    expect(result.usableSeconds).toBe(1260)
    expect(result.dropped.map((d) => d.slotId)).toEqual(['horizontal_pull', 'vertical_push'])

    const bySlot = Object.fromEntries(result.included.map((i) => [i.slotId, i]))
    expect(bySlot.vertical_pull.sets).toBe(4)
    expect(bySlot.horizontal_push.sets).toBe(4)
    expect(bySlot.core.sets).toBe(3)

    expect(result.totalSeconds).toBe(1230)
    expect(result.remainingSeconds).toBe(30)
  })

  it('keeps output in the ORIGINAL input order, not priority order', () => {
    // The optional items are dropped here, but if they weren't, output
    // order must still be performance order (input order), not the
    // priority order used internally to decide what to upgrade first.
    const reordered: BudgetItem[] = [
      { slotId: 'core', required: true, priority: 4, costPerSetSeconds: 36, restSeconds: 60, minSets: 2, maxSets: 3 },
      { slotId: 'vertical_pull', required: true, priority: 2, costPerSetSeconds: 24, restSeconds: 120, minSets: 2, maxSets: 4 },
      { slotId: 'horizontal_push', required: true, priority: 3, costPerSetSeconds: 24, restSeconds: 120, minSets: 2, maxSets: 4 },
    ]
    const result = allocateBudget(reordered, 30)
    expect(result.included.map((i) => i.slotId)).toEqual(['core', 'vertical_pull', 'horizontal_push'])
  })

  it('never drops a required slot, even when its minimum blows the budget', () => {
    const tiny: BudgetItem[] = [
      { slotId: 'huge', required: true, priority: 1, costPerSetSeconds: 500, restSeconds: 120, minSets: 3, maxSets: 3 },
    ]
    const result = allocateBudget(tiny, 5) // usable = 300 - 540 = -240, already negative
    expect(result.included).toHaveLength(1)
    expect(result.included[0].sets).toBe(3) // still the full minimum, not reduced
    expect(result.remainingSeconds).toBeLessThan(0) // caller's job to treat this as a validation failure
  })

  it('gives a high-priority optional slot first claim on leftover budget over a lower-priority one', () => {
    const items: BudgetItem[] = [
      { slotId: 'req', required: true, priority: 1, costPerSetSeconds: 10, restSeconds: 10, minSets: 1, maxSets: 1 },
      { slotId: 'opt_low_priority', required: false, priority: 9, costPerSetSeconds: 100, restSeconds: 0, minSets: 1, maxSets: 1 },
      { slotId: 'opt_high_priority', required: false, priority: 1, costPerSetSeconds: 100, restSeconds: 0, minSets: 1, maxSets: 1 },
    ]
    // usable(1 min) = 60 - 540 = -480; nowhere near enough for req's own 40s
    // (10+30 transition), so use a session long enough for req + exactly
    // one of the two optional slots (130s each) but not both.
    const usable = 40 /* req */ + 130 /* one optional */ + 50 /* not enough for the second */
    const sessionMinutes = (usable + 540) / 60
    const result = allocateBudget(items, sessionMinutes)
    const includedSlots = result.included.map((i) => i.slotId)
    expect(includedSlots).toContain('opt_high_priority')
    expect(includedSlots).not.toContain('opt_low_priority')
  })
})
