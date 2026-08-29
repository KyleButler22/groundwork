/**
 * Generic, column-aware SQL seed-file parsing primitives — a typed port of
 * scripts/lib/sqlParse.mjs for the browser/vitest side (no `fs`, no Node
 * APIs, so it runs anywhere plain TS runs). NOT a re-export of that file:
 * scripts/ is separate build-time tooling (plain Node ESM, no bundler) from
 * src/ (Vite + TS), and parseMovementLibrarySeed.ts already established the
 * precedent of a second, independent copy of these primitives on this side
 * of that boundary rather than reaching across it — see that file's header.
 *
 * Why this is needed at all, when parseMovementLibrarySeed.ts got by with
 * simple per-table regexes: the food-reference seed uses a DIFFERENT
 * `insert into ingredients (...)` column list depending on the block
 * (pantry staples use density_g_per_ml, perishables use grams_per_each) —
 * a fixed-position regex silently misreads one shape or the other. This
 * parses the actual column header of each statement and maps cells to it
 * by name instead of position, which is what scripts/verify-food-
 * reference.mjs and scripts/lib/ingredientIndex.mjs already rely on
 * against the exact same file.
 */

export function stripComments(sql: string): string {
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

/** Splits a `values (...), (...), (...)` block into top-level row strings
 *  (outer parens stripped), depth- and quote-aware so a row containing a
 *  nested `(select ...)` subquery is never mistaken for a row boundary. */
export function splitTopLevelRows(block: string): string[] {
  const rows: string[] = []
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
      if (depth === 1) continue
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
    if (depth === 0) continue
    current += c
  }
  return rows
}

/** Splits one row's inner content into comma-separated cell strings,
 *  quote-aware (a comma inside a string literal doesn't split) and
 *  tolerant of a nested `(select ...)` (a comma inside one doesn't split
 *  either — needed here, unlike the Node original, since recipe rows
 *  routinely nest two subqueries per row). */
export function splitRowCells(row: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inStr = false
  let depth = 0
  for (let i = 0; i < row.length; i++) {
    const c = row[i]
    if (c === "'") {
      if (inStr && row[i + 1] === "'") {
        cur += "''"
        i++
        continue
      }
      inStr = !inStr
      cur += c
      continue
    }
    if (inStr) {
      cur += c
      continue
    }
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ',' && depth === 0) {
      cells.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  cells.push(cur)
  return cells
}

export function unquote(s: string | undefined): string | null {
  const t = s?.trim()
  if (t === undefined || t === 'null') return null
  return t.replace(/^'|'$/g, '').replace(/''/g, "'")
}

export function num(s: string | undefined): number | null {
  const v = unquote(s)
  if (v === null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

export function bool(s: string | undefined): boolean {
  return unquote(s) === 'true'
}

/** A raw cell's text when it's a `(select id from <table> where slug =
 *  '<slug>')` subquery — the shape every foreign key in these seed files
 *  uses instead of a literal id, since ids aren't known until insert time.
 *  Returns just the slug; the caller resolves it through its own
 *  slug -> local-id map (see parseFoodReferenceSeed.ts / parseRecipeSeed.ts). */
export function slugFromRef(cell: string | undefined): string | null {
  if (cell === undefined) return null
  const m = /select\s+id\s+from\s+\w+\s+where\s+slug\s*=\s*'([\w-]+)'/.exec(cell)
  return m ? m[1] : null
}

export type InsertRow = Record<string, string | undefined>

/** Scans forward from `from` for the `;` that actually terminates the
 *  statement — quote- and paren-depth-aware, unlike a plain "next literal
 *  `;`" search. Recipe instructions routinely contain a semicolon of their
 *  own (e.g. "Heat oil; soften onion..."); a naive scan stops there
 *  instead of at the statement's real end, silently truncating the values
 *  list mid-string. Returns -1 if the string has no top-level `;` at all
 *  (a malformed/incomplete statement — callers treat that as "no more
 *  matches" rather than guessing). */
function findStatementEnd(sql: string, from: number): number {
  let depth = 0
  let inStr = false
  for (let i = from; i < sql.length; i++) {
    const c = sql[i]
    if (c === "'") {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ';' && depth === 0) return i
  }
  return -1
}

/** Parses every `insert into <table> (<cols>) values (...), (...);`
 *  statement for a given table name, across possibly-different column
 *  lists (see this file's header). Returns one plain object per row,
 *  `{columnName: rawCellText}` — callers pick columns out by name via
 *  unquote/num/bool/slugFromRef above, so a missing optional column (not
 *  present in this particular statement's header) is simply `undefined`
 *  rather than misaligned with the wrong value. */
export function parseInsertRows(sql: string, tableName: string): InsertRow[] {
  const results: InsertRow[] = []
  const needle = `insert into ${tableName}`
  let searchFrom = 0
  for (;;) {
    const start = sql.indexOf(needle, searchFrom)
    if (start === -1) break
    const colStart = sql.indexOf('(', start)
    const colEnd = colStart === -1 ? -1 : sql.indexOf(')', colStart)
    const valuesIdx = colEnd === -1 ? -1 : sql.indexOf('values', colEnd)
    const stmtEnd = valuesIdx === -1 ? -1 : findStatementEnd(sql, valuesIdx + 'values'.length)
    if (colStart === -1 || colEnd === -1 || valuesIdx === -1 || stmtEnd === -1) break

    const cols = sql.slice(colStart + 1, colEnd).split(',').map((c) => c.trim())
    const rows = splitTopLevelRows(sql.slice(valuesIdx + 'values'.length, stmtEnd))
    for (const row of rows) {
      const cells = splitRowCells(row)
      const rec: InsertRow = {}
      cols.forEach((col, i) => {
        rec[col] = cells[i]
      })
      results.push(rec)
    }
    searchFrom = stmtEnd + 1
  }
  return results
}
