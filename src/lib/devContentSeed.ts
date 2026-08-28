import { db } from '@/lib/db'
import { isConfigured } from '@/lib/supabase'

/**
 * Temporary bridge until the real Supabase → Dexie content sync exists
 * (see TASKS.md: "Wire IntakeView → generator → Supabase write → Dexie
 * cache"). Without it, the intake flow's ladder-placement step and the
 * workout generator have no movement library to read from on a machine
 * that hasn't set up a Supabase project yet — which, per README.md, is
 * every fresh checkout of this repo.
 *
 * Dev-mode only, and never bundled into a production build: the seed SQL
 * is loaded via a DYNAMIC import gated behind `import.meta.env.DEV`, which
 * Vite inlines as a literal `false` in production and dead-code-eliminates
 * the whole branch — including the dynamic import — out of the bundle.
 * This is exactly the "content tables never ship in the app bundle" rule
 * from docs/schema.md; it doesn't get suspended just because the content
 * is arriving from a local file instead of Supabase during development.
 *
 * Replace this file's body with a real `supabase.from('exercises').select()`
 * sync (still writing into the same Dexie tables) once a project exists —
 * every caller here reads through db.ts either way, so nothing above this
 * module needs to change.
 */
export async function ensureContentSeeded(): Promise<void> {
  const existing = await db.movementPatterns.count()
  if (existing > 0) return

  if (isConfigured) {
    // TODO(TASKS.md): real Supabase → Dexie sync goes here. Until it's
    // built, a configured project with an empty local cache just has no
    // content client-side yet — loud in the console, not a silent gap.
    console.warn(
      '[devContentSeed] Supabase is configured but nothing has synced content into Dexie yet — ' +
        'that sync is not built (see TASKS.md). The movement library is empty.',
    )
    return
  }

  if (!import.meta.env.DEV) {
    console.warn('[devContentSeed] No Supabase project and this is a production build — the movement library is empty.')
    return
  }

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
