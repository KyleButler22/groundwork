# Richer exercise instructions (`how_to`) — design

## Context

Every exercise detail page (`src/views/ExerciseView.vue`) shows a single `cues` string under
"How to do it" — one sentence per exercise, authored as a *refinement cue* for someone who
already knows the movement ("Elbows track back, not out"). Kyle's feedback from real use: for
the exercises he hasn't done before, that sentence assumes knowledge he doesn't have and
doesn't get him closer to actually performing the movement.

This is roadmap item #3 ("Actual demo clips on exercises") minus the clips — that item notes
the `exercises` table "already [has] a `demoUrl` column and hand-written coaching cues; the
column is just empty… closer to a content pass than an engineering project." This spec covers
the text half only. Images / `demo_url` are a separate follow-up (Kyle is sourcing usable,
correctly-licensed images).

State today, confirmed while scoping:

- `exercises.cues text` — 60/60 populated, one sentence each.
- `exercises.demo_url text` — exists, 60/60 null, unused in the view.
- Movement-library content reaches the app two ways: the bundled seed file
  (`supabase/seed/001_movement_library.sql`, parsed by `parseMovementLibrarySeed.ts`) for
  signed-out / dev use; a real Supabase `select('*')` pull for signed-in users
  (`pullRealContent` → `pullContentTable('exercises')` → generic `fromRow`). The live DB is
  only mutated by migrations now — `supabase db reset` is destructive since there is a real
  user account.
- The seed parser (`parseMovementLibrarySeed.ts`) uses hand-rolled positional regexes, and its
  per-statement splitter (`/insert into exercises[\s\S]*?;/g`) is **not** quote-aware — a `;`
  inside an authored string truncates the insert block and silently drops exercise rows at
  runtime for signed-out users.

## Decisions (settled during brainstorming)

1. **New `how_to` field, `cues` untouched.** `cues` stays exactly as-is on all 60 (it is a
   fine quick reminder); `how_to` is the new teaching layer. The page shows both.
2. **Labeled-step format, one text column.** `how_to` holds 2–4 newline-separated
   `Label: detail` lines (e.g. `Setup: …` / `Movement: …` / `Common mistake: …`). *Not* fixed
   `setup` / `execution` / `fault` columns — the natural phases differ by movement type (a
   hold, a negative, and a skill do not share a phase vocabulary), so labels are per-exercise
   free text inside one `how_to text` column.
3. **"Common mistake" lines are visually distinguished.** A line whose label matches
   `/^(common mistake|avoid|watch out)\b/i` renders with the existing `--color-warn-wash` /
   `--color-warn` tokens. Every exercise's `how_to` ends with one such line.
4. **Sample-first rollout.** 6 representative exercises authored and shipped first for Kyle to
   calibrate voice / depth against, then the other 54, then a final skim.
5. **No semicolons in authored `how_to` / `cues` text.** Hard rule — the seed parser's
   statement splitter is not quote-aware, and a stray `;` silently drops exercise rows at
   runtime for signed-out users. `assertSeedShape`'s "exactly 60" check is the backstop.
   Colons, dashes, and periods cover everything this copy needs.

## Storage

### Column

`how_to text` (nullable), added to `exercises` immediately after `cues`.

### Seed file — `supabase/seed/001_movement_library.sql`

`how_to` becomes the final column on all three `exercises` insert statements (the `reps`
block, the `time_seconds` block, the `distance_m` block). Each row gains a trailing `'…'`
literal with newlines inside it:

```sql
  ('nordic_curl_negative', 'Nordic curl negative', (select id from movement_patterns where slug = 'hinge'), 5.0, 'reps', 4, 8, false,
   'Ankles anchored, lower as slowly as you can control, hands ready to catch you.',
   'Setup: Kneel tall on something padded with your feet anchored under a heavy object or held by a partner.
Movement: Keep your body in a straight line from knees to head and lower your torso toward the floor as slowly as you can, fighting it with your hamstrings.
At the bottom: Let yourself drop into a push-up position, then push back and pull yourself to the top.
Common mistake: Folding at the hips instead of holding one straight line from knees to head.'),
```

