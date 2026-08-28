#!/usr/bin/env node
// Domain check on top of verify-sql.mjs: that check confirms the SQL is
// well-formed (every slug lookup resolves). This confirms the *content* is
// what docs/generator.md assumes — each pattern is a single ungapped,
// non-branching, level-ascending chain, so the "walk down until performable"
// / "walk up on promotion" logic in the generator spec has solid ground to
// walk on. A typo that points an edge at the wrong (but real) exercise
// would pass verify-sql.mjs and only show up here.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')
const seedPath = join(root, 'supabase', 'seed', '001_movement_library.sql')
const sql = readFileSync(seedPath, 'utf8').replace(/--.*$/gm, '')

let errors = 0
const fail = (msg) => { console.error('FAIL  ' + msg); errors++ }
const ok = (msg) => console.log('ok    ' + msg)

// slug -> { pattern, level }
const exercises = new Map()
const exerciseRowRe = /\(\s*'([\w-]+)'\s*,\s*'[^']*'\s*,\s*\(select id from movement_patterns where slug = '([\w-]+)'\)\s*,\s*([\d.]+)\s*,/g
let m
while ((m = exerciseRowRe.exec(sql))) {
  const [, slug, pattern, level] = m
  exercises.set(slug, { pattern, level: parseFloat(level) })
}

const expectedCounts = {
  horizontal_push: 9,
  vertical_push: 7,
  vertical_pull: 9,
  horizontal_pull: 6,
  squat: 7,
  hinge: 6,
  core: 9,
  skill_handstand: 7,
}
const expectedTotal = Object.values(expectedCounts).reduce((a, b) => a + b, 0)

console.log(`parsed ${exercises.size} exercises\n`)
if (exercises.size !== expectedTotal) {
  fail(`total exercise count is ${exercises.size}, expected ${expectedTotal}`)
} else {
  ok(`total exercise count matches design: ${expectedTotal}`)
}

const byPattern = new Map()
for (const [slug, { pattern, level }] of exercises) {
  if (!byPattern.has(pattern)) byPattern.set(pattern, [])
  byPattern.get(pattern).push({ slug, level })
}

for (const [pattern, expected] of Object.entries(expectedCounts)) {
  const list = byPattern.get(pattern)
  if (!list) {
    fail(`pattern "${pattern}": zero exercises found (expected ${expected})`)
    continue
  }
  if (list.length !== expected) {
    fail(`pattern "${pattern}": ${list.length} exercises, expected ${expected}`)
  }
  // Levels must be exactly 1.0..N with no gaps or duplicates.
  const levels = list.map((x) => x.level).sort((a, b) => a - b)
  const wantLevels = Array.from({ length: expected }, (_, i) => i + 1)
  const gotOk = levels.length === wantLevels.length && levels.every((l, i) => l === wantLevels[i])
  if (!gotOk) fail(`pattern "${pattern}": levels are [${levels.join(', ')}], expected [${wantLevels.join(', ')}] — gap, dupe, or off-by-one`)
}
if (errors === 0) ok(`all ${Object.keys(expectedCounts).length} patterns have gap-free levels 1..N matching their designed rung count`)

const unexpectedPatterns = [...byPattern.keys()].filter((p) => !(p in expectedCounts))
if (unexpectedPatterns.length) fail(`exercises reference pattern(s) not in the design: ${unexpectedPatterns.join(', ')}`)

// ---- edges ---------------------------------------------------------------
const edgeRe = /\(\(select id from exercises where slug = '([\w-]+)'\), \(select id from exercises where slug = '([\w-]+)'\), '(\w+)'\)/g
const edges = []
while ((m = edgeRe.exec(sql))) edges.push({ from: m[1], to: m[2], kind: m[3] })

console.log(`\nparsed ${edges.length} progression edges`)
const expectedEdgeTotal = expectedTotal - Object.keys(expectedCounts).length // one fewer edge than nodes, per chain
if (edges.length !== expectedEdgeTotal) {
  fail(`edge count is ${edges.length}, expected ${expectedEdgeTotal} (= ${expectedTotal} exercises - ${Object.keys(expectedCounts).length} chains)`)
} else {
  ok(`edge count matches a single unbroken chain per pattern: ${edges.length}`)
}

const outDeg = new Map()
const inDeg = new Map()
let crossPattern = 0
let wrongDirection = 0
for (const { from, to, kind } of edges) {
  if (kind !== 'progression') continue
  const fx = exercises.get(from)
  const tx = exercises.get(to)
  if (!fx || !tx) continue // already reported by verify-sql.mjs's slug check
  outDeg.set(from, (outDeg.get(from) ?? 0) + 1)
  inDeg.set(to, (inDeg.get(to) ?? 0) + 1)
  if (fx.pattern !== tx.pattern) {
    crossPattern++
    fail(`edge ${from} -> ${to} crosses patterns (${fx.pattern} -> ${tx.pattern})`)
  } else if (tx.level !== fx.level + 1) {
    wrongDirection++
    fail(`edge ${from} -> ${to} skips or reverses levels (${fx.level} -> ${tx.level}, expected ${fx.level + 1})`)
  }
}
if (crossPattern === 0) ok('no edge crosses between patterns')
if (wrongDirection === 0) ok('every edge steps exactly one level up within its pattern')

// Exactly one node per pattern with in-degree 0 (the entry rung) and one
// with out-degree 0 (the ceiling) — anything else means a branch or a
// disconnected fragment, neither of which docs/generator.md's linear-chain
// assumption expects yet.
for (const [pattern, list] of byPattern) {
  const roots = list.filter((x) => !inDeg.has(x.slug))
  const leaves = list.filter((x) => !outDeg.has(x.slug))
  const branchy = list.filter((x) => (outDeg.get(x.slug) ?? 0) > 1 || (inDeg.get(x.slug) ?? 0) > 1)
  if (roots.length !== 1) fail(`pattern "${pattern}": ${roots.length} entry rung(s) (in-degree 0), expected exactly 1: ${roots.map((r) => r.slug).join(', ')}`)
  if (leaves.length !== 1) fail(`pattern "${pattern}": ${leaves.length} ceiling rung(s) (out-degree 0), expected exactly 1: ${leaves.map((r) => r.slug).join(', ')}`)
  if (branchy.length) fail(`pattern "${pattern}": branching detected at ${branchy.map((b) => b.slug).join(', ')} — fine per the schema, but docs/generator.md's branch-selection logic has no real content to exercise yet, so this is probably unintentional`)
}
if (errors === 0) console.log('\nok    every pattern is a single clean chain: one entry, one ceiling, no branches, no gaps')

console.log(`\n${'='.repeat(60)}`)
if (errors === 0) {
  console.log('PASS')
  process.exit(0)
} else {
  console.log(`FAILED — ${errors} issue(s)`)
  process.exit(1)
}
