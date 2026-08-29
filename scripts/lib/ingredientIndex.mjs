import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripComments, parseInsertRows, unquote, num } from './sqlParse.mjs'

/**
 * Parses supabase/seed/002_food_reference.sql into a lookup structure the
 * recipe generator uses to resolve "2 tbsp olive oil" to grams and to
 * real macros. This is the SAME source file the actual database seeds
 * from — the generator computes from the real ingredient data, not a
 * second, hand-maintained copy of it.
 */
export function buildIngredientIndex(repoRoot) {
  const sql = stripComments(readFileSync(join(repoRoot, 'supabase', 'seed', '002_food_reference.sql'), 'utf8'))

  const units = new Map() // slug -> { dimension, baseFactor }
  for (const row of parseInsertRows(sql, 'units')) {
    units.set(unquote(row.slug), { dimension: unquote(row.dimension), baseFactor: num(row.base_factor) })
  }

  const ingredients = new Map() // slug -> { name, kcal, protein, carb, fat, fiber, densityGPerMl, gramsPerEach, isPantryStaple, aisleSlug placeholder }
  for (const row of parseInsertRows(sql, 'ingredients')) {
    const slug = unquote(row.slug)
    ingredients.set(slug, {
      name: unquote(row.name),
      kcal: num(row.kcal_per_100g),
      protein: num(row.protein_per_100g),
      carb: num(row.carb_per_100g),
      fat: num(row.fat_per_100g),
      fiber: num(row.fiber_per_100g),
      densityGPerMl: row.density_g_per_ml !== undefined ? num(row.density_g_per_ml) : null,
      gramsPerEach: row.grams_per_each !== undefined ? num(row.grams_per_each) : null,
      isPantryStaple: unquote(row.is_pantry_staple) === 'true',
    })
  }

  // ingredient_units overrides: (ingredient slug, unit slug) -> grams.
  // Parsed directly via regex rather than parseInsertRows, since every
  // value here is itself a `(select id from ... where slug = 'x')`
  // subquery, not a plain literal — same shape used throughout the seed.
  const unitOverrides = new Map() // `${ingredientSlug}::${unitSlug}` -> grams
  const overrideRe =
    /\(\(select id from ingredients where slug\s*=\s*'([\w-]+)'\),\s*\(select id from units where slug\s*=\s*'([\w-]+)'\),\s*([\d.]+)\)/g
  let m
  while ((m = overrideRe.exec(sql))) {
    unitOverrides.set(`${m[1]}::${m[2]}`, Number(m[3]))
  }

  return { units, ingredients, unitOverrides }
}

/**
 * Resolves a recipe line (ingredient slug + quantity + unit slug) to
 * grams, in the same priority order docs/mealgen.md specifies for
 * grocery aggregation: "resolve to grams via ingredient_units, falling
 * back to density" — plus grams_per_each for count units with no
 * explicit override, and unit dimension math for anything else.
 */
export function resolveGrams(index, ingredientSlug, quantity, unitSlug) {
  const ingredient = index.ingredients.get(ingredientSlug)
  if (!ingredient) throw new Error(`unknown ingredient slug: ${ingredientSlug}`)
  const unit = index.units.get(unitSlug)
  if (!unit) throw new Error(`unknown unit slug: ${unitSlug}`)

  const override = index.unitOverrides.get(`${ingredientSlug}::${unitSlug}`)
  if (override !== undefined) return quantity * override

  if (unit.dimension === 'mass') return quantity * unit.baseFactor

  if (unit.dimension === 'volume') {
    if (ingredient.densityGPerMl === null) {
      throw new Error(`${ingredientSlug}: used in a volume unit (${unitSlug}) but has no density_g_per_ml and no ingredient_units override`)
    }
    return quantity * unit.baseFactor * ingredient.densityGPerMl
  }

  // count
  if (ingredient.gramsPerEach === null) {
    throw new Error(`${ingredientSlug}: used in a count unit (${unitSlug}) but has no grams_per_each and no ingredient_units override`)
  }
  return quantity * ingredient.gramsPerEach
}

/** Computes total macros (grams) for a list of {slug, qty, unit} recipe
 *  lines, resolving each to grams first. `optional` lines are excluded —
 *  matching how docs/mealgen.md's grocery aggregation and any reasonable
 *  macro estimate should treat "garnish, optional" ingredients. */
export function computeRecipeTotals(index, ingredientLines) {
  const totals = { kcal: 0, protein: 0, carb: 0, fat: 0 }
  for (const line of ingredientLines) {
    if (line.optional) continue
    const grams = resolveGrams(index, line.slug, line.qty, line.unit)
    const ing = index.ingredients.get(line.slug)
    totals.kcal += (grams * ing.kcal) / 100
    totals.protein += (grams * ing.protein) / 100
    totals.carb += (grams * ing.carb) / 100
    totals.fat += (grams * ing.fat) / 100
  }
  return totals
}
