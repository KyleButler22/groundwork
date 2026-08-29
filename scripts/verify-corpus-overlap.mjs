#!/usr/bin/env node
// Re-runs the overlap/variety simulation from the calisthenics-recipe-
// corpus memory and docs/mealgen.md §5 — but against the REAL 200-recipe
// corpus instead of synthetic data. That earlier simulation is what
// justified authoring recipes in ingredient families rather than
// spreading them across every cuisine independently; this confirms the
// actual authored content delivers what was promised, not just the model.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments, parseInsertRows, unquote, num } from './lib/sqlParse.mjs'
import { buildIngredientIndex, resolveGrams } from './lib/ingredientIndex.mjs'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')
const seedDir = join(root, 'supabase', 'seed')
const index = buildIngredientIndex(root)

// Collect every dinner recipe's set of non-staple ingredient slugs.
const recipeFiles = readdirSync(seedDir).filter((f) => /_recipes_/.test(f)).sort()
const dinners = [] // { slug, nonStapleSlugs: Set }

for (const file of recipeFiles) {
  const sql = stripComments(readFileSync(join(seedDir, file), 'utf8'))
  const recipeSlots = new Map() // slug -> [slots]
  const slotRe = /\(\(select id from recipes where slug = '([\w-]+)'\), '(\w+)'\)/g
  let m
  while ((m = slotRe.exec(sql))) {
    if (!recipeSlots.has(m[1])) recipeSlots.set(m[1], [])
    recipeSlots.get(m[1]).push(m[2])
  }

  const riRe =
    /\(\(select id from recipes where slug = '([\w-]+)'\), \(select id from ingredients where slug = '([\w-]+)'\), ([\d.]+), \(select id from units where slug = '([\w-]+)'\), (?:'(?:[^']|'')*'|null), (true|false), \d+\)/g
  const linesBySlug = new Map()
  while ((m = riRe.exec(sql))) {
    const [, recipeSlug, ingredientSlug, , , isOptional] = m
    if (isOptional === 'true') continue
    if (!linesBySlug.has(recipeSlug)) linesBySlug.set(recipeSlug, new Set())
    const ing = index.ingredients.get(ingredientSlug)
    if (ing && !ing.isPantryStaple) linesBySlug.get(recipeSlug).add(ingredientSlug)
  }

  for (const [slug, slots] of recipeSlots) {
    if (slots.includes('dinner')) {
      dinners.push({ slug, nonStapleSlugs: linesBySlug.get(slug) ?? new Set() })
    }
  }
}

console.log(`${dinners.length} dinner recipes in the real corpus\n`)
if (dinners.length < 20) {
  console.error('FAIL  too few dinner recipes to run a meaningful simulation')
  process.exit(1)
}

// mulberry32 — same PRNG used by the actual generator, for consistency
// with docs/generator.md §8, though determinism doesn't matter much for
// a one-off measurement like this.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAYS = 7
const TRIALS = 500

function pickRandom(rng) {
  const chosen = new Set()
  while (chosen.size < DAYS) chosen.add(Math.floor(rng() * dinners.length))
  return [...chosen].map((i) => dinners[i])
}

/** Mirrors docs/mealgen.md §5's variety floor: every added recipe must
 *  bring at least `floor` ingredients not already planned. */
function pickOverlapAware(rng, floor) {
  const startIdx = Math.floor(rng() * dinners.length)
  const chosen = [dinners[startIdx]]
  const planned = new Set(chosen[0].nonStapleSlugs)
  const used = new Set([startIdx])

  while (chosen.length < DAYS) {
    let best = null, bestScore = -1, bestIdx = -1
    for (let i = 0; i < dinners.length; i++) {
      if (used.has(i)) continue
      const r = dinners[i]
      let shared = 0
      for (const s of r.nonStapleSlugs) if (planned.has(s)) shared++
      const novel = r.nonStapleSlugs.size - shared
      if (novel < floor) continue
      const score = r.nonStapleSlugs.size > 0 ? shared / r.nonStapleSlugs.size + rng() * 0.02 : rng() * 0.02
      if (score > bestScore) { bestScore = score; best = r; bestIdx = i }
    }
    if (best === null) break // pool exhausted under this floor
    chosen.push(best)
    used.add(bestIdx)
    for (const s of best.nonStapleSlugs) planned.add(s)
  }
  return chosen
}

function distinctCount(selection) {
  const all = new Set()
  for (const r of selection) for (const s of r.nonStapleSlugs) all.add(s)
  return all.size
}

function average(fn) {
  let total = 0
  for (let t = 0; t < TRIALS; t++) total += fn(mulberry32(1000 + t))
  return total / TRIALS
}

const randomAvg = average((rng) => distinctCount(pickRandom(rng)))
const floor2Avg = average((rng) => distinctCount(pickOverlapAware(rng, 2)))

console.log(`Distinct non-staple ingredients for ${DAYS} dinners, averaged over ${TRIALS} trials:`)
console.log(`  random selection            ${randomAvg.toFixed(1)}`)
console.log(`  overlap-aware (floor 2)      ${floor2Avg.toFixed(1)}  ->  ${(100 * (1 - floor2Avg / randomAvg)).toFixed(0)}% fewer`)

console.log(`\n${'='.repeat(60)}`)
const reduction = 100 * (1 - floor2Avg / randomAvg)
if (reduction < 15) {
  console.error(`FAIL  overlap-aware selection only reduced distinct ingredients by ${reduction.toFixed(0)}% — the corpus may not be clustering the way the family design intends. Compare against the ~39% measured on synthetic data (calisthenics-recipe-corpus memory).`)
  process.exit(1)
} else {
  console.log(`PASS — the real corpus delivers a real overlap benefit (${reduction.toFixed(0)}% fewer distinct ingredients), confirming the family-clustering design actually works on authored content, not just the synthetic model.`)
  process.exit(0)
}
