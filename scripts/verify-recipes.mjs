#!/usr/bin/env node
// Domain check for the generated supabase/seed/*_recipes_*.sql files.
//
// The most important thing this checks: that recipes.kcal_per_serving
// (etc.) — the denormalised cache — actually equals what recipe_ingredients
// sums to. verify-sql.mjs and the ingredientIndex.mjs unit tests both
// already got exercised on the pieces; this is the end-to-end check that
// the SQL actually WRITTEN by generate-recipes.mjs is internally
// consistent, independent of trusting the generator got its own job right.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments, parseInsertRows, unquote, num } from './lib/sqlParse.mjs'
import { buildIngredientIndex, resolveGrams } from './lib/ingredientIndex.mjs'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')
const seedDir = join(root, 'supabase', 'seed')

let errors = 0
let warnings = 0
const fail = (msg) => { console.error('FAIL  ' + msg); errors++ }
const warn = (msg) => { console.warn('WARN  ' + msg); warnings++ }
const ok = (msg) => console.log('ok    ' + msg)

const recipeFiles = readdirSync(seedDir).filter((f) => /_recipes_/.test(f)).sort()
if (recipeFiles.length === 0) {
  console.log('(no recipe seed files yet — nothing to check)')
  process.exit(0)
}

const index = buildIngredientIndex(root)

// ---- gather every recipe across all family files ---------------------
const recipes = new Map() // slug -> { title, servings, cuisine, storedMacros, ingredientLines, mealSlots, dietTags, file }
let totalRecipes = 0

for (const file of recipeFiles) {
  const sql = stripComments(readFileSync(join(seedDir, file), 'utf8'))

  for (const row of parseInsertRows(sql, 'recipes')) {
    const slug = unquote(row.slug)
    if (recipes.has(slug)) fail(`duplicate recipe slug across files: ${slug}`)
    recipes.set(slug, {
      file,
      title: unquote(row.title),
      servings: num(row.servings),
      cuisine: unquote(row.cuisine),
      difficulty: num(row.difficulty),
      prepMinutes: num(row.prep_minutes),
      cookMinutes: num(row.cook_minutes),
      storedMacros: {
        kcal: num(row.kcal_per_serving),
        protein: num(row.protein_per_serving),
        carb: num(row.carb_per_serving),
        fat: num(row.fat_per_serving),
      },
      ingredientLines: [],
      mealSlots: [],
      dietTags: [],
    })
    totalRecipes++
  }

  // recipe_ingredients rows reference their recipe via a
  // `(select id from recipes where slug = 'X')` subquery — recover X with
  // a targeted regex rather than the generic row parser, same idiom used
  // throughout this project's other seed-parsing scripts.
  const riRe =
    /\(\(select id from recipes where slug = '([\w-]+)'\), \(select id from ingredients where slug = '([\w-]+)'\), ([\d.]+), \(select id from units where slug = '([\w-]+)'\), (?:'((?:[^']|'')*)'|null), (true|false), (\d+)\)/g
  let m
  while ((m = riRe.exec(sql))) {
    const [, recipeSlug, ingredientSlug, qty, unitSlug, , isOptional] = m
    recipes.get(recipeSlug)?.ingredientLines.push({ slug: ingredientSlug, qty: Number(qty), unit: unitSlug, optional: isOptional === 'true' })
  }

  const slotRe = /\(\(select id from recipes where slug = '([\w-]+)'\), '(\w+)'\)/g
  while ((m = slotRe.exec(sql))) recipes.get(m[1])?.mealSlots.push(m[2])

  const dietRe = /\(\(select id from recipes where slug = '([\w-]+)'\), \(select id from diet_tags where slug = '([\w-]+)'\)\)/g
  while ((m = dietRe.exec(sql))) recipes.get(m[1])?.dietTags.push(m[2])

  const stepRe2 = /\(\(select id from recipes where slug = '([\w-]+)'\), \d+, '((?:[^']|'')*)'\)/g
  while ((m = stepRe2.exec(sql))) {
    const r = recipes.get(m[1])
    if (r) r.stepText = (r.stepText ?? '') + ' ' + unquote(`'${m[2]}'`)
  }
}

console.log(`parsed ${totalRecipes} recipes across ${recipeFiles.length} file(s)\n`)