(The `cues` literal is shown on its own line here only for readability — its content and
format are unchanged.)

### Migration — `supabase/migrations/0011_exercise_how_to.sql` (new)

```sql
alter table exercises add column how_to text;

update exercises set how_to = '…' where slug = 'pushup_wall';
-- … × 60
```

Applied by the controller via
`supabase db query --linked --file supabase/migrations/0011_exercise_how_to.sql` (the same
path used for `0010`). Written in full in Task 2, applied in Task 3. The seed file and the
migration carry identical `how_to` text per slug — kept in sync by hand, the way the seed and
the live DB already are for everything else.

## Code

### `src/types/domain.ts`

Add to `Exercise`, immediately after `cues: string | null`:

```ts
  howTo: string | null
```

### `src/generators/__fixtures__/parseMovementLibrarySeed.ts`

The exercise `rowRe` gains one trailing capture. Current tail:

```
…,\s*(true|false),\s*'((?:[^']|'')*)'\s*\)
```

becomes:

```
…,\s*(true|false),\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\s*\)
```

The row destructuring gains one binding:

```ts
const [, slug, name, patternSlug, level, mt, rangeA, rangeB, unilateral, cuesRaw, howToRaw] = m
```

and the pushed object sets `howTo: howToRaw.replace(/''/g, "'") || null` (empty string →
`null`), replacing its current absence. `demoUrl: null` stays hardcoded (still not in the
seed).

`assertSeedShape` — **after Task 2 only**, add a check that every exercise has a `how_to` and
that it carries a cautionary line (enforces decisions 3 and 5 mechanically):

```ts
const badHowTo = data.exercises.filter(
  (e) => !e.howTo || !/(^|\n)\s*(common mistake|avoid|watch out):/i.test(e.howTo),
)
if (badHowTo.length) problems.push(`${badHowTo.length} exercise(s) with missing or malformed how_to: ${badHowTo.map((e) => e.slug).join(', ')}`)
```

Not added in Task 1 (only 6 of 60 populated then).

### `src/generators/__fixtures__/testLibrary.ts`

One line in the `ex()` defaults block, beside `cues: null`:

```ts
    howTo: null,
```

### `src/lib/sync.ts`, `src/lib/devContentSeed.ts`

No change. `how_to` ↔ `howTo` is handled by the generic `toCamelCase` / `toSnakeCase` in
`fromRow` / `toRow`; `pullContentTable('exercises')` already does `select('*')`, so the new
column flows to signed-in users with no mapping work.

### New pure helper — `src/lib/exerciseHowTo.ts`

```ts
export interface HowToLine {
  label: string
  detail: string
  isWarning: boolean
}

/** Parse a how_to string (newline-separated "Label: detail" lines) into
 *  structured lines for ExerciseView. A line with no colon becomes a
 *  label-less detail line (label ''). Blank lines are dropped. isWarning
 *  marks the cautionary line ("Common mistake: …" / "Avoid: …" / "Watch
 *  out: …") so the view can tint it. Pure — unit-tested in
 *  exerciseHowTo.spec.ts. */
export function parseHowTo(howTo: string | null | undefined): HowToLine[]
```

- Split on `\n`, trim each, drop empties.
- First `:` splits `label` / `detail`; no colon → `{ label: '', detail: <whole line> }`.
- `isWarning`: `/^(common mistake|avoid|watch out)\b/i.test(label)`.

### `src/views/ExerciseView.vue`

Script: `const howToLines = computed(() => parseHowTo(exercise.value?.howTo))`.

Template — the "How to do it" block becomes:

- **`howToLines.length > 0`**: a list; each line renders `label` (bold, `text-ink`) then
  `detail`. An `isWarning` line renders as a rounded `bg-warn-wash` / `text-warn` block, label
  included.
- **else if `exercise.cues`**: today's single `<p>{{ exercise.cues }}</p>` (unchanged
  fallback — covers a signed-in client that pulled before `0011` landed).
- **else**: "No instructions recorded yet."

