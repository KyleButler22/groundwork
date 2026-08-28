import { describe, expect, it } from 'vitest'

import { chooseSplit } from './splits'

describe('chooseSplit', () => {
  it('uses full_body for 1-3 days, one template repeated per day', () => {
    for (const days of [1, 2, 3]) {
      const choice = chooseSplit(days)
      expect(choice.splitType).toBe('full_body')
      expect(choice.cycle).toHaveLength(days)
      expect(new Set(choice.cycle.map((t) => t.name)).size).toBe(1) // literally the same template object each day
    }
  })

  it('uses upper_lower for 4 days, alternating exactly', () => {
    const choice = chooseSplit(4)
    expect(choice.splitType).toBe('upper_lower')
    expect(choice.cycle.map((t) => t.name)).toEqual(['Upper', 'Lower', 'Upper', 'Lower'])
  })

  it('uses upper_lower for 5 days too, as an extra Upper day (documented simplification)', () => {
    const choice = chooseSplit(5)
    expect(choice.splitType).toBe('upper_lower')
    expect(choice.cycle.map((t) => t.name)).toEqual(['Upper', 'Lower', 'Upper', 'Lower', 'Upper'])
  })

  it('uses push_pull_legs for 6 days, cycling twice', () => {
    const choice = chooseSplit(6)
    expect(choice.splitType).toBe('push_pull_legs')
    expect(choice.cycle.map((t) => t.name)).toEqual(['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs'])
  })

  it('never produces a 7-day cycle, even if asked — clamps to 6', () => {
    const choice = chooseSplit(7)
    expect(choice.cycle).toHaveLength(6)
    expect(choice.splitType).toBe('push_pull_legs')
  })

  it('clamps below 1 up to a single full_body day', () => {
    const choice = chooseSplit(0)
    expect(choice.cycle).toHaveLength(1)
    expect(choice.splitType).toBe('full_body')
  })

  it('every required slot in every template names a real seed pattern slug', () => {
    // The 8 patterns actually seeded in supabase/seed/001_movement_library.sql
    // — this list is a deliberate literal, not an import from the seed
    // file, so a typo'd slug in splits.ts fails here instead of only
    // surfacing once wired to real data.
    const realPatternSlugs = new Set([
      'horizontal_push',
      'vertical_push',
      'vertical_pull',
      'horizontal_pull',
      'squat',
      'hinge',
      'core',
      'skill_handstand',
    ])
    for (const days of [1, 2, 3, 4, 5, 6]) {
      for (const template of chooseSplit(days).cycle) {
        for (const slot of template.slots) {
          expect(realPatternSlugs.has(slot.patternSlug)).toBe(true)
        }
      }
    }
  })
})
