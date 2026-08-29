import type { Aisle, Allergen, DietTag, Ingredient, IngredientAllergen, IngredientUnit, Unit, UnitDimension } from '@/types/domain'

import { bool, num, parseInsertRows, slugFromRef, stripComments, unquote } from './sqlParse'

/**
 * Pure string -> data parser for supabase/seed/002_food_reference.sql's
 * format. Used the same way parseMovementLibrarySeed.ts is used: by
 * loadRealFoodSeed.ts (test-only, reads the file with `readFileSync`) and
 * by src/lib/devContentSeed.ts (browser, dev-mode only, via Vite's `?raw`
 * import) — same text, same parser, so the integration test actually
 * exercises what dev-mode seeding runs.
 *
 * Ingredient/recipe ids are the row's own slug (see Ingredient.id's own
 * comment in domain.ts) — so a foreign key expressed in the seed as
 * `(select id from ingredients where slug = 'x')` resolves to the literal
 * string `'x'` with no lookup table needed. Aisle/unit/allergen/diet-tag
 * ids are still sequential integers assigned in insertion order, same
 * convention as movement_patterns/equipment in the movement-library
 * parser, since those really are Postgres smallserial columns.
 */

export interface FoodReferenceSeedData {
  aisles: Aisle[]
  units: Unit[]
  ingredients: Ingredient[]
  ingredientUnits: IngredientUnit[]
  allergens: Allergen[]
  ingredientAllergens: IngredientAllergen[]
  dietTags: DietTag[]
  /** Exposed so parseRecipeSeed.ts can resolve the recipe files' own
   *  `(select id from units where slug = ...)` / `... diet_tags ...`
   *  references without re-parsing this file. */
  unitIdBySlug: Map<string, number>
  dietTagIdBySlug: Map<string, number>
}

