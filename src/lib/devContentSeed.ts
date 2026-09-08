import { db } from '@/lib/db'
import { fromRow, pullContentTable } from '@/lib/sync'
import { isConfigured } from '@/lib/supabase'

/**
 * Two content domains, two different rules for where they can come from:
 *
 * - **Movement library** (patterns/exercises/edges/equipment/body regions/
 *   contraindications): small, fixed, unlicensed reference data — ~60
 *   exercises total. Bundled into EVERY build, dev and production alike,
 *   via a local-file seed, so intake is fully navigable (equipment step,
 *   body-region picker, placement tests) for a signed-out visitor who has
 *   no account yet. Once signed in, a real Supabase pull (RLS: content
 *   tables are `to authenticated`, see 0009_rls.sql) always replaces it —
 *   see claimLocalData.ts, the only place that happens mid-session.
 * - **Food/recipes** (the 200-recipe corpus + reference tables): real
 *   content requires an authenticated read, same as the movement library,
 *   but has NO local-file fallback in production — signed out there means
 *   empty, by design. This is the actual "content tables never ship in
 *   the app bundle" rule from docs/schema.md, which exists to avoid an app
 *   store review cycle to fix a recipe typo once this ships natively
 *   (there is no native build yet, and this corpus is orders of magnitude
 *   bigger than the movement library — not a case for the same exception).
 *   Dev mode gets the same local-file fallback the movement library does,
 *   signed out, purely for convenience working on food/meal features
 *   without a live project — never bundled into a production build:
 *   `ensureFoodAndRecipesSeeded`'s dynamic imports are gated behind
 *   `import.meta.env.DEV`, which Vite inlines as a literal `false` in
 *   production and dead-code-eliminates the whole branch out of the
 *   bundle, `import.meta.glob` included.
 *
 * The two content domains are seeded independently, each gated on its OWN
 * table being empty — not one shared gate on movementPatterns. An existing
 * dev install that already seeded the movement library before the food/
 * recipe tables existed would otherwise never pick up this seeding, since
 * movementPatterns.count() would already be > 0 and short-circuit the
 * whole function.
 */
export async function ensureContentSeeded(userId: string | null): Promise<void> {
  if (!import.meta.env.DEV) {
    if (isConfigured && userId) {
      if ((await db.movementPatterns.count()) === 0) await pullRealContent()
    } else {
      // Signed out (or no project configured at all): no real pull is
      // possible yet, but the movement library still ships in this build
      // (see the module comment above) so intake works end to end anyway.
      // Food/recipes stay empty here — no bundled fallback for those, by
      // design — Meals shows its own "not ready yet" state for that gap.
      await ensureMovementLibrarySeeded()
      if (!isConfigured) console.warn('[devContentSeed] No Supabase project configured — food/recipe content will stay empty until one exists.')
    }
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

  // Not always "no project configured" any more — this also runs, with a
  // real project present, for every signed-out visitor in production (see
  // ensureContentSeeded's module comment). Describes what it's doing, not
  // an assumed cause; each caller already logs its own more specific
  // reason (or nothing, when the bundled library is simply expected).
  console.info('[devContentSeed] Seeding the movement library from the local seed file.')

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
