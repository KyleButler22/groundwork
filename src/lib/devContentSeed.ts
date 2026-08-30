import { db } from '@/lib/db'
import { isConfigured } from '@/lib/supabase'

/**
 * Temporary bridge until the real Supabase → Dexie content sync exists
 * (see TASKS.md: "Wire IntakeView → generator → Supabase write → Dexie
 * cache"). Without it, the intake flow's ladder-placement step and both
 * generators have no content to read from on a machine that hasn't set up
 * a Supabase project yet — which, per README.md, is every fresh checkout
 * of this repo.
 *
 * Dev-mode only, and never bundled into a production build: every seed SQL
 * file is loaded via a DYNAMIC import gated behind `import.meta.env.DEV`,
 * which Vite inlines as a literal `false` in production and dead-code-
 * eliminates the whole branch — including the dynamic imports and the
 * `import.meta.glob` below — out of the bundle. This is exactly the
 * "content tables never ship in the app bundle" rule from docs/schema.md;
 * it doesn't get suspended just because the content is arriving from a
 * local file instead of Supabase during development.
 *
 * Replace this file's body with a real `supabase.from('exercises').select()`
 * sync (still writing into the same Dexie tables) once that sync exists —
 * every caller here reads through db.ts either way, so nothing above this
 * module needs to change.
 *
 * isConfigured only gates the *warning wording* below, never whether local
 * seeding happens in dev — a configured project doesn't itself populate
 * Dexie, only a real sync implementation would, and until that exists a
 * configured project's local cache needs this same fallback an
 * unconfigured one does. Only `import.meta.env.DEV` gates whether the
 * fallback runs at all, since that's the flag that controls whether the
 * seed SQL dynamic imports get dead-code-eliminated out of the bundle.
 *
 * The two content domains (movement library, food/recipes) are seeded
 * independently, each gated on its OWN table being empty — not one shared
 * gate on movementPatterns. An existing dev install that already seeded
 * the movement library before the food/recipe tables existed would
 * otherwise never pick up this seeding, since movementPatterns.count()
 * would already be > 0 and short-circuit the whole function.
 */
export async function ensureContentSeeded(): Promise<void> {
  if (!import.meta.env.DEV) {
    if (!isConfigured) {
      console.warn('[devContentSeed] No Supabase project and this is a production build — movement and food content is empty.')
    }
    // TODO(TASKS.md): real Supabase → Dexie sync goes here for production.
    return
  }

  if (isConfigured) {
    // TODO(TASKS.md): real Supabase → Dexie sync goes here. Until it's
    // built, fall through to the same local-seed-file path used when no
    // project is configured at all — see the isConfigured note above.
    console.warn(
      '[devContentSeed] Supabase is configured but the real sync is not built yet (see TASKS.md) — ' +
        'falling back to local seed files for dev content in the meantime, same as an unconfigured project.',
    )
  }

  await Promise.all([ensureMovementLibrarySeeded(), ensureFoodAndRecipesSeeded()])
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
