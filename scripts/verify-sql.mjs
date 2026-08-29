#!/usr/bin/env node
// Static checker for supabase/migrations + supabase/seed.
// There is no local Postgres in this environment to run these against, so
// this substitutes for `psql -f` by parsing structure instead of executing
// it: every `references table` resolves to a table defined earlier, every
// `check (col in (...))` literal used at insert time is in the allowed set,
// every table gets RLS enabled, and every slug looked up by a subquery in
// the seed file was actually inserted earlier in the same file.
//
// It is a linter, not a database — it cannot catch a real type mismatch or
// a constraint interaction. Run this after any migration/seed edit; run the
// real thing (`supabase db reset`) once a Supabase project exists.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]):/, '$1:')
const migrationsDir = join(root, 'supabase', 'migrations')
const seedDir = join(root, 'supabase', 'seed')

let errors = 0
const fail = (msg) => {
  console.error('FAIL  ' + msg)
  errors++
}
const ok = (msg) => console.log('ok    ' + msg)

// Quote-aware `-- comment` stripper. A naive `sql.replace(/--.*/g, '')` is
// unsafe in general (a string literal could contain "--"), so this scans
// char-by-char and only treats `--` as a comment starter outside quotes.
// Verified no seed content actually contains "--" inside a literal before
// relying on this (see scripts/verify-sql.mjs usage site).
function stripLineComments(sql) {
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

function loadSqlFiles(dir) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ file: f, sql: readFileSync(join(dir, f), 'utf8') }))
}

const migrations = loadSqlFiles(migrationsDir)
const fullSql = migrations.map((m) => m.sql).join('\n')

// ---- 1. balanced parens per file --------------------------------------
for (const { file, sql } of migrations) {
  const open = (sql.match(/\(/g) || []).length
  const close = (sql.match(/\)/g) || []).length
  if (open !== close) fail(`${file}: unbalanced parens (${open} open, ${close} close)`)
}
ok('parens balanced in every migration file')

// ---- 2. collect table definitions + their columns ----------------------
const tables = new Map() // name -> { columns: Set, checks: [{col, values}] }
const tableDefRe = /create table (\w+)\s*\(([\s\S]*?)\n\);/g
let m
for (const t of migrations) {
  tableDefRe.lastIndex = 0
  while ((m = tableDefRe.exec(t.sql))) {
    const [, name, body] = m
    const columns = new Set()
    for (const line of body.split('\n')) {
      const colMatch = line.trim().match(/^(\w+)\s+[a-zA-Z]/)
      if (colMatch && !['primary', 'unique', 'check', 'foreign'].includes(colMatch[1])) {
        columns.add(colMatch[1])
      }
    }
    // check (col in ('a','b',...))
    const checks = []
    const checkRe = /check\s*\(\s*(\w+)\s+in\s*\(([^)]+)\)\)/g
    let cm
    while ((cm = checkRe.exec(body))) {
      const values = cm[2].split(',').map((v) => v.trim().replace(/^'|'$/g, ''))
      checks.push({ col: cm[1], values })
    }
    tables.set(name, { columns, checks, file: t.file })
  }
}
console.log(`\nparsed ${tables.size} table definitions across ${migrations.length} files`)

// ---- 3. every `references X` points at a table that exists -------------
const refRe = /references\s+([\w.]+)/g
for (const { file, sql } of migrations) {
  refRe.lastIndex = 0
  while ((m = refRe.exec(sql))) {
    const target = m[1]
    if (target === 'auth.users') continue // Supabase-managed, not ours to define
    if (!tables.has(target)) fail(`${file}: references undefined table "${target}"`)
  }
}
ok('every "references" target resolves to a defined table (or auth.users)')

// ---- 4. every table that isn't a pure join-of-content has RLS enabled --
const rlsEnabled = new Set()
const rlsRe = /alter table (\w+) enable row level security/g
rlsRe.lastIndex = 0
while ((m = rlsRe.exec(fullSql))) rlsEnabled.add(m[1])
const missingRls = [...tables.keys()].filter((t) => !rlsEnabled.has(t))
if (missingRls.length) fail(`tables with no RLS policy at all: ${missingRls.join(', ')}`)
else ok(`RLS enabled on all ${tables.size} tables`)

