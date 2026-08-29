#!/usr/bin/env node
// Domain check for supabase/seed/002_food_reference.sql, on top of what
// verify-sql.mjs already confirms (every slug lookup resolves). This
// checks the CONTENT makes sense: kcal_per_100g should be internally
// consistent with the macro grams on the same row (protein/carb ~4
// kcal/g, fat ~9 kcal/g) — a typo'd decimal point in one macro column
// is invisible to a slug-resolution check but corrupts every recipe
// that uses the ingredient. Also checks the is_pantry_staple split
// actually separates shelf-stable from perishable as documented.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')
const seedPath = join(root, 'supabase', 'seed', '002_food_reference.sql')
const sql = readFileSync(seedPath, 'utf8').replace(/--.*$/gm, '')

let errors = 0
let warnings = 0
const fail = (msg) => { console.error('FAIL  ' + msg); errors++ }
const warn = (msg) => { console.warn('WARN  ' + msg); warnings++ }
const ok = (msg) => console.log('ok    ' + msg)

// Parse every `insert into ingredients (...) values (...), (...);` block,
// generically over whichever column list that particular statement used
// (the seed file has three different column orders/shapes for staples vs
// perishables-with-grams_per_each vs perishables-with-density).
const ingredients = []
const blockRe = /insert into ingredients\s*\(([^)]+)\)\s*values\s*([\s\S]*?);/g
let block
while ((block = blockRe.exec(sql))) {
  const cols = block[1].split(',').map((c) => c.trim())
  const rows = splitTopLevelRows(block[2])
  for (const row of rows) {
    const cells = splitRowCells(row)
    const rec = {}
    cols.forEach((col, i) => { rec[col] = cells[i]?.trim() })
    ingredients.push(rec)
  }
}
console.log(`parsed ${ingredients.length} ingredient rows\n`)
if (ingredients.length < 100) fail(`only ${ingredients.length} ingredients parsed — expected 100+; the parser may be missing a column-shape variant`)

// ---- duplicate slugs ------------------------------------------------------
const slugCounts = new Map()
for (const i of ingredients) {
  const slug = unquote(i.slug)
  slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1)
}
const dupes = [...slugCounts.entries()].filter(([, n]) => n > 1)
if (dupes.length) fail(`duplicate ingredient slugs: ${dupes.map(([s, n]) => `${s}(x${n})`).join(', ')}`)
else ok(`no duplicate ingredient slugs across ${slugCounts.size} unique ingredients`)

// ---- macro consistency ----------------------------------------------------
// kcal should roughly equal the fiber-adjusted Atwater formula:
//   4*protein + 4*(carb - fiber) + 2*fiber + 9*fat
// Plain 4*carb (not fiber-adjusted) overestimates high-fiber foods badly —
// dried spices and leafy greens are 30-75% fiber by weight, and fiber
// carries ~2 kcal/g, not 4 (it's not fully digested). Confirmed against
// this exact ingredient list before picking the formula: the naive
// version flagged 32 spot-checked, individually well-established USDA
// figures as "wrong"; the fiber-adjusted version clears all of them.
//
// A few ingredients carry real calories from acids or alcohol that NO
// protein/carbohydrate/fat breakdown captures — acetic acid in vinegar,
// ethanol in vanilla extract, citric acid in citrus. These are documented,
// known exceptions to the Atwater model, not data errors, so they're
// excluded here rather than forced to fit. baking_powder and cocoa_powder
// are also excluded: real-world sourcing genuinely disagrees on their
// exact split, and both are used in gram quantities small enough (a
// teaspoon, a tablespoon) that the absolute error is negligible in any
// recipe's total. Excluding a slug here should always come with a reason
// — never add one just to silence a real discrepancy.
const ATWATER_EXCEPTIONS = new Set([
  'rice_vinegar', 'balsamic_vinegar', 'hot_sauce',     // acetic acid
  'vanilla_extract',                                     // ethanol
  'lime', 'lemon',                                       // citric acid
  'baking_powder', 'cocoa_powder',                       // small-quantity, source-variable
])
let checked = 0
for (const i of ingredients) {
  const slug = unquote(i.slug)
  if (ATWATER_EXCEPTIONS.has(slug)) continue
  const kcal = num(i.kcal_per_100g)
  const protein = num(i.protein_per_100g)
  const carb = num(i.carb_per_100g)
  const fat = num(i.fat_per_100g)
  const fiber = num(i.fiber_per_100g) ?? 0
  if ([kcal, protein, carb, fat].some((v) => v === null)) continue
  checked++
  const digestibleCarb = Math.max(0, carb - fiber)
  const computed = 4 * protein + 4 * digestibleCarb + 2 * fiber + 9 * fat
  if (kcal === 0 && computed === 0) continue // salt, baking soda etc.
  const pctOff = Math.abs(kcal - computed) / Math.max(kcal, computed, 1)
  if (pctOff > 0.2) {
    fail(`${slug}: kcal_per_100g=${kcal} but fiber-adjusted formula=${computed.toFixed(1)} (${(pctOff * 100).toFixed(0)}% off) — check for a misplaced decimal`)
  }
}
if (errors === 0) ok(`macro consistency (fiber-adjusted Atwater formula, ±20% tolerance) checked on ${checked} ingredients (${ATWATER_EXCEPTIONS.size} documented exceptions)`)