// ---- macro cache consistency -------------------------------------------
let macroMismatches = 0
for (const [slug, r] of recipes) {
  if (r.ingredientLines.length === 0) { warn(`${slug}: no recipe_ingredients parsed — macro check skipped`); continue }
  let totals
  try {
    totals = { kcal: 0, protein: 0, carb: 0, fat: 0 }
    for (const line of r.ingredientLines) {
      if (line.optional) continue
      const grams = resolveGrams(index, line.slug, line.qty, line.unit)
      const ing = index.ingredients.get(line.slug)
      totals.kcal += (grams * ing.kcal) / 100
      totals.protein += (grams * ing.protein) / 100
      totals.carb += (grams * ing.carb) / 100
      totals.fat += (grams * ing.fat) / 100
    }
  } catch (err) {
    fail(`${slug}: recomputation failed — ${err.message}`)
    continue
  }
  const perServing = {
    kcal: totals.kcal / r.servings,
    protein: totals.protein / r.servings,
    carb: totals.carb / r.servings,
    fat: totals.fat / r.servings,
  }
  for (const key of ['kcal', 'protein', 'carb', 'fat']) {
    const stored = r.storedMacros[key]
    const computed = perServing[key]
    // Small tolerance for the generator's own .toFixed(1) rounding, not a
    // meaningful discrepancy allowance.
    if (Math.abs(stored - computed) > 0.15) {
      fail(`${slug}: stored ${key}_per_serving=${stored} but recomputing recipe_ingredients gives ${computed.toFixed(2)}`)
      macroMismatches++
    }
  }
}
if (macroMismatches === 0) ok(`every recipe's stored per-serving macros exactly match a fresh recomputation from its recipe_ingredients (${recipes.size} recipes)`)

// ---- steps mentioning an ingredient not in the structured list -----------
// Caught for real while authoring the oats family: two recipes' step text
// said "top with sliced banana" / "add diced apple" but never listed
// banana/apple as an ingredient — meaning the grocery list would silently
// omit something the recipe actually needs. A curated watchlist of
// easy-to-forget garnish/topping produce, not a check against all 150
// ingredients (most food words in step text are already correctly listed
// under an exact ingredient name, and a blanket check would be mostly
// false positives from that).
const GARNISH_WATCHLIST = ['banana', 'apple', 'avocado', 'lime', 'lemon', 'cilantro', 'parsley', 'basil']
let garnishMismatches = 0
for (const [slug, r] of recipes) {
  const stepText = (r.stepText ?? '').toLowerCase()
  const listedSlugs = new Set(r.ingredientLines.map((l) => l.slug))
  for (const word of GARNISH_WATCHLIST) {
    if (!stepText.includes(word)) continue
    const alreadyListed = [...listedSlugs].some((s) => s.includes(word))
    if (!alreadyListed) {
      fail(`${slug}: step text mentions "${word}" but no ingredient line uses it — the grocery list would silently omit it`)
      garnishMismatches++
    }
  }
}
if (garnishMismatches === 0) ok(`no recipe's steps mention a watchlisted ingredient (${GARNISH_WATCHLIST.join(', ')}) that is missing from its ingredient list`)

// ---- structural sanity ---------------------------------------------------
let noSteps = 0, noMealSlot = 0, tooFewIngredients = 0
for (const [slug, r] of recipes) {
  if (r.mealSlots.length === 0) { fail(`${slug}: no recipe_meal_slots row — will never be selected by the meal generator`); noMealSlot++ }
  if (r.ingredientLines.length < 3) { warn(`${slug}: only ${r.ingredientLines.length} ingredient(s) — unusually sparse for a real recipe`); tooFewIngredients++ }
}
const stepCounts = new Map()
for (const file of recipeFiles) {
  const sql = stripComments(readFileSync(join(seedDir, file), 'utf8'))
  const stepRe = /\(\(select id from recipes where slug = '([\w-]+)'\), (\d+),/g
  let m
  while ((m = stepRe.exec(sql))) stepCounts.set(m[1], (stepCounts.get(m[1]) ?? 0) + 1)
}
for (const slug of recipes.keys()) {
  if (!stepCounts.has(slug)) { fail(`${slug}: no recipe_steps rows — nothing tells the user how to cook it`); noSteps++ }
}
if (noMealSlot === 0 && noSteps === 0) ok('every recipe has at least one meal slot and at least one instruction step')

// ---- cuisine diversity per family file ------------------------------------
for (const file of recipeFiles) {
  const familyRecipes = [...recipes.values()].filter((r) => r.file === file)
  const cuisines = new Set(familyRecipes.map((r) => r.cuisine))
  console.log(`  ${file.padEnd(34)} ${String(familyRecipes.length).padStart(3)} recipes, ${cuisines.size} cuisine(s): ${[...cuisines].join(', ')}`)
  if (cuisines.size < 2 && familyRecipes.length >= 4) {
    warn(`${file}: only ${cuisines.size} distinct cuisine(s) across ${familyRecipes.length} recipes — the family design is meant to span several`)
  }
}

// ---- corpus-wide summary ---------------------------------------------------
const allCuisines = new Map()
const slotCounts = new Map()
for (const r of recipes.values()) {
  allCuisines.set(r.cuisine, (allCuisines.get(r.cuisine) ?? 0) + 1)
  for (const slot of r.mealSlots) slotCounts.set(slot, (slotCounts.get(slot) ?? 0) + 1)
}
console.log(`\n${recipes.size} total recipes, ${allCuisines.size} distinct cuisines`)
console.log('meal slot coverage:', [...slotCounts.entries()].map(([s, n]) => `${s}=${n}`).join('  '))

console.log(`\n${'='.repeat(60)}`)
if (errors === 0) {
  console.log(`PASS${warnings ? ` (${warnings} warning(s))` : ''}`)
  process.exit(0)
} else {
  console.log(`FAILED — ${errors} error(s), ${warnings} warning(s)`)
  process.exit(1)
}