// ---- 5. every policy's table has at least one policy defined -----------
const policyTables = new Set()
const policyRe = /create policy \w+ on (\w+)/g
policyRe.lastIndex = 0
while ((m = policyRe.exec(fullSql))) policyTables.add(m[1])
const rlsButNoPolicy = [...rlsEnabled].filter((t) => !policyTables.has(t))
if (rlsButNoPolicy.length)
  fail(`RLS enabled but zero policies defined (locks out even the owner!): ${rlsButNoPolicy.join(', ')}`)
else ok('every RLS-enabled table has at least one policy')

console.log(`\n${migrations.length} migration files, ${errors} error(s) so far.\n`)

// ---- 6. seed file checks: slug lookups must resolve within the file ----
let seedFiles = []
try {
  seedFiles = loadSqlFiles(seedDir)
} catch {
  console.log('(no supabase/seed directory yet — skipping seed checks)')
}

// Slug lookups resolve GLOBALLY across all seed files, not just within
// the file doing the looking-up — 001_movement_library.sql is
// self-contained, but every recipe file references ingredients defined
// in 002_food_reference.sql, and that cross-file reference is the whole
// point of factoring ingredients out once. Pass 1 builds one registry of
// every slug inserted anywhere; pass 2 checks every file's lookups
// against it. (An earlier per-file-only version of this check flagged
// every recipe file's ingredient references as "missing" — a bug in the
// checker, not the recipes; content that legitimately spans files needs
// a global registry, not a per-file one.)
const strippedByFile = new Map() // file -> comment-stripped sql
const insertedSlugs = new Map() // table -> Set<slug>, global across all files

for (const { file, sql: rawSql } of seedFiles) {
  const open = (rawSql.match(/\(/g) || []).length
  const close = (rawSql.match(/\)/g) || []).length
  if (open !== close) fail(`${file}: unbalanced parens (${open} open, ${close} close)`)

  // Comments can contain parenthetical asides ("(9 rungs)") that don't
  // affect the file's overall paren balance but do break naive row
  // splitting on `),\s*(` boundaries. Strip them before any structural
  // parsing below; the raw text is still what was checked above.
  const sql = stripLineComments(rawSql)
  strippedByFile.set(file, sql)

  const insertRe = /insert into (\w+)\s*\(([^)]*)\)\s*values\s*([\s\S]*?);/g
  let im
  while ((im = insertRe.exec(sql))) {
    const [, table, colsRaw, valuesBlock] = im
    const cols = colsRaw.split(',').map((c) => c.trim())
    const slugIdx = cols.indexOf('slug')
    if (slugIdx === -1) continue
    if (!insertedSlugs.has(table)) insertedSlugs.set(table, new Set())
    const rows = splitTopLevelRows(valuesBlock)
    for (const row of rows) {
      const cells = splitSqlRow(row)
      const rawSlug = cells[slugIdx]
      if (rawSlug) {
        const slug = rawSlug.trim().replace(/^'|'$/g, '')
        insertedSlugs.get(table).add(slug)
      }
    }
  }
}

for (const { file } of seedFiles) {
  const sql = strippedByFile.get(file)

  // Every `(select id from TABLE where slug = 'X')` must reference a slug
  // that was actually inserted into TABLE in SOME seed file.
  const lookupRe = /select id from (\w+) where slug\s*=\s*'([^']+)'/g
  let lm
  let lookups = 0
  const missingLookups = []
  while ((lm = lookupRe.exec(sql))) {
    lookups++
    const [, table, slug] = lm
    const set = insertedSlugs.get(table)
    if (!set || !set.has(slug)) missingLookups.push(`${table}.${slug}`)
  }
  if (missingLookups.length) {
    fail(`${file}: ${missingLookups.length} slug lookup(s) with no matching insert anywhere: ${missingLookups.slice(0, 10).join(', ')}${missingLookups.length > 10 ? '…' : ''}`)
  } else {
    ok(`${file}: all ${lookups} slug subquery lookups resolve to an insert somewhere in supabase/seed/`)
  }

  // Check-constraint conformance for a few high-value columns.
  checkColumnValues(file, sql, 'exercises', 'metric_type', tables.get('exercises'))
  checkColumnValues(file, sql, 'progression_edges', 'kind', tables.get('progression_edges'))
  checkColumnValues(file, sql, 'exercise_contraindications', 'severity', tables.get('exercise_contraindications'))
  checkColumnValues(file, sql, 'movement_patterns', 'category', tables.get('movement_patterns'))
  // Note: 'difficulty' uses `check (... between 1 and 3)`, which the
  // `check (... in (...))` regex above doesn't capture — nothing to
  // check here without teaching the table parser a second constraint
  // shape, which isn't worth it for one column already range-enforced
  // by Postgres itself once a real database exists.
  checkColumnValues(file, sql, 'recipe_meal_slots', 'slot', tables.get('recipe_meal_slots'))
}