export function parseFoodReferenceSeed(rawSql: string): FoodReferenceSeedData {
  const sql = stripComments(rawSql)

  const aisleIdBySlug = new Map<string, number>()
  const aisles: Aisle[] = parseInsertRows(sql, 'aisles').map((row, i) => {
    const slug = unquote(row.slug)!
    aisleIdBySlug.set(slug, i + 1)
    return { id: i + 1, slug, name: unquote(row.name)!, sortOrder: num(row.sort_order)! }
  })

  const unitIdBySlug = new Map<string, number>()
  const units: Unit[] = parseInsertRows(sql, 'units').map((row, i) => {
    const slug = unquote(row.slug)!
    unitIdBySlug.set(slug, i + 1)
    return { id: i + 1, slug, name: unquote(row.name)!, dimension: unquote(row.dimension) as UnitDimension, baseFactor: num(row.base_factor)! }
  })

  const allergenIdBySlug = new Map<string, number>()
  const allergens: Allergen[] = parseInsertRows(sql, 'allergens').map((row, i) => {
    const slug = unquote(row.slug)!
    allergenIdBySlug.set(slug, i + 1)
    return { id: i + 1, slug, name: unquote(row.name)! }
  })

  const dietTagIdBySlug = new Map<string, number>()
  const dietTags: DietTag[] = parseInsertRows(sql, 'diet_tags').map((row, i) => {
    const slug = unquote(row.slug)!
    dietTagIdBySlug.set(slug, i + 1)
    return { id: i + 1, slug, name: unquote(row.name)! }
  })

  const ingredientSlugs = new Set<string>()
  const ingredients: Ingredient[] = parseInsertRows(sql, 'ingredients').map((row) => {
    const slug = unquote(row.slug)!
    if (ingredientSlugs.has(slug)) throw new Error(`parseFoodReferenceSeed: duplicate ingredient slug "${slug}"`)
    ingredientSlugs.add(slug)

    const aisleSlug = slugFromRef(row.aisle_id)
    const aisleId = aisleSlug ? aisleIdBySlug.get(aisleSlug) : undefined
    if (aisleId === undefined) throw new Error(`parseFoodReferenceSeed: ingredient "${slug}" references unknown aisle "${aisleSlug}"`)

    return {
      id: slug,
      slug,
      name: unquote(row.name)!,
      aisleId,
      densityGPerMl: row.density_g_per_ml !== undefined ? num(row.density_g_per_ml) : null,
      gramsPerEach: row.grams_per_each !== undefined ? num(row.grams_per_each) : null,
      kcalPer100g: num(row.kcal_per_100g)!,
      proteinPer100g: num(row.protein_per_100g)!,
      carbPer100g: num(row.carb_per_100g)!,
      fatPer100g: num(row.fat_per_100g)!,
      fiberPer100g: row.fiber_per_100g !== undefined ? num(row.fiber_per_100g) : null,
      fdcId: row.fdc_id !== undefined ? num(row.fdc_id) : null,
      // Both default `false`/`true` in the real migration (0005_food_
      // reference.sql) when the column is absent from a statement's
      // header — every block in the current seed always states
      // is_pantry_staple explicitly, but is_active never appears at all.
      isPantryStaple: row.is_pantry_staple !== undefined ? bool(row.is_pantry_staple) : false,
      isActive: row.is_active !== undefined ? bool(row.is_active) : true,
    }
  })

  const ingredientUnits: IngredientUnit[] = parseInsertRows(sql, 'ingredient_units').map((row) => {
    const ingredientSlug = slugFromRef(row.ingredient_id)
    const unitSlug = slugFromRef(row.unit_id)
    const unitId = unitSlug ? unitIdBySlug.get(unitSlug) : undefined
    if (!ingredientSlug || !ingredientSlugs.has(ingredientSlug) || unitId === undefined) {
      throw new Error(`parseFoodReferenceSeed: ingredient_units row references unknown ingredient/unit (${ingredientSlug}, ${unitSlug})`)
    }
    return { ingredientId: ingredientSlug, unitId, grams: num(row.grams)! }
  })

  const ingredientAllergens: IngredientAllergen[] = parseInsertRows(sql, 'ingredient_allergens').map((row) => {
    const ingredientSlug = slugFromRef(row.ingredient_id)
    const allergenSlug = slugFromRef(row.allergen_id)
    const allergenId = allergenSlug ? allergenIdBySlug.get(allergenSlug) : undefined
    if (!ingredientSlug || !ingredientSlugs.has(ingredientSlug) || allergenId === undefined) {
      throw new Error(`parseFoodReferenceSeed: ingredient_allergens row references unknown ingredient/allergen (${ingredientSlug}, ${allergenSlug})`)
    }
    return { ingredientId: ingredientSlug, allergenId }
  })

  const data = { aisles, units, ingredients, ingredientUnits, allergens, ingredientAllergens, dietTags, unitIdBySlug, dietTagIdBySlug }
  assertSeedShape(data)
  return data
}

/** Same purpose as parseMovementLibrarySeed's assertSeedShape: fails
 *  loudly if this parser drifted from the real file, using the same
 *  known-good counts scripts/verify-food-reference.mjs already asserts
 *  against the SQL directly with a differently-shaped parser. */
function assertSeedShape(data: FoodReferenceSeedData): void {
  const problems: string[] = []
  if (data.aisles.length !== 11) problems.push(`expected 11 aisles, got ${data.aisles.length}`)
  if (data.units.length !== 14) problems.push(`expected 14 units, got ${data.units.length}`)
  if (data.allergens.length !== 9) problems.push(`expected 9 allergens, got ${data.allergens.length}`)
  if (data.dietTags.length !== 8) problems.push(`expected 8 diet tags, got ${data.dietTags.length}`)
  if (data.ingredients.length !== 150) problems.push(`expected 150 ingredients, got ${data.ingredients.length}`)
  if (problems.length > 0) {
    throw new Error(
      `parseFoodReferenceSeed: parsed shape does not match the known-good seed content (see scripts/verify-food-reference.mjs) — ` +
        `either 002_food_reference.sql changed and this parser needs updating, or a regex/column assumption is broken. Problems: ${problems.join('; ')}`,
    )
  }
}
