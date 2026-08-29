/**
 * Deterministic randomness, shared by both generators (docs/generator.md
 * §8, docs/mealgen.md's "same determinism rule as the workout generator").
 * Originally lived at src/generators/workout/rng.ts; moved here once the
 * meal generator needed the exact same primitive — nothing below is
 * workout-specific, and importing across generator directories would have
 * been a stranger dependency than both depending on a shared module.
 *
 * The rule that matters: seed PER DECISION from coordinates, never from a
 * shared stream. A stream (`rng(); rng(); rng();`) means changing what
 * happens at decision N silently reshuffles every decision after it —
 * adding a slot to week 1 would rewrite every exercise choice in weeks
 * 2-4, or adding a recipe to Monday would rewrite every meal choice for
 * the rest of the week. Coordinates make each decision independent and
 * stable: the same (seed, ...coordinates) always produces the same draw,
 * regardless of what any other decision does.
 */

/** mulberry32 — small, fast, good-enough (not cryptographic) PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Separates coordinate parts before hashing. Must be a character that can
// never appear inside a part (slugs, week/day/slot numbers) — a plain pipe
// is unambiguous and, unlike a control-character escape, survives editors
// and diffs without any risk of silently losing the separator and
// collapsing back into the boundary-collision bug this exists to prevent.
const PART_SEPARATOR = '|'

/**
 * FNV-1a over the coordinate parts, producing the 32-bit integer that
 * seeds mulberry32. Parts are joined with PART_SEPARATOR, not
 * concatenated directly — `hashSeed(seed, 1, 23)` and `hashSeed(seed, 12, 3)`
 * would otherwise both join to the same string and collide.
 */
export function hashSeed(...parts: Array<string | number>): number {
  const joined = parts.join(PART_SEPARATOR)
  let hash = 0x811c9dc5
  for (let i = 0; i < joined.length; i++) {
    hash ^= joined.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** The one entry point every generator module should use — never call
 *  mulberry32 directly against the raw seed. */
export function rngFor(seed: number, ...coordinates: Array<string | number>): () => number {
  return mulberry32(hashSeed(seed, ...coordinates))
}
