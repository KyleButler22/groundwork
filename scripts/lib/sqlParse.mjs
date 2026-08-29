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

/** Parses every `insert into <table> (<cols>) values (...), (...);`
 *  statement for a given table name, across possibly-different column
 *  lists (the food reference seed uses 3 different shapes for
 *  ingredients depending on staple/perishable/grams-vs-density). Returns
 *  an array of {..column: rawCellString} objects, one per row, plus the
 *  column list actually used for that particular statement. */
export function parseInsertRows(sql, tableName) {
  const results = []
  const re = new RegExp(`insert into ${tableName}\\s*\\(([^)]+)\\)\\s*values\\s*([\\s\\S]*?);`, 'g')
  let m
  while ((m = re.exec(sql))) {
    const cols = m[1].split(',').map((c) => c.trim())
    const rows = splitTopLevelRows(m[2])
    for (const row of rows) {
      const cells = splitRowCells(row)
      const rec = {}
      cols.forEach((col, i) => { rec[col] = cells[i] })
      results.push(rec)
    }
  }
  return results
}
