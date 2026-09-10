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
- The seed parser (`parseMovementLibrarySeed.ts`) uses hand-rolled positional regexes, and
  `verify-sql.mjs`'s per-statement splitter (`… values\s*([\s\S]*?);`) is **not** quote-aware
  — a `;` inside an authored string truncates a statement mid-parse. This, plus keeping the
  positional insert `rowRe` untouched, is why the design avoids adding a `how_to` insert
  column and avoids semicolons in the text (decision 5).

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
5. **`how_to` content ships as `update` statements, not an insert column; no semicolons in
   the text.** The positional insert `rowRe` the generator depends on stays untouched, and an
   added insert column would force a `null` onto all 54 not-yet-authored rows. `update
   exercises set how_to = '…' where slug = '…'` statements after the inserts avoid both and
   are the exact shape the migration needs. Semicolons stay out of the text because
   `verify-sql.mjs`'s statement splitter is not quote-aware; colons, dashes, and periods
   cover everything this copy needs.

## Storage

### Column

`how_to text` (nullable), added to `exercises` by the `alter table` in migration `0011`.
Conceptually it sits alongside `cues` — a fuller version of the same thing.

### Seed file — `supabase/seed/001_movement_library.sql`

`how_to` content is added as `update` statements appended after the three `exercises` insert
statements — **the positional insert rows are left completely untouched.** (Refined during
planning: the insert `rowRe` in `parseMovementLibrarySeed.ts` is a fragile positional regex
the whole generator depends on, and adding a 10th column would force a `null` onto all 54
not-yet-authored rows. `update` statements avoid both — and they are the exact shape the
migration needs anyway, so the two files' `how_to` blocks stay copy-paste identical.)

```sql
-- ── how-to instructions ──────────────────────────────────────────────────
-- Labeled-step "how to do it" text for the exercise detail page, shown
-- alongside the one-line `cues`. Newline-separated "Label: detail" lines,
-- last line always a cautionary one. No semicolons in the text (the
-- statement splitters below and in verify-sql.mjs are not quote-aware).
-- Mirrored verbatim in supabase/migrations/0011_exercise_how_to.sql.
update exercises set how_to =
'Setup: Kneel tall on something padded with your feet anchored under a heavy object or held down by a partner.
Lower: Keep a straight line from knees to head and lower your torso toward the floor as slowly as you can, resisting the whole way with your hamstrings.
At the bottom: Let yourself drop into a push-up position to catch the fall, then push off the floor and pull yourself back to the top.
Common mistake: Folding at the hips instead of lowering as one rigid line from knees to head.'
where slug = 'nordic_curl_negative';
-- … one per exercise
```

### Migration — `supabase/migrations/0011_exercise_how_to.sql` (new)

```sql
alter table exercises add column how_to text;

update exercises set how_to =
'Setup: …
Common mistake: …'
where slug = 'pushup_wall';
-- … × 60, byte-identical to the seed file's update block
```

Applied by the controller via
`supabase db query --linked --file supabase/migrations/0011_exercise_how_to.sql` (the same
path used for `0010`). Written in full in Task 4, applied in Task 5. The seed file's `update`
block and the migration's `update` block are identical text (the migration only adds the
`alter table` line above them) — kept in sync by hand, the way the seed and the live DB
already are for everything else.

## Code

### `src/types/domain.ts`

Add to `Exercise`, immediately after `cues: string | null`:

```ts
  howTo: string | null
```

### `src/generators/__fixtures__/parseMovementLibrarySeed.ts`

The positional insert `rowRe` is **not touched.** The pushed exercise object gains a default
`howTo: null` (beside `demoUrl: null`). A new self-contained pass, after the insert rows are
parsed, overlays the `how_to` text from the `update` statements:

```ts
// how_to lives in `update` statements after the inserts (authored
// incrementally — see the 2026-09-10 spec), keyed by slug, not in the
// positional insert rows.
{
  const re = /update exercises set how_to\s*=\s*'((?:[^']|'')*)'\s*where slug = '([\w-]+)'/g
  let um: RegExpExecArray | null
  while ((um = re.exec(sql))) {
    const [, howToRaw, howToSlug] = um
    const target = exercises.find((e) => e.slug === howToSlug)
    if (!target) throw new Error(`parseMovementLibrarySeed: how_to update references unknown exercise "${howToSlug}"`)
    target.howTo = howToRaw.replace(/''/g, "'")
  }
}
```