Then a new **Quick cue** block, shown only when `exercise.cues` *and* `howToLines.length > 0`
(otherwise `cues` is already serving as the body above):

```html
<h2 class="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">Quick cue</h2>
<p class="mt-2 text-sm text-muted">{{ exercise.cues }}</p>
```

Section order is unchanged except "Quick cue" slots between "How to do it" and "Equipment
needed".

## Rollout

### Task 1 — plumbing + 6 samples

All of §Code **except** the `assertSeedShape` guard. `how_to` authored in the **seed file
only** for: `pushup_wall`, `pullup_full`, `squat_pistol`, `plank_full`, `handstand_wall_back`,
`nordic_curl_negative` (easy/hard, reps/hold, bilateral/unilateral, standard/eccentric/skill).
No migration yet.

Verify: `npm run typecheck`, `npm run test`, `npm run verify:sql`, then `npm run build && npm
run preview` and read all 6 pages **signed out** (signed-in reads the live DB, which has no
`how_to` column until Task 3 — a signed-in check here would show only the `cues` fallback and
mislead). Screenshot the 6 for Kyle.

**Checkpoint: Kyle reviews the 6.** Voice, length, whether the labels fit, whether "Common
mistake" earns the tint.

### Task 2 — the other 54 + migration

Author `how_to` for the remaining 54 in the seed file, to the calibrated standard. Write
`0011_exercise_how_to.sql` in full (the `alter table` + all 60 `update`s). Add the
`assertSeedShape` guard.

Verify: the same four commands. `assertSeedShape` now enforces 60/60 non-empty.

**Checkpoint: Kyle skims all 60** (from the seed file or a preview build).

### Task 3 — live DB

Controller applies `0011` via `supabase db query --linked --file …`. Verify signed in against
the real project: the exercise page shows `how_to` from the pull (not the fallback), and
`select how_to from exercises where slug = 'pushup_wall'` returns the text.

## Authoring standard (for the 6, then the 54)

- 2–4 lines. Labels chosen per movement; the **last line is always the cautionary one**
  (`Common mistake:` / `Avoid:` / `Watch out:`).
- Common label sets: reps movements → `Setup` / `Movement` / `Common mistake`; holds →
  `Setup` / `Hold` / `Common mistake`; negatives → `Setup` / `Lower` / `At the bottom` /
  `Common mistake`; skills → `Getting up` / `Balance` / `Common mistake`.
- Second person, imperative, plain words. No jargon without a gloss ("scapular retraction" →
  "pull your shoulder blades down and together").
- Assume the reader has never done it and cannot see a photo yet: describe the start position
  concretely (where the hands are, what is on the floor, which way you face).
- No semicolons. Apostrophes written `''` in the SQL.
- Do not repeat the `cues` sentence verbatim as a line — `how_to` should stand on its own.

## Out of scope

- `demo_url` / images — separate follow-up.
- Any edit to the 60 `cues`.
- Intake placement-test question copy (`src/components/intake/StepPlacement.vue`).
- Progression branching.
- Refactoring `parseMovementLibrarySeed.ts` to share `sqlParse.ts`'s quote-aware primitives —
  the no-semicolon rule sidesteps the one hazard that would motivate it; noted as a known
  future cleanup if the library ever needs richer punctuation.

## Testing

| What | How |
|---|---|
| `parseHowTo` | `src/lib/exerciseHowTo.spec.ts` — label/detail split, no-colon line, blank-line drop, `isWarning` matching (positive + negative), `null`/empty input |
| Seed parser | extend `parseMovementLibrarySeed` coverage: a `howTo` value round-trips (including a multi-line one with colons); post-Task-2, `assertSeedShape` throws when a row's `how_to` is empty |
| Types | `npm run typecheck` |
| Seed structure | `npm run verify:sql` (unchanged checks; a new trailing column does not shift existing cell indices) |
| View | manual, `vite preview` — the 6 in Task 1, all 60 in Task 2 |
| Live pull | manual, signed in, after Task 3 |

No new integration test — `generatePlan.integration.spec.ts` already runs the real seed
through the modified parser, so a regex slip that broke row parsing fails it immediately.
