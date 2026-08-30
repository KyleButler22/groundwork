import { db } from '@/lib/db'
import { fromRow, pullContentTable } from '@/lib/sync'
import { isConfigured } from '@/lib/supabase'

/**
 * Two content sources, chosen per caller: real Supabase content (once
 * signed in — content tables are `to authenticated` per RLS, see
 * 0009_rls.sql, so an unauthenticated read can never work regardless of
 * whether a project is configured) or the local seed files (dev only,
 * signed out, or no project configured at all).
 *
 * Local-file loading is dev-mode only, and never bundled into a
 * production build: every seed SQL file is loaded via a DYNAMIC import
 * gated behind `import.meta.env.DEV`, which Vite inlines as a literal
 * `false` in production and dead-code-eliminates the whole branch —
 * including the dynamic imports and the `import.meta.glob` below — out of
 * the bundle. This is exactly the "content tables never ship in the app
 * bundle" rule from docs/schema.md; it doesn't get suspended just because
 * the content is arriving from a local file instead of Supabase.
 *
 * The two content domains (movement library, food/recipes) are seeded
 * independently, each gated on its OWN table being empty — not one shared
 * gate on movementPatterns. An existing dev install that already seeded
 * the movement library before the food/recipe tables existed would
 * otherwise never pick up this seeding, since movementPatterns.count()
 * would already be > 0 and short-circuit the whole function.
 */
export async function ensureContentSeeded(userId: string | null): Promise<void> {
  if (!import.meta.env.DEV) {
    if (isConfigured && userId) {
      if ((await db.movementPatterns.count()) === 0) await pullRealContent()
    } else if (!isConfigured) {
      console.warn('[devContentSeed] No Supabase project and this is a production build — movement and food content is empty.')
    }
    // A production build with a configured project but nobody signed in
    // yet has no content until they do — there's no local-file fallback
    // to fall through to here, by design (see the module comment above).
    return
  }

  if (isConfigured && userId) {
    if ((await db.movementPatterns.count()) === 0) await pullRealContent()
    return
  }

  if (isConfigured && !userId) {
    console.warn(
      '[devContentSeed] Supabase is configured but nobody is signed in yet — using local seed files for dev content ' +
        '(real content requires an authenticated read, per RLS). Signing in will pull the real thing.',
    )
  }

  await Promise.all([ensureMovementLibrarySeeded(), ensureFoodAndRecipesSeeded()])
}

/** Postgres table name -> the Dexie table it lands in. Order doesn't
 *  matter for the write (IndexedDB has no FK enforcement to satisfy,
 *  unlike Postgres), only for readability here. */
const CONTENT_TABLES = [
  ['movement_patterns', 'movementPatterns'],
  ['exercises', 'exercises'],
  ['progression_edges', 'progressionEdges'],
  ['equipment', 'equipment'],
  ['exercise_equipment', 'exerciseEquipment'],
  ['body_regions', 'bodyRegions'],
  ['exercise_contraindications', 'exerciseContraindications'],
  ['aisles', 'aisles'],
  ['units', 'units'],
  ['ingredients', 'ingredients'],
  ['ingredient_units', 'ingredientUnits'],
  ['allergens', 'allergens'],
  ['ingredient_allergens', 'ingredientAllergens'],
  ['diet_tags', 'dietTags'],
  ['recipes', 'recipes'],
  ['recipe_ingredients', 'recipeIngredients'],
  ['recipe_steps', 'recipeSteps'],
  ['recipe_meal_slots', 'recipeMealSlots'],
  ['recipe_diet_tags', 'recipeDietTags'],
] as const satisfies readonly [string, keyof typeof db][]

/**
 * Pulls every content table from Supabase and replaces Dexie's copy
 * wholesale (clear + bulkAdd, not bulkPut on top of whatever's already
 * there) — the safe way to handle ingredients/recipes specifically, whose
 * real `id` is a server-assigned UUID with no relationship at all to the
 * slug-as-id scheme the local-file fallback uses (see Ingredient's own
 * doc comment in types/domain.ts). A table whose pull fails is left
 * untouched rather than cleared-then-empty — exported (not gated behind
 * the usual "only if empty" check) so claimLocalData.ts can force a real
 * pull at the exact moment someone first signs in, even though Dexie
 * already has (stale, local-file) content from before that point.
 */
