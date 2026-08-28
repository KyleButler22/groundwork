import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseMovementLibrarySeed, type MovementLibrarySeedData } from './parseMovementLibrarySeed'

/**
 * TEST-ONLY file loader for supabase/seed/001_movement_library.sql, used
 * by generatePlan.integration.spec.ts to run the real generator against
 * the real 60-exercise content instead of the synthetic unit-test
 * fixture. The actual parsing lives in parseMovementLibrarySeed.ts (pure,
 * no `fs`) so the same logic also runs in the browser for
 * src/lib/devContentSeed.ts — this file's only job is the Node-specific
 * part, reading the file off disk.
 */

const seedPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'supabase', 'seed', '001_movement_library.sql')

export type RealSeedData = MovementLibrarySeedData

export function loadRealSeed(): RealSeedData {
  return parseMovementLibrarySeed(readFileSync(seedPath, 'utf8'))
}
