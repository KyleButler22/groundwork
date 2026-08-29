import { describe, expect, it } from 'vitest'

import { parseInsertRows, splitRowCells, splitTopLevelRows, unquote } from './sqlParse'

describe('parseInsertRows', () => {
  it('parses a simple multi-row statement', () => {
    const sql = `insert into widgets (slug, name) values\n  ('a', 'Alpha'),\n  ('b', 'Beta');\n`
    const rows = parseInsertRows(sql, 'widgets')
    expect(rows.map((r) => [unquote(r.slug), unquote(r.name)])).toEqual([
      ['a', 'Alpha'],
      ['b', 'Beta'],
    ])
  })

  it('does not stop at a semicolon embedded inside a quoted value — regression for the bug that dropped recipe_steps for 78/200 recipes', () => {
    // Real shape from supabase/seed/013_recipes_pork.sql: a step whose own
    // instruction text contains "; " well before the statement's real
    // terminator. The old implementation searched for the next literal
    // `;` with no string-awareness, so it read only up to "oil" here and
    // silently produced zero rows (the truncated tuple never closes its
    // parens) instead of all 4.
    const sql = [
      "insert into recipe_steps (recipe_id, step_number, instruction) values",
      "  ((select id from recipes where slug = 'pork-fried-rice'), 1, 'Heat 1 tbsp oil; scramble the eggs softly and set aside.'),",
      "  ((select id from recipes where slug = 'pork-fried-rice'), 2, 'Add remaining oil, brown the pork with garlic, about 6 minutes.'),",
      "  ((select id from recipes where slug = 'pork-fried-rice'), 3, 'Add carrot and peas; cook 2-3 minutes.'),",
      "  ((select id from recipes where slug = 'pork-fried-rice'), 4, 'Add the rice, breaking up clumps, and stir-fry 3-4 minutes.');",
      "insert into recipe_meal_slots (recipe_id, slot) values",
      "  ((select id from recipes where slug = 'pork-fried-rice'), 'dinner');",
    ].join('\n')

    const rows = parseInsertRows(sql, 'recipe_steps')
    expect(rows).toHaveLength(4)
    expect(rows.map((r) => unquote(r.instruction))).toEqual([
      'Heat 1 tbsp oil; scramble the eggs softly and set aside.',
      'Add remaining oil, brown the pork with garlic, about 6 minutes.',
      'Add carrot and peas; cook 2-3 minutes.',
      'Add the rice, breaking up clumps, and stir-fry 3-4 minutes.',
    ])

    // The next statement (a different table) must still parse correctly —
    // the scan needs to resume from the right place afterward.
    expect(parseInsertRows(sql, 'recipe_meal_slots')).toHaveLength(1)
  })

  it('handles multiple statements for the same table in one file, each with its own column list', () => {
    const sql = `insert into a (x) values ('1');\ninsert into a (x, y) values ('2', 'z');\n`
    const rows = parseInsertRows(sql, 'a')
    expect(rows.map((r) => unquote(r.x))).toEqual(['1', '2'])
    expect(unquote(rows[1].y)).toBe('z')
  })

  it('preserves an escaped apostrophe inside a quoted value', () => {
    const sql = `insert into recipes (title) values ('Turkey Shepherd''s Pie');\n`
    expect(unquote(parseInsertRows(sql, 'recipes')[0].title)).toBe("Turkey Shepherd's Pie")
  })

  it('tolerates a nested subquery inside a row without mistaking its comma/parens for row boundaries', () => {
    const sql = `insert into recipe_ingredients (recipe_id, ingredient_id, quantity) values\n  ((select id from recipes where slug = 'r1'), (select id from ingredients where slug = 'i1'), 2);\n`
    const rows = parseInsertRows(sql, 'recipe_ingredients')
    expect(rows).toHaveLength(1)
    expect(unquote(rows[0].quantity)).toBe('2')
  })

  it('returns nothing for a table name with no matching statement', () => {
    expect(parseInsertRows("insert into other (x) values ('1');", 'widgets')).toEqual([])
  })
})

describe('splitTopLevelRows / splitRowCells', () => {
  it('round-trips a values block into cells, ignoring commas inside a nested subquery', () => {
    // splitRowCells doesn't trim its output (real callers always route
    // through unquote/num/bool, which do) — trim here too so this test
    // isn't just re-asserting that raw whitespace artifact.
    const [row] = splitTopLevelRows("((select a, b from t), 'x, y'), (1, 2)")
    expect(splitRowCells(row).map((c) => c.trim())).toEqual(["(select a, b from t)", "'x, y'"])
  })
})
