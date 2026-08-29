import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseFoodReferenceSeed, type FoodReferenceSeedData } from './parseFoodReferenceSeed'
import { parseAllRecipeSeeds, type RecipeSeedData } from './parseRecipeSeed'

/**
 * TEST-ONLY file loader, the food/recipe equivalent of loadRealSeed.ts —
 * see that file's header for why the Node-specific `fs` part is kept
 * separate from the pure parsers. Used by generateMealPlan.integration.spec.ts
 * to run the real meal generator against the actual 200-recipe corpus.
 */

const seedDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'supabase', 'seed')

export interface RealFoodSeedData {
  foodReference: FoodReferenceSeedData
  recipes: RecipeSeedData
}

export function loadRealFoodSeed(): RealFoodSeedData {
  const foodReference = parseFoodReferenceSeed(readFileSync(join(seedDir, '002_food_reference.sql'), 'utf8'))

  const recipeFiles = readdirSync(seedDir)
    .filter((f) => /_recipes_.*\.sql$/.test(f))
    .sort()
  if (recipeFiles.length !== 14) {
    throw new Error(`loadRealFoodSeed: expected 14 recipe seed files, found ${recipeFiles.length} (${recipeFiles.join(', ')})`)
  }

  const knownIngredientSlugs = new Set(foodReference.ingredients.map((i) => i.slug))
  const recipes = parseAllRecipeSeeds(
    recipeFiles.map((f) => readFileSync(join(seedDir, f), 'utf8')),
    { unitIdBySlug: foodReference.unitIdBySlug, dietTagIdBySlug: foodReference.dietTagIdBySlug, knownIngredientSlugs },
  )

  return { foodReference, recipes }
}