// Splits a `VALUES (...), (...), (...)` block into its top-level row
// strings (outer parens stripped), tracking paren depth and quote state so
// a row containing nested `(select ...)` subqueries is never mistaken for
// a row boundary. A flat `),\s*(` regex gets this wrong — it also matches
// the comma BETWEEN two subqueries inside one row — which silently
// produced zero valid rows for progression_edges/exercise_equipment/
// exercise_contraindications and made their check-constraint verification
// vacuous. Do not reintroduce the regex version.
function splitTopLevelRows(block) {
  const rows = []
  let depth = 0
  let inStr = false
  let current = ''
  for (let i = 0; i < block.length; i++) {
    const c = block[i]
    if (c === "'") {
      inStr = !inStr
      current += c
      continue
    }
    if (inStr) {
      current += c
      continue
    }
    if (c === '(') {
      depth++
      if (depth === 1) continue // don't keep the row's own opening paren
      current += c
      continue
    }
    if (c === ')') {
      depth--
      if (depth === 0) {
        rows.push(current)
        current = ''
        continue
      }
      current += c
      continue
    }
    if (depth === 0) continue // whitespace/commas between rows
    current += c
  }
  return rows
}

function splitSqlRow(row) {
  // Splits a VALUES row on top-level commas, respecting single-quoted
  // strings (including doubled '' escapes) — good enough for seed data
  // that doesn't nest parens inside string literals.
  const cells = []
  let cur = ''
  let inStr = false
  for (let i = 0; i < row.length; i++) {
    const c = row[i]
    if (c === "'" ) {
      if (inStr && row[i + 1] === "'") {
        cur += "''"
        i++
        continue
      }
      inStr = !inStr
      cur += c
      continue
    }
    if (c === ',' && !inStr) {
      cells.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  cells.push(cur)
  return cells
}

function checkColumnValues(file, sql, table, col, tableDef) {
  const check = tableDef?.checks.find((c) => c.col === col)
  if (!check) return
  const insertRe = new RegExp(`insert into ${table}\\s*\\(([^)]*)\\)\\s*values\\s*([\\s\\S]*?);`, 'g')
  let im
  let used = new Set()
  while ((im = insertRe.exec(sql))) {
    const cols = im[1].split(',').map((c) => c.trim())
    const idx = cols.indexOf(col)
    if (idx === -1) continue
    const rows = splitTopLevelRows(im[2])
    for (const row of rows) {
      const cells = splitSqlRow(row)
      const raw = cells[idx]?.trim().replace(/^'|'$/g, '')
      if (raw) used.add(raw)
    }
  }
  const bad = [...used].filter((v) => !check.values.includes(v))
  if (bad.length) fail(`${file}: ${table}.${col} uses value(s) not in check constraint: ${bad.join(', ')} (allowed: ${check.values.join(', ')})`)
  else if (used.size) ok(`${file}: ${table}.${col} — all ${used.size} distinct value(s) satisfy the check constraint`)
}

console.log(`\n${'='.repeat(60)}`)
if (errors === 0) {
  console.log('PASS — no structural issues found.')
  process.exit(0)
} else {
  console.log(`FAILED — ${errors} issue(s) found.`)
  process.exit(1)
}
