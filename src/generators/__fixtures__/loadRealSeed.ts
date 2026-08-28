import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  BodyRegion,
  ContraindicationSeverity,
  Equipment,
  Exercise,
  ExerciseContraindication,
  ExerciseEquipment,
  MetricType,
  MovementPattern,
  PatternCategory,
  ProgressionEdge,
  ProgressionEdgeKind,
} from '@/types/domain'

/**
 * TEST-ONLY loader for supabase/seed/001_movement_library.sql, used by
 * generatePlan.integration.spec.ts to run the real generator against the
 * real 60-exercise content instead of the synthetic unit-test fixture.
 *
 * Not a general SQL parser (that already exists, twice over, in
 * scripts/verify-sql.mjs and scripts/verify-movement-graph.mjs — this
 * deliberately doesn't reuse them rather than reaching across the src/ ↔
 * scripts/ boundary for a one-off test convenience). These are targeted
 * per-table regexes matching the seed file's exact, stable column order.
 * If the seed file's format changes, this is expected to break loudly —
 * the assertSeedShape() call below exists specifically so that happens as
 * a clear failure here, not as a confusing generator test failure three
 * layers away.
 */

const seedPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'supabase', 'seed', '001_movement_library.sql')

function stripComments(sql: string): string {
  let out = ''
  let inStr = false
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]
    if (c === "'") {
      inStr = !inStr
      out += c
      continue
    }
    if (!inStr && c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      out += '\n'
      continue
    }
    out += c
  }
  return out
}

export interface RealSeedData {
  patterns: MovementPattern[]
  exercises: Exercise[]
  edges: ProgressionEdge[]
  equipment: Equipment[]
  bodyRegions: BodyRegion[]
  exerciseEquipment: ExerciseEquipment[]
  contraindications: ExerciseContraindication[]
}

