/**
 * Diet tags and allergens for step 7. Unlike equipment and body regions
 * (already real content, seeded via supabase/seed/001_movement_library.sql
 * and loaded into Dexie by devContentSeed.ts), NOTHING seeds `diet_tags`
 * or `allergens` yet — those tables exist in the schema (0006_recipes.sql)
 * but are empty until the recipe-corpus work seeds them for real.
 *
 * This is a placeholder reference list so step 7 is usable and testable
 * today: slugs here are chosen to be the ones a real seed would plausibly
 * use, so `user_diet_tags`/`user_allergens` can be re-pointed at real ids
 * later by slug match rather than needing this step's UI rebuilt. Until
 * that seed exists, the raw slugs still land safely in
 * `intake_responses.answers` (JSONB, no foreign key) — only the
 * projection into the typed per-user tables is deferred, same as several
 * other pieces of the Supabase write path (see TASKS.md).
 */

export interface ReferenceOption {
  slug: string
  label: string
}

export const DIET_TAGS: ReferenceOption[] = [
  { slug: 'omnivore', label: 'No restrictions' },
  { slug: 'vegetarian', label: 'Vegetarian' },
  { slug: 'vegan', label: 'Vegan' },
  { slug: 'pescatarian', label: 'Pescatarian' },
  { slug: 'gluten_free', label: 'Gluten-free' },
  { slug: 'dairy_free', label: 'Dairy-free' },
  { slug: 'low_carb', label: 'Low-carb' },
  { slug: 'paleo', label: 'Paleo' },
]

/** The 9 major allergens recognised by the US FDA (FASTER Act) — a
 *  stable, widely-used reference list, not something needing the same
 *  editorial vetting as recipe content. */
export const ALLERGENS: ReferenceOption[] = [
  { slug: 'milk', label: 'Milk' },
  { slug: 'eggs', label: 'Eggs' },
  { slug: 'fish', label: 'Fish' },
  { slug: 'shellfish', label: 'Shellfish' },
  { slug: 'tree_nuts', label: 'Tree nuts' },
  { slug: 'peanuts', label: 'Peanuts' },
  { slug: 'wheat', label: 'Wheat' },
  { slug: 'soy', label: 'Soy' },
  { slug: 'sesame', label: 'Sesame' },
]
