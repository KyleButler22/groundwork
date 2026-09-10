# Richer exercise instructions (`how_to`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every exercise detail page a labeled-step "how to do it" that teaches a movement someone has never done, alongside the existing one-line cue.

**Architecture:** A new nullable `exercises.how_to` text column carries 2–4 newline-separated `Label: detail` lines. Content ships as `update exercises set how_to = '…' where slug = '…'` statements — in the bundled seed file (`supabase/seed/001_movement_library.sql`) for signed-out/dev, and byte-identically in migration `0011_exercise_how_to.sql` for the live DB. `parseMovementLibrarySeed.ts` gets a new slug-keyed overlay pass (the fragile positional insert regex is untouched). A pure `parseHowTo()` helper turns the stored text into structured lines; `ExerciseView.vue` renders them, tinting the cautionary line. Rollout is sample-first: 6 exercises, a calibration checkpoint, then the other 54 and the live migration (both controller-run).

**Tech Stack:** Vue 3 `<script setup>`, Pinia, Tailwind v4 (CSS-first tokens), Vitest, `vue-tsc`, Supabase/Postgres, Supabase CLI.

**Working location:** Tasks 1–3 run in an isolated worktree on a feature branch (per this project's convention — set up by `superpowers:using-git-worktrees` at execution start). Tasks 4–5 are controller-run; Task 4 continues on that branch, Task 5 applies the migration to the live DB and then hands off to `superpowers:finishing-a-development-branch` for the merge.

## Global Constraints

- `cues` is **not edited** — all 60 stay exactly as they are.
- `how_to` text: 2–4 newline-separated `Label: detail` lines; the **last line is always cautionary** — its label is `Common mistake:`, `Avoid:`, or `Watch out:`.
- Warning-line detection is by label only: `/^(common mistake|avoid|watch out)\b/i`.
- **No semicolons and no `--` (double hyphen)** anywhere in `how_to` text — both break SQL comment/statement stripping. Single hyphen (`push-up`) and em-dash (`—`) are fine.
- Apostrophes in the seed/migration SQL are doubled (`''`).
- The seed file's `how_to` `update` block and migration `0011`'s `update` block are **identical text** (the migration only prepends the `alter table` line).
- Colours use existing tokens only: `--color-warn` / `--color-warn-wash` (Tailwind classes `text-warn`, `bg-warn`, `bg-warn-wash`, `bg-warn/20`).
- No hand-written snake_case↔camelCase mapping — `how_to` ↔ `howTo` goes through the generic `fromRow`/`toRow` in `src/lib/sync.ts` untouched.
- `parseHowTo` splits on `/\r?\n/` — the seed file is stored LF but checks out CRLF on Windows (no `.gitattributes`).
- No Dexie version bump — `how_to` is not an indexed field (`exercises` store is `'&id, slug, [patternId+level]'`), so `bulkAdd` stores it with no schema change.

---

### Task 1: `parseHowTo` helper

**Files:**
- Create: `src/lib/exerciseHowTo.ts`
- Create: `src/lib/exerciseHowTo.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface HowToLine { label: string; detail: string; isWarning: boolean }
  export function parseHowTo(howTo: string | null | undefined): HowToLine[]
  ```
  Used by `ExerciseView.vue` in Task 3.

**Model:** cheapest tier — complete code below, pure TDD.

- [ ] **Step 1: Write the failing test**

Create `src/lib/exerciseHowTo.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { parseHowTo } from './exerciseHowTo'

describe('parseHowTo', () => {
  it('returns [] for null, undefined, empty, and whitespace-only input', () => {
    expect(parseHowTo(null)).toEqual([])
    expect(parseHowTo(undefined)).toEqual([])
    expect(parseHowTo('')).toEqual([])
    expect(parseHowTo('   \n  \n')).toEqual([])
  })

  it('splits one "Label: detail" line into trimmed label and detail', () => {
    expect(parseHowTo('Setup:  Kneel on a pad. ')).toEqual([
      { label: 'Setup', detail: 'Kneel on a pad.', isWarning: false },
    ])
  })

  it('parses multiple lines in order and drops blank lines between them', () => {
    expect(parseHowTo('Setup: Stand tall.\n\nMovement: Lower down.\n')).toEqual([
      { label: 'Setup', detail: 'Stand tall.', isWarning: false },
      { label: 'Movement', detail: 'Lower down.', isWarning: false },
    ])
  })

  it('treats a line with no colon as a label-less detail line', () => {
    expect(parseHowTo('Just do the thing.')).toEqual([
      { label: '', detail: 'Just do the thing.', isWarning: false },
    ])
  })

  it('keeps everything after the first colon as the detail', () => {
    expect(parseHowTo('Movement: lower, pause, then press up: hard')).toEqual([
      { label: 'Movement', detail: 'lower, pause, then press up: hard', isWarning: false },
    ])
  })

  it('flags a cautionary line by its label, case-insensitively', () => {
    expect(parseHowTo('Common mistake: sagging hips')[0].isWarning).toBe(true)
    expect(parseHowTo('common mistake: sagging hips')[0].isWarning).toBe(true)
    expect(parseHowTo('Avoid: locking the knees')[0].isWarning).toBe(true)
    expect(parseHowTo('Watch out: rounding the back')[0].isWarning).toBe(true)
  })

  it('does not flag a line whose detail merely contains a warning word', () => {
    expect(parseHowTo('Movement: avoid bouncing at the bottom')[0].isWarning).toBe(false)
    expect(parseHowTo('Tip: watch out for your breathing')[0].isWarning).toBe(false)
  })

  it('tolerates CRLF line endings (the seed file is CRLF on Windows checkouts)', () => {
    expect(parseHowTo('Setup: A.\r\nCommon mistake: B.\r\n')).toEqual([
      { label: 'Setup', detail: 'A.', isWarning: false },
      { label: 'Common mistake', detail: 'B.', isWarning: true },
    ])
  })
})
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm run test -- exerciseHowTo`
Expected: FAIL — `Failed to resolve import "./exerciseHowTo"` / `parseHowTo is not a function`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/exerciseHowTo.ts`:

```ts
/**
 * Parse an exercise's `how_to` text (see
 * supabase/seed/001_movement_library.sql) into structured lines for
 * ExerciseView. The stored format is 2-4 newline-separated
 * "Label: detail" lines, the last always a cautionary one
 * ("Common mistake:" / "Avoid:" / "Watch out:").
 *
 * Pure and dependency-free — unit-tested in exerciseHowTo.spec.ts. A line
 * with no colon becomes a label-less detail line. Blank lines are
 * dropped. `\r\n` is tolerated: the seed file is stored LF but checked
 * out CRLF on Windows (no .gitattributes override).
 */
export interface HowToLine {
  label: string
  detail: string
  isWarning: boolean
}

const WARNING_LABEL = /^(common mistake|avoid|watch out)\b/i

export function parseHowTo(howTo: string | null | undefined): HowToLine[] {
  if (!howTo) return []
  const lines: HowToLine[] = []
  for (const raw of howTo.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const colon = line.indexOf(':')
    if (colon === -1) {
      lines.push({ label: '', detail: line, isWarning: false })
      continue
    }
    const label = line.slice(0, colon).trim()
    const detail = line.slice(colon + 1).trim()
    lines.push({ label, detail, isWarning: WARNING_LABEL.test(label) })
  }
  return lines
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npm run test -- exerciseHowTo`
Expected: PASS — 8 passed.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/exerciseHowTo.ts src/lib/exerciseHowTo.spec.ts
git commit -m "Add parseHowTo helper for exercise how_to text"
```

---

### Task 2: Schema plumbing + 6 sample descriptions

**Files:**
- Modify: `src/types/domain.ts` (add `howTo` to `Exercise`, after `cues: string | null` on line 99)
- Modify: `src/generators/__fixtures__/parseMovementLibrarySeed.ts` (default `howTo: null` in the pushed object; new `update`-overlay pass after the exercise loop)
- Modify: `src/generators/__fixtures__/testLibrary.ts` (add `howTo: null` to the `ex()` defaults, after `cues: null` on line 56)
- Modify: `src/lib/progressionMap.spec.ts` (add `howTo: null` to the local `exercise()` helper, after `cues: null` on line 23)
- Modify: `supabase/seed/001_movement_library.sql` (append the how-to `update` block — 6 statements)
- Modify: `src/generators/workout/generatePlan.integration.spec.ts` (assertions in the `loadRealSeed sanity` describe block)
- Modify: `docs/schema.md` (one sentence in the Movement library note)

The three `Exercise`-literal builders that need `howTo: null` are `testLibrary.ts`'s `ex()`, `progressionMap.spec.ts`'s `exercise()`, and the parser's `exercises.push({…})`. `prescription.spec.ts`'s `{ …testExercises[0] } as Exercise[]` casts already carry it via the spread — no change.

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `Exercise.howTo: string | null`, populated by `parseMovementLibrarySeed` from `update` statements. After this task, exactly these 6 slugs have `how_to`: `pushup_wall`, `pullup_full`, `squat_pistol`, `plank_full`, `handstand_wall_back`, `nordic_curl_negative`. All other exercises: `howTo === null`.

**Model:** mid tier — multi-file, a regex, a large seed edit; all code is given below.

- [ ] **Step 1: Write the failing assertions**

In `src/generators/workout/generatePlan.integration.spec.ts`, find the `describe('loadRealSeed sanity', …)` block (it already has an `it('parsed something that looks like the real content', …)` and an `it('parses real human-readable names…', …)`). Add a third `it` inside that same `describe`:

```ts
  it('overlays how_to instructions from the update statements, leaving unauthored exercises null', () => {
    const wallPushup = seed.exercises.find((e) => e.slug === 'pushup_wall')!
    expect(wallPushup.howTo).toContain('Setup:')
    expect(wallPushup.howTo).toContain('Common mistake:')
    expect(wallPushup.howTo).toContain('\n') // multi-line value round-tripped intact

    // The other 54 are authored in a later rollout step — until then they
    // parse as null (not "", not undefined, not a crash).
    expect(seed.exercises.find((e) => e.slug === 'pushup_incline')!.howTo).toBeNull()
  })
```

- [ ] **Step 2: Run the assertions, verify they fail**

Run: `npm run test -- generatePlan.integration`
Expected: FAIL — `wallPushup.howTo` is `undefined`; `expect(undefined).toContain('Setup:')` throws.

- [ ] **Step 3: Add `howTo` to the `Exercise` type**

In `src/types/domain.ts`, in `interface Exercise`, add a line immediately after `cues: string | null`:

```ts
  demoUrl: string | null
  cues: string | null
  howTo: string | null
  isActive: boolean
```

- [ ] **Step 4: Typecheck, verify it fails in exactly three places**

Run: `npm run typecheck`
Expected: FAIL — `testLibrary.ts` (`ex()` return), `progressionMap.spec.ts` (`exercise()` return), and `parseMovementLibrarySeed.ts` (pushed object), each missing `howTo`. No other files (the only other `Exercise` literals are `prescription.spec.ts`'s `as Exercise[]` casts, which carry `howTo` through their `...testExercises[0]` spread).

- [ ] **Step 5: Add `howTo: null` to the two test fixture defaults**

In `src/generators/__fixtures__/testLibrary.ts`, in the `ex()` helper's returned object, add after `cues: null,`:

```ts
    demoUrl: null,
    cues: null,
    howTo: null,
    isActive: true,
```

In `src/lib/progressionMap.spec.ts`, in the local `exercise()` helper's returned object, make the same edit after its `cues: null,`:

```ts
    demoUrl: null,
    cues: null,
    howTo: null,
    isActive: true,
```

- [ ] **Step 6: Default `howTo: null` in the parser's pushed object**

In `src/generators/__fixtures__/parseMovementLibrarySeed.ts`, in the `exercises.push({ … })` call inside the `for (const block of exerciseBlocks)` loop, add after `cues,`:

```ts
        demoUrl: null,
        cues,
        howTo: null,
        isActive: true,
```

- [ ] **Step 7: Add the `update`-overlay pass**

In the same file, immediately **after** the `for (const block of exerciseBlocks) { … }` loop closes (the `}` on its own line, before `const edges: ProgressionEdge[] = []`), insert:

```ts

  // how_to text is authored incrementally as `update exercises set how_to
  // = '…' where slug = '…'` statements after the inserts (see the
  // 2026-09-10 spec), not as a positional insert column — the insert
  // rowRe above is fragile and the migration needs this exact shape
  // anyway. Overlay it onto the exercises parsed above, keyed by slug.
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

- [ ] **Step 8: Typecheck, verify it passes**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Run the whole suite — only the new assertion should fail**

Run: `npm run test`
Expected: FAIL — **only** the `overlays how_to instructions…` test (the seed has no `update` statements yet, so `wallPushup.howTo` is `null`). Every other test passes — proves the plumbing did not break existing parsing (still 60 exercises).

- [ ] **Step 10: Append the how-to `update` block to the seed file**

At the **end** of `supabase/seed/001_movement_library.sql` (after the `exercise_contraindications` insert), append:

```sql

-- ── how-to instructions ──────────────────────────────────────────────────
-- Labeled-step "how to do it" text for the exercise detail page (see
-- src/lib/exerciseHowTo.ts + src/views/ExerciseView.vue), shown alongside
-- the one-line `cues`. Newline-separated "Label: detail" lines, the last
-- always a cautionary one. NO semicolons and NO double-hyphens in the
-- text (verify-sql.mjs's statement/comment stripping is not quote-aware).
-- This block is mirrored verbatim, minus nothing, in
-- supabase/migrations/0011_exercise_how_to.sql (which adds the column
-- first). Authored incrementally: 6 here now, the rest to follow.
update exercises set how_to =
'Setup: Stand a bit more than arm''s length from a wall and put your hands flat on it at shoulder height, a little wider than your shoulders.
Movement: Keep a straight line from head to heels and bend your elbows to bring your chest toward the wall, then push back to the start.
Common mistake: Letting your hips sag toward the wall or your head poke forward instead of moving as one plank.'
where slug = 'pushup_wall';

update exercises set how_to =
'Setup: Hang from a bar with your hands a little wider than your shoulders, palms facing away, arms fully straight.
Movement: Pull your shoulder blades down, then drive your elbows toward your ribs until your chin clears the bar. Lower all the way back to a dead hang under control.
Common mistake: Kicking or swinging to get up, or stopping short of straight arms at the bottom.'
where slug = 'pullup_full';

update exercises set how_to =
'Setup: Stand on one foot with the other leg held straight out in front of you and your arms reached forward as a counterweight.
Movement: Push your hips back and bend the standing knee to lower all the way down, keeping the free leg off the floor, then stand straight back up.
Common mistake: The raised heel dropping to the floor for balance, or the standing knee caving inward as you sink.'
where slug = 'squat_pistol';

update exercises set how_to =
'Setup: Rest on your forearms with your elbows under your shoulders and your legs straight out behind you, up on your toes.
Hold: Squeeze your glutes and brace your stomach so your body is one straight line from head to heels. Breathe normally.
Common mistake: Hips creeping up into a pike, or sagging toward the floor, instead of holding the line.'
where slug = 'plank_full';

update exercises set how_to =
'Setup: Get on your hands and knees facing away from the wall, feet against the baseboard, hands about a foot from the wall.
Getting up: Walk your feet up the wall while stepping your hands back toward it, until your hips stack over your shoulders and your chest is near the wall.
Hold: Push hard through your shoulders, squeeze your legs together, and look at the floor between your hands.
Common mistake: Keeping your hands too far from the wall, which bends your body into a banana instead of a straight line.'
where slug = 'handstand_wall_back';

update exercises set how_to =
'Setup: Kneel tall on something padded with your feet anchored under a heavy object or held down by a partner.
Lower: Keep a straight line from knees to head and lower your torso toward the floor as slowly as you can, resisting the whole way with your hamstrings.
At the bottom: Let yourself drop into a push-up position to catch the fall, then push off the floor and pull yourself back to the top.
Common mistake: Folding at the hips instead of lowering as one rigid line from knees to head.'
where slug = 'nordic_curl_negative';
```

- [ ] **Step 11: Run `verify:sql`**

Run: `npm run verify:sql`
Expected: PASS — `PASS — no structural issues found.` (`update` statements add no parens and no `select … where slug` lookups; paren balance and every existing check still hold.)

- [ ] **Step 12: Run the whole suite, verify green**

Run: `npm run test`
Expected: PASS — all tests, including `overlays how_to instructions…` (now `pushup_wall.howTo` is the multi-line string, `pushup_incline.howTo` is `null`).

- [ ] **Step 13: Document the column in `docs/schema.md`**

In `docs/schema.md`, in the **Movement library (`0003_movement_library.sql`)** paragraph, append one sentence:

```
`cues` is a one-line reminder; `how_to` (added in `0011`, authored for all 60) is the
labeled-step version the exercise page shows — newline-separated `Label: detail` lines
ending with a `Common mistake:` line, shipped as `update` statements in the seed and the
migration (no semicolons or `--` in the text: the SQL comment/statement stripping isn't
quote-aware).
```

- [ ] **Step 14: Typecheck + full verify**

Run: `npm run verify`
Expected: PASS (`typecheck`, `verify:sql`, and `test` all green).

- [ ] **Step 15: Commit**

```bash
git add src/types/domain.ts src/generators/__fixtures__/parseMovementLibrarySeed.ts src/generators/__fixtures__/testLibrary.ts src/lib/progressionMap.spec.ts src/generators/workout/generatePlan.integration.spec.ts supabase/seed/001_movement_library.sql docs/schema.md
git commit -m "Add how_to column + parser overlay + 6 sample descriptions"
```

---

### Task 3: Render `how_to` on the exercise page

**Files:**
- Modify: `src/views/ExerciseView.vue` (script: import + computed; template: the "How to do it" block and a new "Quick cue" block)

**Interfaces:**
- Consumes: `parseHowTo` / `HowToLine` from `src/lib/exerciseHowTo.ts` (Task 1); `Exercise.howTo` (Task 2).
- Produces: nothing consumed by later tasks.

**Model:** mid tier — one file, complete code below, plus a dev-server verification pass.

- [ ] **Step 1: Add the import and computed to the script**

In `src/views/ExerciseView.vue`, add to the imports (with the other `@/lib` imports):

```ts
import { parseHowTo } from '@/lib/exerciseHowTo'
```

Add after the `exercise` computed (`const exercise = computed(() => store.exercise(exerciseId.value))`):

```ts
const howToLines = computed(() => parseHowTo(exercise.value?.howTo))
```

- [ ] **Step 2: Replace the "How to do it" block in the template**

Find:

```html
      <h2 class="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">How to do it</h2>
      <p v-if="exercise.cues" class="mt-2 text-sm leading-relaxed text-ink">{{ exercise.cues }}</p>
      <p v-else class="mt-2 text-sm text-muted">No cues recorded for this exercise.</p>
```

Replace with:

```html
      <h2 class="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">How to do it</h2>
      <ul v-if="howToLines.length" class="mt-2 space-y-2">
        <li
          v-for="(line, i) in howToLines"
          :key="i"
          class="text-sm leading-relaxed text-ink"
          :class="{ 'rounded-lg bg-warn-wash px-3 py-2': line.isWarning }"
        >
          <span
            v-if="line.label"
            class="font-semibold"
            :class="line.isWarning ? 'text-warn' : 'text-ink'"
          >{{ line.label }}: </span>{{ line.detail }}
        </li>
      </ul>
      <p v-else-if="exercise.cues" class="mt-2 text-sm leading-relaxed text-ink">{{ exercise.cues }}</p>
      <p v-else class="mt-2 text-sm text-muted">No instructions recorded yet.</p>

      <template v-if="howToLines.length && exercise.cues">
        <h2 class="mt-6 text-sm font-semibold uppercase tracking-wide text-muted">Quick cue</h2>
        <p class="mt-2 text-sm text-muted">{{ exercise.cues }}</p>
      </template>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Run the full suite**

Run: `npm run test`
Expected: PASS — unchanged (no test targets this view; this is the project's convention for views).

- [ ] **Step 5: Build (production sanity) then run the dev server**

Run: `npm run build` — expected: succeeds, no type errors.

Verification is done in **`npm run dev`**, not `preview`: the exercise page's `store.exercise(id)` reads `exercisesById`, which `plan.ts`'s `loadActivePlan` only fills when there is an **active workout plan**. A fresh signed-out `preview` has no plan, so no exercise page renders. Dev mode has no intake auth gate (`authGateApplies` is `!import.meta.env.DEV && …`), so a plan can be generated as the local dev user. The `how_to` parse path (`parseMovementLibrarySeed`) is byte-identical in every build mode, so dev is representative for this change; Task 5's signed-in check on the real deployment closes the production-bundle gap.

Start the dev server (Browser pane): `preview_start` with a launch config running `npm run dev` (create `.claude/launch.json` if absent — `runtimeExecutable: "npm"`, `runtimeArgs: ["run", "dev"]`, `port: 5173`).

- [ ] **Step 6: Reset local content so the new seed re-runs**

`ensureMovementLibrarySeeded` early-returns if `db.movementPatterns.count() > 0` — an existing dev profile already holds the *old* parsed library with no `how_to`. In the Browser pane, clear it: DevTools → Application → IndexedDB → delete the `groundwork` database (or `javascript_tool`: `indexedDB.deleteDatabase('groundwork')`), then reload. Confirm via `read_console_messages` that `[devContentSeed] Seeding the movement library from the local seed file.` logged.

- [ ] **Step 7: Generate a plan and verify the 6 authored pages**

Complete intake (local dev user — no sign-in) to generate a workout + meal plan. A fresh
plan only contains floor-level exercises, so navigate to the 6 sample pages directly. The
route is `/exercises/:id` (plural). The dev parser assigns ids in seed-file order (reps
block, then time, then distance); the 6 are:
`pushup_wall` = `/exercises/1`, `pullup_full` = `/exercises/18`, `squat_pistol` = `/exercises/35`,
`nordic_curl_negative` = `/exercises/41`, `plank_full` = `/exercises/51`,
`handstand_wall_back` = `/exercises/56`. (If any shows "Exercise not found", the seed order
shifted — read the id from `db.exercises` in the console.) For each confirm:
- "How to do it" shows the labeled lines, each with a bold `Label:` lead-in.
- The final "Common mistake" line sits in a tinted (`bg-warn-wash`) rounded block with a `text-warn` label.
- A "Quick cue" section appears below it with the original one-liner.
- `read_console_messages` — no errors.

Then open an **unauthored** exercise (e.g. incline push-up) and confirm it still shows its `cues` sentence as the body, with **no** "Quick cue" section and not "No instructions recorded yet.".

- [ ] **Step 8: Screenshot for the checkpoint**

`computer` screenshot of two authored pages (one reps, one hold — e.g. pull-up and plank) showing the labeled steps + tinted mistake line + quick cue.

- [ ] **Step 9: Commit**

```bash
git add src/views/ExerciseView.vue .claude/launch.json
git commit -m "Render how_to labeled steps on the exercise page"
```

- [ ] **Step 10: CHECKPOINT — hand the screenshots to Kyle**

Stop here and report to Kyle: the 6 rendered pages (screenshots), and the authored text of all 6 (from the seed file). Ask him to react to voice, length, the label choices, and whether the "Common mistake" tint reads right. His feedback calibrates Task 4.

---

### Task 4: [CONTROLLER] The other 54 descriptions + migration `0011`

**This task is run by the controller, not a subagent** — it authors prose that depends on Kyle's calibration feedback from Task 3, the same way "apply a migration" is a controller step. Its inputs are fully specified: the 6 approved samples, the authoring standard in the spec, and Kyle's checkpoint notes.

**Files:**
- Modify: `supabase/seed/001_movement_library.sql` (extend the how-to `update` block from 6 to 60; tighten the block's header comment now that 0011 exists)
- Create: `supabase/migrations/0011_exercise_how_to.sql` (`alter table` + the identical 60 `update`s)
- Modify: `src/generators/__fixtures__/parseMovementLibrarySeed.ts` (`assertSeedShape` guard)
- Modify: `src/generators/workout/generatePlan.integration.spec.ts` (flip the "unauthored is null" assertion to "all 60 present")
- Modify: `docs/schema.md` (tighten the `how_to` sentence to present tense now that all 60 are authored and `0011` exists — see Step 7)

- [ ] **Step 1: Author the remaining 54** `update` statements in `supabase/seed/001_movement_library.sql`, appended to the block from Task 2, one per exercise not already covered. Follow the spec's **Authoring standard** and match the voice Kyle approved. Every statement: `update exercises set how_to =\n'…'\nwhere slug = '…';`, 2–4 `Label: detail` lines, last line `Common mistake:` / `Avoid:` / `Watch out:`, no `;` or `--` in the text, `''` for apostrophes.

- [ ] **Step 2: Add the `assertSeedShape` guard**

In `src/generators/__fixtures__/parseMovementLibrarySeed.ts`, in `assertSeedShape`, after the `bodyRegions` length check and before `if (problems.length > 0)`:

```ts
  const badHowTo = data.exercises.filter(
    (e) => !e.howTo || !/(^|\n)[ \t]*(common mistake|avoid|watch out):/i.test(e.howTo),
  )
  if (badHowTo.length > 0) {
    problems.push(`${badHowTo.length} exercise(s) with missing or malformed how_to: ${badHowTo.map((e) => e.slug).join(', ')}`)
  }
```

- [ ] **Step 3: Flip the integration assertion**

In `src/generators/workout/generatePlan.integration.spec.ts`, **replace the entire `it('overlays how_to instructions…', …)` block** added in Task 2 with this all-60 version:

```ts
  it('overlays how_to instructions onto every exercise, each ending with a cautionary line', () => {
    for (const e of seed.exercises) {
      expect(e.howTo, e.slug).toBeTruthy()
      expect(e.howTo, e.slug).toMatch(/(^|\n)[ \t]*(common mistake|avoid|watch out):/i)
    }
    // a multi-line value with colons round-trips intact
    const wallPushup = seed.exercises.find((e) => e.slug === 'pushup_wall')!
    expect(wallPushup.howTo).toContain('Setup:')
    expect(wallPushup.howTo).toContain('\nCommon mistake:')
  })
```

- [ ] **Step 4: Create the migration**

Create `supabase/migrations/0011_exercise_how_to.sql`:

```sql
-- Groundwork schema — migration 0011: exercise how_to instructions
-- Adds the labeled-step "how to do it" text shown on the exercise detail
-- page alongside the one-line `cues`. The update block below is identical
-- text to the "how-to instructions" block in
-- supabase/seed/001_movement_library.sql (kept in sync by hand, like the
-- rest of the movement library). See
-- docs/superpowers/specs/2026-09-10-exercise-how-to-design.md.
--
-- Content table, no RLS/trigger change: `exercises` is already
-- `to authenticated using (is_active)` (0009_rls.sql) and read-only from
-- the client; nothing here is user data.

alter table exercises add column how_to text;

update exercises set how_to =
'Setup: Stand a bit more than arm''s length from a wall and put your hands flat on it at shoulder height, a little wider than your shoulders.
Movement: Keep a straight line from head to heels and bend your elbows to bring your chest toward the wall, then push back to the start.
Common mistake: Letting your hips sag toward the wall or your head poke forward instead of moving as one plank.'
where slug = 'pushup_wall';

-- … the remaining 59, copied verbatim from the seed file's how-to block
```

The 60 `update`s must be **byte-identical** to the seed file's how-to block. Produce them by copying that block out of the seed file directly (not retyping).

- [ ] **Step 5: Verify**

```bash
npm run verify        # typecheck + verify:sql + test — all green; assertSeedShape now enforces 60/60
npm run build
```

Then in the dev server: reset local content (`indexedDB.deleteDatabase('groundwork')` + reload, as in Task 3 Step 6), regenerate a plan, and re-check a sample of exercises across all 8 patterns — every one shows labeled steps, no `cues`-only fallback, no "No instructions recorded yet.". `assertSeedShape` will already have failed the build/tests if any of the 60 is missing or lacks a cautionary line.

- [ ] **Step 6: Tighten the docs now that Task 4's end state is real**

Task 2's commit `508a776` softened two spots to not assert Task 4's end state early. Now restore the precise wording:

- `supabase/seed/001_movement_library.sql`, the `-- ── how-to instructions ──` header comment: change "added in a later task" / "the other 54 to follow" to reflect that 0011 exists and all 60 are authored.
- `docs/schema.md`, the Movement library paragraph's `how_to` sentence: it currently reads "It ships as `update` statements in `001_movement_library.sql` (and, for the live DB, migration `0011`)." — fine as-is, but you may restore "(authored for all 60)" after "labeled-step version" now that it's true.

- [ ] **Step 7: Commit**

```bash
git add supabase/seed/001_movement_library.sql supabase/migrations/0011_exercise_how_to.sql src/generators/__fixtures__/parseMovementLibrarySeed.ts src/generators/workout/generatePlan.integration.spec.ts docs/schema.md
git commit -m "Author how_to for all 60 exercises + 0011 migration"
```

- [ ] **Step 8: CHECKPOINT — Kyle skims all 60**

Give Kyle the full list (from the seed file). Apply any wording fixes he wants as follow-up commits before the merge.

---

### Task 5: [CONTROLLER] Whole-branch review, merge, then apply `0011` to the live DB

**Controller-run.** The live-DB apply happens *after* the merge — the migration file should be on `master` before it takes effect, and any content fix found in live verification is a small follow-up commit on `master`, not a branch revival.

- [ ] **Step 1: Whole-branch review**

Dispatch the final whole-branch code review (`superpowers:requesting-code-review`) over the full branch diff. Dispatch one fix subagent for any Critical/Important findings; carry Minor findings into the merge decision.

- [ ] **Step 2: Merge**

Use `superpowers:finishing-a-development-branch` to merge the feature branch to `master` (from the main checkout — `ExitWorktree({action: "keep"})` first if in a worktree) and remove the worktree. Push.

- [ ] **Step 3: Apply the migration to the live DB**

From the main checkout on `master`:

```bash
npx supabase db query --linked --file supabase/migrations/0011_exercise_how_to.sql
```

Expected: success, no error. (If `db query` rejects the multi-statement file, run the `alter table` line on its own first, then re-run the file for the `update`s.)

- [ ] **Step 4: Verify the column and content landed**

```bash
npx supabase db query --linked --query "select count(*) filter (where how_to is not null) as authored, count(*) as total from exercises"
```

Expected: `authored = 60`, `total = 60`.

```bash
npx supabase db query --linked --query "select how_to from exercises where slug = 'pushup_wall'"
```

Expected: the multi-line Wall push-up text.

- [ ] **Step 5: Verify the signed-in path**

Against the deployed app (or a local `npm run build && npm run preview` after resetting IndexedDB), sign in with a real account, open an exercise detail page, and confirm `how_to` renders from the Supabase pull — not the `cues` fallback. Check `read_console_messages` for pull errors. Confirm `docs/schema.md`'s note matches what shipped.

---

## Self-Review

**1. Spec coverage**

| Spec requirement | Task |
|---|---|
| `how_to text` column, nullable | Task 4 (migration `alter table`); type in Task 2 |
| Content as `update` statements, seed + migration identical | Task 2 (6), Task 4 (54 + migration) |
| `cues` untouched | Global Constraint; no task edits `cues` |
| Labeled-step format, last line cautionary | Authoring standard; enforced by `assertSeedShape` (Task 4) |
| "Common mistake" tint via `--color-warn(-wash)` | Task 3 template |
| `Exercise.howTo: string \| null` | Task 2 Step 3 |
| Parser overlay pass, insert `rowRe` untouched | Task 2 Steps 6–7 |
| `testLibrary.ts` default | Task 2 Step 5 |
| `sync.ts` / `devContentSeed.ts` unchanged | Not a task (verified by "no hand-mapping" constraint + `select('*')`) |
| `parseHowTo` pure helper + tests | Task 1 |
| `ExerciseView` render + Quick cue + fallbacks | Task 3 Step 2 |
| `assertSeedShape` guard (after all 60) | Task 4 Step 2 |
| `docs/schema.md` note | Task 2 Step 13 |
| Sample-first rollout + 2 checkpoints | Task 3 Step 10, Task 4 Step 7 |
| Whole-branch review + merge + live migration by controller | Task 5 |
| No new standalone parser spec — sanity assertions only | Task 2 Step 1 / Task 4 Step 3 |
| Out of scope: `demo_url`, `cues` edits, intake copy, branching | No task touches these |

No gaps.

**2. Placeholder scan**

Task 4 authors 54 descriptions not written out in this plan. This is deliberate and not a "fill in details" violation: Task 4 is a controller task gated on Kyle's Task 3 calibration feedback, with fully-specified inputs (6 approved samples + the spec's authoring standard). Writing 54 descriptions now would pre-empt the calibration loop that is the whole point of the sample-first rollout. Every code change in every task is given verbatim.

**3. Type consistency**

- `HowToLine { label: string; detail: string; isWarning: boolean }` — defined Task 1, consumed Task 3. Consistent.
- `parseHowTo(howTo: string | null | undefined): HowToLine[]` — signature identical in Task 1 def and Task 3 call (`parseHowTo(exercise.value?.howTo)` passes `string | null | undefined`). Consistent.
- `Exercise.howTo: string | null` — Task 2 Step 3; the parser default (`howTo: null`) and overlay (`target.howTo = string`) both satisfy it; `testLibrary` default (`howTo: null`) satisfies it.
- `assertSeedShape` regex `/(^|\n)[ \t]*(common mistake|avoid|watch out):/i` — same in Task 4 Step 2 and the Task 4 Step 3 test.
- `WARNING_LABEL` in `parseHowTo` is `/^(common mistake|avoid|watch out)\b/i` (matches a trimmed label); `assertSeedShape`'s is line-anchored against the raw string. Different anchoring on purpose (one runs on a parsed label, one on the whole text) — both accept the same three labels.