export async function pullRealContent(): Promise<void> {
  const pulls = await Promise.all(CONTENT_TABLES.map(([pgTable]) => pullContentTable(pgTable)))

  for (let i = 0; i < CONTENT_TABLES.length; i++) {
    const [pgTable, dexieTable] = CONTENT_TABLES[i]
    const rows = pulls[i]
    if (rows === null) {
      console.warn(`[devContentSeed] Failed to pull ${pgTable} from Supabase — leaving Dexie's existing ${dexieTable} untouched.`)
      continue
    }
    // Each table's clear+bulkAdd is isolated in its own try/catch —
    // without this, a bad row (a shape mismatch, an unexpected null)
    // throwing from ONE table's bulkAdd would propagate straight out of
    // this whole function: every table already `.clear()`'d stays
    // correctly repopulated, but the throw would also abort the loop
    // entirely, silently skipping every table still queued after it
    // (which, for a table that failed early in CONTENT_TABLES' order,
    // could mean the whole rest of the pull never even attempted). Found
    // by exactly this happening live: exercises came back cleared-but-
    // empty and nothing after it in the array ever ran.
    try {
      const table = db[dexieTable] as unknown as { clear: () => Promise<void>; bulkAdd: (rows: unknown[]) => Promise<unknown> }
      await table.clear()
      await table.bulkAdd(rows.map((r) => fromRow(r)))
    } catch (err) {
      console.error(`[devContentSeed] Failed to write ${pgTable} into Dexie's ${dexieTable} — that table may now be empty. Cause:`, err)
    }
  }
}

async function ensureMovementLibrarySeeded(): Promise<void> {
  const existing = await db.movementPatterns.count()
  if (existing > 0) return

  console.info('[devContentSeed] No Supabase project configured — seeding the movement library from the local seed file (dev only).')

  const { parseMovementLibrarySeed } = await import('@/generators/__fixtures__/parseMovementLibrarySeed')
  // Deliberately outside src/ — this is the actual seed file, not a copy.
  const seedSqlModule = await import('../../supabase/seed/001_movement_library.sql?raw')
  const seed = parseMovementLibrarySeed(seedSqlModule.default)

  await db.transaction(
    'rw',
    [db.movementPatterns, db.exercises, db.progressionEdges, db.equipment, db.exerciseEquipment, db.bodyRegions, db.exerciseContraindications],
    async () => {
      await db.movementPatterns.bulkAdd(seed.patterns)
      await db.exercises.bulkAdd(seed.exercises)
      await db.progressionEdges.bulkAdd(seed.edges)
      await db.equipment.bulkAdd(seed.equipment)
      await db.exerciseEquipment.bulkAdd(seed.exerciseEquipment)
      await db.bodyRegions.bulkAdd(seed.bodyRegions)
      await db.exerciseContraindications.bulkAdd(seed.contraindications)
    },
  )
}

async function ensureFoodAndRecipesSeeded(): Promise<void> {
  const existing = await db.recipes.count()
  if (existing > 0) return

  console.info('[devContentSeed] No Supabase project configured — seeding food reference + recipes from the local seed files (dev only).')

  const { parseFoodReferenceSeed } = await import('@/generators/__fixtures__/parseFoodReferenceSeed')
  const { parseAllRecipeSeeds } = await import('@/generators/__fixtures__/parseRecipeSeed')

  const foodReferenceSqlModule = await import('../../supabase/seed/002_food_reference.sql?raw')
  const foodReference = parseFoodReferenceSeed(foodReferenceSqlModule.default)

  // Non-eager glob: Vite generates a map of path -> dynamic import()
  // closures, none of which are actually CALLED until here — same
  // "?raw import behind import.meta.env.DEV" tree-shaking property as
  // the single-file imports above, just for a directory of 14 files
  // whose exact names shouldn't need to be hardcoded and kept in sync.
  const recipeSeedLoaders = import.meta.glob('../../supabase/seed/*_recipes_*.sql', { query: '?raw', import: 'default' }) as Record<
    string,
    () => Promise<string>
  >
  const recipeSqlTexts = await Promise.all(Object.values(recipeSeedLoaders).map((load) => load()))

  const knownIngredientSlugs = new Set(foodReference.ingredients.map((i) => i.slug))
  const recipeSeed = parseAllRecipeSeeds(recipeSqlTexts, {
    unitIdBySlug: foodReference.unitIdBySlug,
    dietTagIdBySlug: foodReference.dietTagIdBySlug,
    knownIngredientSlugs,
  })

  await db.transaction(
    'rw',
    [
      db.aisles,
      db.units,
      db.allergens,
      db.dietTags,
      db.ingredients,
      db.ingredientUnits,
      db.ingredientAllergens,
      db.recipes,
      db.recipeIngredients,
      db.recipeSteps,
      db.recipeMealSlots,
      db.recipeDietTags,
    ],
    async () => {
      await db.aisles.bulkAdd(foodReference.aisles)
      await db.units.bulkAdd(foodReference.units)
      await db.allergens.bulkAdd(foodReference.allergens)
      await db.dietTags.bulkAdd(foodReference.dietTags)
      await db.ingredients.bulkAdd(foodReference.ingredients)
      await db.ingredientUnits.bulkAdd(foodReference.ingredientUnits)
      await db.ingredientAllergens.bulkAdd(foodReference.ingredientAllergens)
      await db.recipes.bulkAdd(recipeSeed.recipes)
      await db.recipeIngredients.bulkAdd(recipeSeed.recipeIngredients)
      await db.recipeSteps.bulkAdd(recipeSeed.recipeSteps)
      await db.recipeMealSlots.bulkAdd(recipeSeed.recipeMealSlots)
      await db.recipeDietTags.bulkAdd(recipeSeed.recipeDietTags)
    },
  )
}