(`sql` here is the comment-stripped text already used by the rest of the function; the exact
placement and full code are in the plan.)

`assertSeedShape` — **after Task 4 only**, add a check that every exercise has a `how_to` and
that it carries a cautionary line (enforces decisions 3 and 5 mechanically):

```ts
const badHowTo = data.exercises.filter(
  (e) => !e.howTo || !/(^|\n)[ \t]*(common mistake|avoid|watch out):/i.test(e.howTo),
)
if (badHowTo.length) problems.push(`${badHowTo.length} exercise(s) with missing or malformed how_to: ${badHowTo.map((e) => e.slug).join(', ')}`)
```

Not added earlier (only 6 of 60 populated until Task 4).

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

- Split on `/\r?\n/` (the seed file is stored LF but checked out CRLF on Windows — no
  `.gitattributes` override), trim each, drop empties.
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

See the implementation plan for the task-by-task breakdown. The shape:

1. **`parseHowTo` helper + unit tests** (pure, TDD).
2. **Schema plumbing + the 6 samples**: `domain.ts`, the `parseMovementLibrarySeed.ts`
   `update`-overlay pass, `testLibrary.ts`, `docs/schema.md`, and `update` statements in the
   seed file for `pushup_wall`, `pullup_full`, `squat_pistol`, `plank_full`,
   `handstand_wall_back`, `nordic_curl_negative` (easy/hard, reps/hold, bilateral/unilateral,
   standard/eccentric/skill). Verified via `npm run typecheck` / `test` / `verify:sql`.
3. **`ExerciseView.vue` rendering** — verified in `npm run dev` (the exercise page needs an
   active plan to resolve `store.exercise(id)`, and only dev has no intake auth gate; the
   `how_to` parse is build-mode-independent so dev is representative). Reset local IndexedDB
   first so the new seed re-runs. Screenshot the 6.
   → **Checkpoint: Kyle reviews the 6** — voice, length, labels, whether "Common mistake"
   earns the tint.
4. **[Controller] the other 54 + migration**: author 54 `update`s in the seed to the
   calibrated standard, create `0011_exercise_how_to.sql` (`alter table` + the identical 60
   `update`s), add the `assertSeedShape` guard, flip the integration-spec assertions to
   "all 60 present". `verify:sql` + `test` green.
   → **Checkpoint: Kyle skims all 60.**
5. **[Controller] live DB**: apply `0011` via `supabase db query --linked --file …`. Verify
   signed in — the exercise page shows `how_to` from the pull (not the fallback), and
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
- No semicolons, and no `--` (double hyphen) — both confuse the SQL comment/statement
  stripping. A single hyphen (`push-up`) and an em-dash (`—`) are both fine and already appear
  in `cues`.
- Apostrophes written `''` in the SQL.
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
| `parseHowTo` | `src/lib/exerciseHowTo.spec.ts` — label/detail split, no-colon line, blank-line drop, `isWarning` matching (positive + negative), `\r\n` tolerance, `null`/empty input |
| Seed parser | assertions in `generatePlan.integration.spec.ts`'s `loadRealSeed sanity` block: `pushup_wall.howTo` contains `Setup:` and `Common mistake:` (a multi-line value with colons round-trips); an unauthored slug is `null`. Step 4 flips the latter to "all 60 present" once `assertSeedShape` guards it. |
| Types | `npm run typecheck` |
| Seed structure | `npm run verify:sql` (`update` statements don't add parens or `select … where slug` lookups — neutral to its checks; paren balance still holds) |
| View | manual, `npm run dev` (reset IndexedDB first) — the 6 at step 3, all 60 after step 4 |
| Live pull | manual, signed in against the real project, after step 5 |

No standalone parser spec — `generatePlan.integration.spec.ts` already runs the real seed
through the parser (`assertSeedShape` enforces the 60-exercise / 8-pattern / 52-edge shape on
every parse), so a regex slip that broke row parsing fails it immediately. The new `how_to`
overlay pass is covered by the `loadRealSeed sanity` assertions above.