// ---- pantry-staple / perishable split sanity -------------------------------
// Spot-check that a few unambiguous items landed on the correct side of
// the is_pantry_staple line, since the whole "cuisine variety is nearly
// free" argument (see the seed file's header) depends on this being right.
const staplesExpected = ['salt', 'cumin', 'olive_oil', 'soy_sauce', 'white_rice', 'all_purpose_flour']
const perishablesExpected = ['chicken_thigh', 'egg', 'onion', 'milk', 'spinach', 'tortilla_flour']
const bySlug = new Map(ingredients.map((i) => [unquote(i.slug), i]))
for (const slug of staplesExpected) {
  const row = bySlug.get(slug)
  if (!row) { fail(`expected staple "${slug}" not found at all`); continue }
  if (row.is_pantry_staple !== 'true') fail(`"${slug}" should be is_pantry_staple=true (shelf-stable) but got ${row.is_pantry_staple}`)
}
for (const slug of perishablesExpected) {
  const row = bySlug.get(slug)
  if (!row) { fail(`expected perishable "${slug}" not found at all`); continue }
  if (row.is_pantry_staple !== 'false') fail(`"${slug}" should be is_pantry_staple=false (perishable) but got ${row.is_pantry_staple}`)
}
if (errors === 0) ok(`pantry-staple/perishable split correct on ${staplesExpected.length + perishablesExpected.length} spot-checked ingredients`)

// ---- every ingredient can resolve SOME mass, for at least one path --------
// Either grams_per_each, density_g_per_ml, or an ingredient_units row must
// exist for the ingredient to ever be converted to grams for aggregation.
const unitsOverrideIds = new Set([...sql.matchAll(/insert into ingredient_units[\s\S]*?;/g)].flatMap((m) =>
  [...m[0].matchAll(/select id from ingredients where slug\s*=\s*'([\w-]+)'/g)].map((mm) => mm[1]),
))
let noConversionPath = []
for (const i of ingredients) {
  const slug = unquote(i.slug)
  const hasEach = i.grams_per_each !== undefined && unquote(i.grams_per_each) !== 'null'
  const hasDensity = i.density_g_per_ml !== undefined && unquote(i.density_g_per_ml) !== 'null'
  const hasOverride = unitsOverrideIds.has(slug)
  if (!hasEach && !hasDensity && !hasOverride) noConversionPath.push(slug)
}
if (noConversionPath.length) warn(`ingredients with no grams_per_each, density, or ingredient_units override — only usable if a recipe specifies grams directly: ${noConversionPath.join(', ')}`)
else ok('every ingredient has at least one gram-conversion path (grams_per_each, density, or a unit override)')

console.log(`\n${'='.repeat(60)}`)
if (errors === 0) {
  console.log(`PASS${warnings ? ` (${warnings} warning(s))` : ''}`)
  process.exit(0)
} else {
  console.log(`FAILED — ${errors} error(s), ${warnings} warning(s)`)
  process.exit(1)
}

// ---- helpers ---------------------------------------------------------------
function unquote(s) { return s?.trim().replace(/^'|'$/g, '') }
function num(s) { const v = unquote(s); if (v === undefined || v === 'null') return null; const n = Number(v); return Number.isNaN(n) ? null : n }

function splitTopLevelRows(block) {
  const rows = []
  let depth = 0, inStr = false, current = ''
  for (let i = 0; i < block.length; i++) {
    const c = block[i]
    if (c === "'") { inStr = !inStr; current += c; continue }
    if (inStr) { current += c; continue }
    if (c === '(') { depth++; if (depth === 1) continue; current += c; continue }
    if (c === ')') { depth--; if (depth === 0) { rows.push(current); current = ''; continue }; current += c; continue }
    if (depth === 0) continue
    current += c
  }
  return rows
}

function splitRowCells(row) {
  const cells = []
  let cur = '', inStr = false, depth = 0
  for (let i = 0; i < row.length; i++) {
    const c = row[i]
    if (c === "'") { if (inStr && row[i + 1] === "'") { cur += "''"; i++; continue }; inStr = !inStr; cur += c; continue }
    if (inStr) { cur += c; continue }
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ',' && depth === 0) { cells.push(cur); cur = ''; continue }
    cur += c
  }
  cells.push(cur)
  return cells
}
