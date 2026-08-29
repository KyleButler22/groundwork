import { describe, expect, it } from 'vitest'

import { hashSeed, mulberry32, rngFor } from './rng'

describe('mulberry32', () => {
  it('is deterministic: same seed produces the same sequence', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('different seeds produce different sequences', () => {
    const a = mulberry32(1)()
    const b = mulberry32(2)()
    expect(a).not.toBe(b)
  })

  it('stays within [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('hashSeed', () => {
  it('does not collide across coordinate boundaries', () => {
    // The bug this test exists to catch: joining parts with no separator
    // makes hashSeed(seed, 1, 23) and hashSeed(seed, 12, 3) both produce
    // the string "5123" and therefore the same hash. Caught during
    // implementation before it shipped — this test is what would have
    // caught it, and what stops it coming back.
    expect(hashSeed(5, 1, 23)).not.toBe(hashSeed(5, 12, 3))
  })

  it('is order-sensitive', () => {
    expect(hashSeed(1, 'a', 'b')).not.toBe(hashSeed(1, 'b', 'a'))
  })

  it('is deterministic for the same inputs', () => {
    expect(hashSeed(99, 'week', 2, 'slot', 3)).toBe(hashSeed(99, 'week', 2, 'slot', 3))
  })

  it('produces an unsigned 32-bit integer', () => {
    const h = hashSeed(123456789, 'x')
    expect(Number.isInteger(h)).toBe(true)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('rngFor', () => {
  it('gives independent, stable draws per coordinate', () => {
    const week1 = rngFor(1, 'week', 1)()
    const week2 = rngFor(1, 'week', 2)()
    expect(week1).not.toBe(week2)
    // Re-deriving week 1's rng later must reproduce the same first draw —
    // this is the whole point of coordinate-based seeding (docs/generator.md
    // §8): nothing that happens for week 2 can perturb week 1's draw.
    expect(rngFor(1, 'week', 1)()).toBe(week1)
  })

  it('is unaffected by unrelated draws happening first (no shared stream)', () => {
    const expected = rngFor(1, 'week', 1, 'day', 2, 'slot', 3)()

    // Simulate other slots being resolved first, in a real generator run.
    rngFor(1, 'week', 1, 'day', 1, 'slot', 1)()
    rngFor(1, 'week', 1, 'day', 1, 'slot', 2)()
    rngFor(1, 'week', 1, 'day', 2, 'slot', 1)()

    expect(rngFor(1, 'week', 1, 'day', 2, 'slot', 3)()).toBe(expected)
  })
})