export function loadRealSeed(): RealSeedData {
  const sql = stripComments(readFileSync(seedPath, 'utf8'))

  const patterns: MovementPattern[] = []
  const patternIdBySlug = new Map<string, number>()
  {
    const re = /\(\s*'([\w-]+)',\s*'[^']*',\s*'(\w+)',\s*(\d+)\s*\)/g
    const block = sql.slice(sql.indexOf('insert into movement_patterns'), sql.indexOf('insert into equipment'))
    let m: RegExpExecArray | null
    let id = 1
    while ((m = re.exec(block))) {
      const [, slug, category, sortOrder] = m
      patterns.push({ id, slug, name: slug, category: category as PatternCategory, sortOrder: Number(sortOrder) })
      patternIdBySlug.set(slug, id)
      id++
    }
  }

  const equipment: Equipment[] = []
  const equipmentIdBySlug = new Map<string, number>()
  {
    const block = sql.slice(sql.indexOf('insert into equipment'), sql.indexOf('insert into body_regions'))
    const re = /\(\s*'([\w-]+)',\s*'[^']*'\s*\)/g
    let m: RegExpExecArray | null
    let id = 1
    while ((m = re.exec(block))) {
      equipment.push({ id, slug: m[1], name: m[1] })
      equipmentIdBySlug.set(m[1], id)
      id++
    }
  }

  const bodyRegions: BodyRegion[] = []
  const regionIdBySlug = new Map<string, number>()
  {
    const block = sql.slice(sql.indexOf('insert into body_regions'), sql.indexOf('insert into exercises'))
    const re = /\(\s*'([\w-]+)',\s*'[^']*'\s*\)/g
    let m: RegExpExecArray | null
    let id = 1
    while ((m = re.exec(block))) {
      bodyRegions.push({ id, slug: m[1], name: m[1] })
      regionIdBySlug.set(m[1], id)
      id++
    }
  }

  // Exercises: three separate `insert into exercises` statements (reps,
  // hold, distance), processed in FILE ORDER so ids come out the same way
  // a real Postgres `serial` column would assign them.
  const exercises: Exercise[] = []
  const exerciseIdBySlug = new Map<string, number>()
  let nextExerciseId = 1

  const exerciseBlocks = [...sql.matchAll(/insert into exercises[\s\S]*?;/g)].map((m) => m[0])
  for (const block of exerciseBlocks) {
    // Column order varies per statement (reps/hold/distance each name
    // their range columns differently) — capture the two range columns
    // generically as "rangeA, rangeB" and place them by each ROW's own
    // metric_type below, rather than assuming one metric type per block.
    // Cues capture handles SQL's doubled-single-quote escape (don''t) —
    // `(?:[^']|'')*`, not `(?:[^'\\]|\\.)*` (backslash escaping, which this
    // SQL doesn't use). Getting this wrong doesn't just mis-capture the
    // cue text: it desyncs the regex mid-row, silently corrupting or
    // dropping that row and confusing the match position for whatever
    // comes after it. Caught via a real run against the seed file, not by
    // inspection — six rows in the file use this escape.
    const rowRe =
      /\(\s*'([\w-]+)',\s*'[^']*',\s*\(select id from movement_patterns where slug = '([\w-]+)'\),\s*([\d.]+),\s*'(reps|time_seconds|distance_m)',\s*([\d.]+),\s*([\d.]+),\s*(true|false),\s*'((?:[^']|'')*)'\s*\)/g
    let m: RegExpExecArray | null
    while ((m = rowRe.exec(block))) {
      const [, slug, patternSlug, level, mt, rangeA, rangeB, unilateral, cuesRaw] = m
      const cues = cuesRaw.replace(/''/g, "'")
      const patternId = patternIdBySlug.get(patternSlug)
      if (patternId === undefined) throw new Error(`loadRealSeed: exercise "${slug}" references unknown pattern "${patternSlug}"`)

      const id = nextExerciseId++
      exercises.push({
        id,
        slug,
        name: slug,
        patternId,
        level: Number(level),
        metricType: mt as MetricType,
        repMin: mt === 'reps' ? Number(rangeA) : null,
        repMax: mt === 'reps' ? Number(rangeB) : null,
        holdMinS: mt === 'time_seconds' ? Number(rangeA) : null,
        holdMaxS: mt === 'time_seconds' ? Number(rangeB) : null,
        distanceMinM: mt === 'distance_m' ? Number(rangeA) : null,
        distanceMaxM: mt === 'distance_m' ? Number(rangeB) : null,
        isUnilateral: unilateral === 'true',
        demoUrl: null,
        cues,
        isActive: true,
      })
      exerciseIdBySlug.set(slug, id)
    }
  }

  const edges: ProgressionEdge[] = []
  {
    const block = sql.slice(sql.indexOf('insert into progression_edges'), sql.indexOf('insert into exercise_equipment'))
    const re =
      /\(\(select id from exercises where slug = '([\w-]+)'\),\s*\(select id from exercises where slug = '([\w-]+)'\),\s*'(\w+)'\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(block))) {
      const [, fromSlug, toSlug, kind] = m
      const fromId = exerciseIdBySlug.get(fromSlug)
      const toId = exerciseIdBySlug.get(toSlug)
      if (fromId === undefined || toId === undefined) {
        throw new Error(`loadRealSeed: progression edge references unknown exercise slug (${fromSlug} -> ${toSlug})`)
      }
      edges.push({ fromExerciseId: fromId, toExerciseId: toId, kind: kind as ProgressionEdgeKind })
    }
  }

  const exerciseEquipment: ExerciseEquipment[] = []
  {
    const block = sql.slice(sql.indexOf('insert into exercise_equipment'), sql.indexOf('insert into exercise_contraindications'))
    const re =
      /\(\(select id from exercises where slug = '([\w-]+)'\),\s*\(select id from equipment where slug = '([\w-]+)'\),\s*(\d+)\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(block))) {
      const [, exSlug, eqSlug, group] = m
      const exerciseId = exerciseIdBySlug.get(exSlug)
      const equipmentId = equipmentIdBySlug.get(eqSlug)
      if (exerciseId === undefined || equipmentId === undefined) {
        throw new Error(`loadRealSeed: exercise_equipment references unknown slug (${exSlug}, ${eqSlug})`)
      }
      exerciseEquipment.push({ exerciseId, equipmentId, alternativeGroup: Number(group) })
    }
  }

  const contraindications: ExerciseContraindication[] = []
  {
    const block = sql.slice(sql.indexOf('insert into exercise_contraindications'))
    const re =
      /\(\(select id from exercises where slug = '([\w-]+)'\),\s*\(select id from body_regions where slug = '([\w-]+)'\),\s*'(avoid|caution)'\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(block))) {
      const [, exSlug, regionSlug, severity] = m
      const exerciseId = exerciseIdBySlug.get(exSlug)
      const regionId = regionIdBySlug.get(regionSlug)
      if (exerciseId === undefined || regionId === undefined) {
        throw new Error(`loadRealSeed: contraindication references unknown slug (${exSlug}, ${regionSlug})`)
      }
      contraindications.push({ exerciseId, regionId, severity: severity as ContraindicationSeverity })
    }
  }

  const data = { patterns, exercises, edges, equipment, bodyRegions, exerciseEquipment, contraindications }
  assertSeedShape(data)
  return data
}

/**
 * Fails loudly if this loader's parsing drifted from the seed file, using
 * the same known-good counts scripts/verify-movement-graph.mjs already
 * asserts against the SQL directly — two independent parsers (regex
 * shapes here are quite different from that script's) agreeing on the
 * same numbers is real evidence neither one is silently wrong.
 */
function assertSeedShape(data: RealSeedData): void {
  const problems: string[] = []
  if (data.patterns.length !== 8) problems.push(`expected 8 patterns, got ${data.patterns.length}`)
  if (data.exercises.length !== 60) problems.push(`expected 60 exercises, got ${data.exercises.length}`)
  if (data.edges.length !== 52) problems.push(`expected 52 progression edges, got ${data.edges.length}`)
  if (data.equipment.length !== 6) problems.push(`expected 6 equipment rows, got ${data.equipment.length}`)
  if (data.bodyRegions.length !== 6) problems.push(`expected 6 body regions, got ${data.bodyRegions.length}`)
  if (problems.length > 0) {
    throw new Error(
      `loadRealSeed: parsed shape does not match the known-good seed content (see scripts/verify-movement-graph.mjs) — ` +
        `either the seed file changed and this loader's regexes need updating, or a regex is broken. Problems: ${problems.join('; ')}`,
    )
  }
}
