// Shared low-level SQL seed parsing primitives, extracted so a 4th
// implementation doesn't accumulate (verify-sql.mjs and
// verify-food-reference.mjs each grew their own copy of these while the
// seed content was small; recipe generation is exactly the point where
// that duplication would actually cause a bug).

export function stripComments(sql) {
  let out = ''
  let inStr = false
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i]
    if (c === "'") { inStr = !inStr; out += c; continue }
    if (!inStr && c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      out += '\n'
      continue
    }
    out += c
  }
  return out
}

/** Splits a `VALUES (...), (...), (...)` block into top-level row strings
 *  (outer parens stripped), depth- and quote-aware so a row containing
 *  nested `(select ...)` subqueries is never mistaken for a row boundary. */
export function splitTopLevelRows(block) {
  const rows = []
  let depth = 0, inStr = false, current = ''
  for (let i = 0; i < block.length; i++) {
    const c = block[i]
    if (c === "'") { inStr = !inStr; current += c; continue }
    if (inStr) { current += c; continue }
    if (c === '(') { depth++; if (depth === 1) continue; current += c; continue }
    if (c === ')') { depth--; if (depth === 0) { rows.push(current); current = ''; continue }; current += c; continue }
    if (depth === 0) continue
    current += c
  }
  return rows
}

/** Splits one row's inner content into its comma-separated cell strings,
 *  quote-aware (commas inside a string literal don't split) and tolerant
 *  of a nested `(select ...)` — parens are tracked so a comma inside one
 *  doesn't split either, though none of the seed data actually needs that. */
export function splitRowCells(row) {
  const cells = []
  let cur = '', inStr = false, depth = 0
  for (let i = 0; i < row.length; i++) {
    const c = row[i]
    if (c === "'") {
      if (inStr && row[i + 1] === "'") { cur += "''"; i++; continue }
      inStr = !inStr; cur += c; continue
    }
    if (inStr) { cur += c; continue }
    if (c === '(') depth++
    if (c === ')') depth--
    if (c === ',' && depth === 0) { cells.push(cur); cur = ''; continue }
    cur += c
  }
  cells.push(cur)
  return cells
}

export function unquote(s) {
  const t = s?.trim()
  if (t === undefined || t === 'null') return null
  return t.replace(/^'|'$/g, '').replace(/''/g, "'")
}

export function num(s) {
  const v = unquote(s)
  if (v === null) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

/** Scans forward from `from` for the `;` that actually terminates the
 *  statement — quote- and paren-depth-aware, unlike a plain "next literal
 *  `;`" search. Recipe instructions routinely contain a semicolon of
 *  their own (e.g. "Heat oil; soften onion..."); a naive scan stops
 *  there instead of at the statement's real end, silently truncating the
 *  values list mid-string — which is exactly how 78 of 200 recipes ended
 *  up with zero recipe_steps rows client-side despite every one of them
 *  being fully authored in this file (verify-recipes.mjs's own
 *  stepCounts check never caught it: it scans raw text for the
 *  recipe_steps row shape directly, without going through
 *  parseInsertRows at all). Returns -1 if there's no top-level `;` left
 *  (a malformed/incomplete statement — callers treat that as "no more
 *  matches" rather than guessing). */
function findStatementEnd(sql, from) {
  let depth = 0, inStr = false
  for (let i = from; i < sql.length; i++) {
    const c = sql[i]
    if (c === "'") { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ';' && depth === 0) return i
  }
  return -1
}

/** Parses every `insert into <table> (<cols>) values (...), (...);`
 *  statement for a given table name, across possibly-different column
 *  lists (the food reference seed uses 3 different shapes for
 *  ingredients depending on staple/perishable/grams-vs-density). Returns
 *  an array of {..column: rawCellString} objects, one per row, plus the
 *  column list actually used for that particular statement. */
export function parseInsertRows(sql, tableName) {
  const results = []
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
      const rec = {}
      cols.forEach((col, i) => { rec[col] = cells[i] })
      results.push(rec)
    }
    searchFrom = stmtEnd + 1
  }
  return results
}
