# UI Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three-wave UI polish pass from `docs/superpowers/specs/2026-08-31-ui-polish-pass-design.md` — universal focus states and skeleton loaders, stat typography and micro-interactions, and a session streak plus dark-mode-as-default.

**Architecture:** Additive CSS/component changes layered onto the existing design-token system (`src/style.css`) and Pinia stores — no new dependencies, no schema changes. One new shared component (`Skeleton.vue`), one new pure function (`computeSessionStreak`), the rest is targeted edits to existing views.

**Tech Stack:** Vue 3 `<script setup>`, Tailwind v4 (CSS-first tokens, no `tailwind.config.js`), Pinia, Vitest.

## Global Constraints

- No new npm dependencies.
- Pure logic gets real Vitest unit tests; Dexie/Vue-reactive/CSS-visual changes get manual browser verification only — this project's established, deliberate testing convention (see `TASKS.md`).
- Every animation/transition must be a plain CSS `transition`/`animation` (never a JS-driven animation library) so the existing global `@media (prefers-reduced-motion: reduce)` rule in `src/style.css` (lines 214-222) continues to freeze it for free.
- Run `npm run typecheck` after every task that touches a `.vue` or `.ts` file — must stay clean throughout.
- Commit after every task.

---

## Task 1: Global focus-visible style

**Files:**
- Modify: `src/style.css` (insert after the `body { ... }` block, i.e. after line 103)

**Interfaces:**
- Produces: nothing consumed by other tasks — a standalone global CSS rule.

- [ ] **Step 1: Add the rule**

Insert immediately after the `body { ... }` block (after the closing `}` on line 103, before the `/* Safe-area utilities... */` comment on line 105):

```css

/* Visible keyboard focus on every interactive element, app-wide — 2026
   accessibility baseline, not optional (see the design spec this
   implements). :focus-visible, not :focus: the former only fires for
   keyboard/programmatic focus, not every mouse click, which is the
   actual goal — a ring for keyboard users, nothing distracting on tap. */
:focus-visible {
  outline: 2px solid var(--color-train);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: no output besides the `> groundwork@0.0.0 typecheck` / `> vue-tsc -b --noEmit` lines (no errors).

- [ ] **Step 3: Manual verification**

Start the dev server (`npm run dev`), open the app, and press Tab repeatedly from the address bar. Confirm a visible green-ish ring (the `--color-train` accent) appears around each focused nav link/button in sequence, and that clicking the same elements with a mouse does NOT show the ring.

- [ ] **Step 4: Commit**

```bash
git add src/style.css
git commit -m "Add global focus-visible style for keyboard navigation"
```

---

## Task 2: Skeleton component

**Files:**
- Create: `src/components/shared/Skeleton.vue`

**Interfaces:**
- Produces: `Skeleton.vue`, a component with props `{ width?: string; height?: string }` (both default to sizes below), rendering one pulsing block. Callers supply their own rounding via the normal `class` attribute (Vue's default fallthrough — do NOT declare `class` as an explicit prop, since that disables fallthrough and every call site in Tasks 3-8 relies on it).

- [ ] **Step 1: Create the component**

```vue
<script setup lang="ts">
// One reusable pulsing placeholder block, composed per-view into shapes
// roughly matching the content about to appear (see Tasks 3-8) — 2026
// UX research is explicit that content-heavy list/dashboard loads read
// as more premium with a skeleton than a spinner, since the layout is
// already implied before content arrives (spinners stay reserved for
// short blocking actions — Spinner.vue, untouched, still covers those).
// aria-hidden: this has no semantic content of its own; the real
// content that replaces it is what gets announced once loaded.
withDefaults(defineProps<{ width?: string; height?: string }>(), { width: '100%', height: '1rem' })
</script>

<template>
  <div class="animate-pulse bg-rule/60" :style="{ width, height }" aria-hidden="true" />
</template>
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/Skeleton.vue
git commit -m "Add reusable Skeleton placeholder component"
```

---

## Task 3: Skeleton loader in DashboardView.vue

**Files:**
- Modify: `src/views/DashboardView.vue`

**Interfaces:**
- Consumes: `Skeleton` from Task 2 (`{ width?: string; height?: string }` props, `class` for rounding via fallthrough).

- [ ] **Step 1: Import Skeleton and replace the spinner**

In the `<script setup>` block, change:

```ts
import Spinner from '@/components/shared/Spinner.vue'
```

to:

```ts
import Skeleton from '@/components/shared/Skeleton.vue'
```

In the `<template>`, replace:

```html
    <Spinner v-if="planStore.loading" class="mt-2" />
```

with:

```html
    <div v-if="planStore.loading" class="mt-1 space-y-2 lg:mt-8 lg:grid lg:grid-cols-2 lg:items-start lg:gap-10 lg:space-y-0">
      <section class="space-y-2">
        <Skeleton class="rounded-md" height="1.25rem" width="60%" />
        <Skeleton class="rounded-xl" height="4rem" />
        <Skeleton class="rounded-xl" height="4rem" />
        <Skeleton class="rounded-xl" height="4rem" />
      </section>
      <section class="space-y-2">
        <Skeleton class="rounded-md" height="1.25rem" width="40%" />
        <Skeleton class="rounded-xl" height="3.5rem" />
        <Skeleton class="rounded-xl" height="3.5rem" />
      </section>
    </div>
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

With the dev server running and a plan already generated locally, use browser devtools to throttle network or add a brief artificial delay, OR simply clear IndexedDB and reload mid-generation — confirm the skeleton shape appears (two side-by-side pulsing column shapes on desktop width, stacked on mobile width) before real content replaces it, and that nothing shifts position once real content loads in (same rule the design spec calls out: no layout jump between skeleton and real content).

- [ ] **Step 4: Commit**

```bash
git add src/views/DashboardView.vue
git commit -m "Replace Dashboard loading spinner with a skeleton"
```

---

## Task 4: Skeleton loader in WorkoutsView.vue

**Files:**
- Modify: `src/views/WorkoutsView.vue`

**Interfaces:**
- Consumes: `Skeleton` from Task 2.

- [ ] **Step 1: Import Skeleton and replace the spinner**

Change:

```ts
import Spinner from '@/components/shared/Spinner.vue'
```

to:

```ts
import Skeleton from '@/components/shared/Skeleton.vue'
```

Replace:

```html
    <Spinner v-if="planStore.loading" class="mt-2" />
```

with:

```html
    <div v-if="planStore.loading" class="mt-4 space-y-4">
      <Skeleton class="rounded-2xl" height="9rem" />
      <Skeleton class="rounded-xl" height="4rem" />
      <Skeleton class="rounded-xl" height="4rem" />
      <Skeleton class="rounded-xl" height="4rem" />
    </div>
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

Same approach as Task 3 — confirm the skeleton (one large card shape for block progress, three row shapes below) renders and swaps cleanly to real content with no layout jump.

- [ ] **Step 4: Commit**

```bash
git add src/views/WorkoutsView.vue
git commit -m "Replace Workouts loading spinner with a skeleton"
```

---

## Task 5: Skeleton loader in MealsView.vue

**Files:**
- Modify: `src/views/MealsView.vue`

**Interfaces:**
- Consumes: `Skeleton` from Task 2.

- [ ] **Step 1: Import Skeleton and replace the spinner**

Change:

```ts
import Spinner from '@/components/shared/Spinner.vue'
```

to:

```ts
import Skeleton from '@/components/shared/Skeleton.vue'
```

Replace:

```html
    <Spinner v-if="store.loading" class="mt-2" />
```

with:

```html
    <div v-if="store.loading" class="mt-4 space-y-5 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-6 lg:space-y-0">
      <section v-for="n in 7" :key="n" class="space-y-2">
        <Skeleton class="rounded-md" height="1rem" width="50%" />
        <Skeleton class="rounded-xl" height="4.5rem" />
      </section>
    </div>
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

Confirm 7 day-section-shaped skeletons render (2 columns on desktop, matching the real meal grid's own `lg:grid-cols-2`), swap cleanly to real content.

- [ ] **Step 4: Commit**

```bash
git add src/views/MealsView.vue
git commit -m "Replace Meals loading spinner with a skeleton"
```

---

## Task 6: Skeleton loader in GroceryView.vue

**Files:**
- Modify: `src/views/GroceryView.vue`

**Interfaces:**
- Consumes: `Skeleton` from Task 2.

- [ ] **Step 1: Import Skeleton and replace the spinner**

Change:

```ts
import Spinner from '@/components/shared/Spinner.vue'
```

to:

```ts
import Skeleton from '@/components/shared/Skeleton.vue'
```

Replace:

```html
    <Spinner v-if="store.loading" class="mt-2" />
```

with:

```html
    <div v-if="store.loading" class="mt-4 space-y-5 lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-6 lg:space-y-0">
      <section v-for="n in 3" :key="n" class="space-y-1">
        <Skeleton class="rounded-md" height="0.75rem" width="35%" />
        <Skeleton class="rounded-xl" height="2.75rem" />
        <Skeleton class="rounded-xl" height="2.75rem" />
      </section>
    </div>
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

Confirm 3 aisle-group-shaped skeletons render, swap cleanly to real content.

- [ ] **Step 4: Commit**

```bash
git add src/views/GroceryView.vue
git commit -m "Replace Grocery loading spinner with a skeleton"
```

---

## Task 7: Skeleton loader in RecipeView.vue

**Files:**
- Modify: `src/views/RecipeView.vue`

**Interfaces:**
- Consumes: `Skeleton` from Task 2.

- [ ] **Step 1: Import Skeleton and replace the spinner**

Change:

```ts
import Spinner from '@/components/shared/Spinner.vue'
```

to:

```ts
import Skeleton from '@/components/shared/Skeleton.vue'
```

Replace:

```html
    <Spinner v-if="store.loading" class="mt-4" />
```

with:

```html
    <div v-if="store.loading" class="mt-4 space-y-4">
      <Skeleton class="rounded-md" height="2rem" width="70%" />
      <Skeleton class="rounded-md" height="1rem" width="90%" />
      <div class="space-y-1.5">
        <Skeleton class="rounded-xl" height="2.5rem" />
        <Skeleton class="rounded-xl" height="2.5rem" />
        <Skeleton class="rounded-xl" height="2.5rem" />
        <Skeleton class="rounded-xl" height="2.5rem" />
      </div>
    </div>
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

Open a recipe link, confirm the title/summary/ingredient-row skeleton shapes render before real content.

- [ ] **Step 4: Commit**

```bash
git add src/views/RecipeView.vue
git commit -m "Replace Recipe loading spinner with a skeleton"
```

---

## Task 8: Skeleton loader in ExerciseView.vue

**Files:**
- Modify: `src/views/ExerciseView.vue`

**Interfaces:**
- Consumes: `Skeleton` from Task 2.

- [ ] **Step 1: Import Skeleton and replace the spinner**

Change:

```ts
import Spinner from '@/components/shared/Spinner.vue'
```

to:

```ts
import Skeleton from '@/components/shared/Skeleton.vue'
```

Replace:

```html
    <Spinner v-if="store.loading" class="mt-4" />
```

with:

```html
    <div v-if="store.loading" class="mt-4 space-y-3">
      <Skeleton class="rounded-md" height="1.75rem" width="60%" />
      <Skeleton class="rounded-2xl" height="9rem" />
      <Skeleton class="rounded-md" height="1rem" width="80%" />
      <Skeleton class="rounded-md" height="1rem" width="70%" />
    </div>
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

Open an exercise link, confirm the title/icon-box/cue-line skeleton shapes render before real content.

- [ ] **Step 4: Commit**

```bash
git add src/views/ExerciseView.vue
git commit -m "Replace Exercise loading spinner with a skeleton"
```

---

## Task 9: computeSessionStreak pure function

**Files:**
- Modify: `src/lib/workoutLogging.ts` (add alongside the existing `selectNextSession`/`sessionStatusFor`)
- Test: `src/lib/workoutLogging.spec.ts` (existing file — add new `describe` block)

**Interfaces:**
- Consumes: `PlanSession` (`{ id, planId, weekNumber, dayIndex, ... }`), `WorkoutLog` (`{ id, planSessionId: string | null, status: WorkoutLogStatus, ... }`) from `@/types/domain` — both already imported in `workoutLogging.ts`.
- Produces: `computeSessionStreak(sessions: readonly PlanSession[], logs: readonly WorkoutLog[]): number`, exported from `src/lib/workoutLogging.ts`. Consumed by Task 10.

- [ ] **Step 1: Read the existing test file's fixture style**

Open `src/lib/workoutLogging.spec.ts` and note its existing `session()`/fixture-builder pattern (it already has a `session(overrides)` helper matching `PlanSession`'s shape) — the new tests below reuse it rather than duplicating a fixture builder.

- [ ] **Step 2: Write the failing tests**

Add to `src/lib/workoutLogging.spec.ts` (after the existing `describe` blocks):

```ts
describe('computeSessionStreak', () => {
  function log(planSessionId: string, status: WorkoutLog['status']): WorkoutLog {
    return {
      id: `log-${planSessionId}`,
      userId: 'u1',
      planSessionId,
      performedAt: '2026-08-01T00:00:00.000Z',
      durationMinutes: null,
      sessionRpe: null,
      status,
      note: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    }
  }

  it('is 0 when there are no sessions at all', () => {
    expect(computeSessionStreak([], [])).toBe(0)
  })

  it('is 0 when no session has been logged yet', () => {
    const sessions = [session({ id: 's1', weekNumber: 1, dayIndex: 0 })]
    expect(computeSessionStreak(sessions, [])).toBe(0)
  })

  it('counts every completed session back to the most recent one reached', () => {
    const sessions = [
      session({ id: 's1', weekNumber: 1, dayIndex: 0 }),
      session({ id: 's2', weekNumber: 1, dayIndex: 2 }),
      session({ id: 's3', weekNumber: 1, dayIndex: 4 }),
    ]
    const logs = [log('s1', 'completed'), log('s2', 'completed'), log('s3', 'completed')]
    expect(computeSessionStreak(sessions, logs)).toBe(3)
  })

  it('is unaffected by the calendar gap between non-consecutive dayIndex values (rest days are not their own sessions)', () => {
    const sessions = [
      session({ id: 's1', weekNumber: 1, dayIndex: 0 }),
      session({ id: 's2', weekNumber: 3, dayIndex: 5 }), // a big schedule gap, still just "the next session"
    ]
    const logs = [log('s1', 'completed'), log('s2', 'completed')]
    expect(computeSessionStreak(sessions, logs)).toBe(2)
  })

  it('stops counting at the first skipped session, keeping only what comes after it', () => {
    const sessions = [
      session({ id: 's1', weekNumber: 1, dayIndex: 0 }),
      session({ id: 's2', weekNumber: 1, dayIndex: 2 }),
      session({ id: 's3', weekNumber: 1, dayIndex: 4 }),
    ]
    const logs = [log('s1', 'completed'), log('s2', 'skipped'), log('s3', 'completed')]
    expect(computeSessionStreak(sessions, logs)).toBe(1)
  })

  it('is 0 when the most recently reached session is only partial', () => {
    const sessions = [session({ id: 's1', weekNumber: 1, dayIndex: 0 }), session({ id: 's2', weekNumber: 1, dayIndex: 2 })]
    const logs = [log('s1', 'completed'), log('s2', 'partial')]
    expect(computeSessionStreak(sessions, logs)).toBe(0)
  })

  it('ignores sessions later in the plan that have not been reached yet', () => {
    const sessions = [
      session({ id: 's1', weekNumber: 1, dayIndex: 0 }),
      session({ id: 's2', weekNumber: 1, dayIndex: 2 }),
      session({ id: 's3', weekNumber: 1, dayIndex: 4 }),
    ]
    const logs = [log('s1', 'completed')]
    expect(computeSessionStreak(sessions, logs)).toBe(1)
  })

  it('is 1 at the very start of a block after just one completed session', () => {
    const sessions = [session({ id: 's1', weekNumber: 1, dayIndex: 0 })]
    expect(computeSessionStreak(sessions, [log('s1', 'completed')])).toBe(1)
  })
})
```

In `workoutLogging.spec.ts`, change:

```ts
import { buildSetLogsForItem, selectNextSession, sessionStatusFor } from './workoutLogging'
import type { PlanItem, PlanSession } from '@/types/domain'
```

to:

```ts
import { buildSetLogsForItem, computeSessionStreak, selectNextSession, sessionStatusFor } from './workoutLogging'
import type { PlanItem, PlanSession, WorkoutLog } from '@/types/domain'
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/workoutLogging.spec.ts`
Expected: FAIL — `computeSessionStreak is not defined` (or a TypeScript error to the same effect), since it doesn't exist yet.

- [ ] **Step 4: Implement**

Add to `src/lib/workoutLogging.ts`, after `selectNextSession`:

```ts

/**
 * How many of the most recently prescribed sessions, counting backward
 * from the latest one actually reached, were completed with nothing
 * partial or skipped in between. Deliberately NOT a calendar-day streak
 * — Strava/Hevy's daily-streak model assumes daily logging, but a
 * periodized 3-5-day/week plan has programmed rest days that would
 * break a naive "consecutive days" count for no real reason. Rest days
 * are simply not their own PlanSession rows, so consecutive `sessions`
 * entries are already only the scheduled training days regardless of
 * how many calendar days sit between them — no special-casing needed.
 * A session with no log at all is "not yet attempted", not "broken",
 * as long as it's not the most recent one reached (see the "ignores
 * sessions later in the plan" test). The most recently reached session
 * being only 'partial' (not fully checked off yet) reads as streak 0,
 * matching how Duolingo-style streaks only count once a day/session is
 * actually finished, not while it's still in progress.
 */
export function computeSessionStreak(sessions: readonly PlanSession[], logs: readonly WorkoutLog[]): number {
  const sorted = [...sessions].sort((a, b) => a.weekNumber - b.weekNumber || a.dayIndex - b.dayIndex)
  const statusBySessionId = new Map<string, WorkoutLogStatus>()
  for (const log of logs) {
    if (log.planSessionId) statusBySessionId.set(log.planSessionId, log.status)
  }

  let lastReachedIndex = -1
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (statusBySessionId.has(sorted[i].id)) {
      lastReachedIndex = i
      break
    }
  }
  if (lastReachedIndex === -1) return 0

  let streak = 0
  for (let i = lastReachedIndex; i >= 0; i--) {
    if (statusBySessionId.get(sorted[i].id) === 'completed') streak++
    else break
  }
  return streak
}
```

In `workoutLogging.ts`, change:

```ts
import type { PlanItem, PlanSession, SetLog, WorkoutLogStatus } from '@/types/domain'
```

to:

```ts
import type { PlanItem, PlanSession, SetLog, WorkoutLog, WorkoutLogStatus } from '@/types/domain'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/workoutLogging.spec.ts`
Expected: PASS, all tests including the 8 new ones.

- [ ] **Step 6: Commit**

```bash
git add src/lib/workoutLogging.ts src/lib/workoutLogging.spec.ts
git commit -m "Add computeSessionStreak, adapted for periodized programs not calendar days"
```

---

## Task 10: Wire sessionStreak into the plan store

**Files:**
- Modify: `src/stores/plan.ts`

**Interfaces:**
- Consumes: `computeSessionStreak` from Task 9; the store's existing private `sessions` and `workoutLogs` refs (already defined in this file).
- Produces: `sessionStreak` (a `ComputedRef<number>`) added to the store's returned object — consumed by Task 11.

- [ ] **Step 1: Import the function**

In `src/stores/plan.ts`, change:

```ts
import { buildSetLogsForItem, selectNextSession, sessionStatusFor } from '@/lib/workoutLogging'
```

to:

```ts
import { buildSetLogsForItem, computeSessionStreak, selectNextSession, sessionStatusFor } from '@/lib/workoutLogging'
```

- [ ] **Step 2: Add the computed**

Immediately after the existing `nextSession` computed (`const nextSession = computed(() => selectNextSession(sessions.value, completedSessionIds.value))`), add:

```ts

  /** See computeSessionStreak's own doc comment (workoutLogging.ts) for
   *  why this counts sessions, not calendar days. */
  const sessionStreak = computed(() => computeSessionStreak(sessions.value, workoutLogs.value))
```

- [ ] **Step 3: Expose it from the store**

In the store's final `return { ... }` object, add `sessionStreak,` immediately after the existing `nextSession,` line.

- [ ] **Step 4: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Run the full test suite to confirm nothing else broke**

Run: `npx vitest run`
Expected: PASS, same count as before plus the 8 new tests from Task 9.

- [ ] **Step 6: Commit**

```bash
git add src/stores/plan.ts
git commit -m "Expose sessionStreak from the plan store"
```

---

## Task 11: Display the streak on Dashboard

**Files:**
- Modify: `src/views/DashboardView.vue`

**Interfaces:**
- Consumes: `planStore.sessionStreak` (a `number`) from Task 10.

- [ ] **Step 1: Add the streak line**

Replace:

```html
    <h1 class="text-2xl font-semibold tracking-tight text-ink lg:text-3xl">Today</h1>
```

with:

```html
    <div class="flex items-baseline justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight text-ink lg:text-3xl">Today</h1>
      <p v-if="planStore.sessionStreak > 0" class="shrink-0 text-sm font-medium text-train">🔥 {{ planStore.sessionStreak }}-session streak</p>
    </div>
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

With a plan that has at least one completed session, load the Dashboard and confirm the streak line appears next to "Today" with the correct count. With a brand-new plan (nothing completed yet), confirm the streak line does NOT render at all (not even "0-session streak").

- [ ] **Step 4: Commit**

```bash
git add src/views/DashboardView.vue
git commit -m "Show session streak on the Dashboard header"
```

---

## Task 12: Dashboard stat typography

**Files:**
- Modify: `src/views/DashboardView.vue`

- [ ] **Step 1: Promote the today's-progress number**

Replace:

```html
            <p class="shrink-0 font-mono text-xs tabular-nums text-muted">
              {{ planStore.sessionProgress(displayedSession.id).done }}/{{ planStore.sessionProgress(displayedSession.id).total }} done
            </p>
```

with:

```html
            <p class="shrink-0 text-right">
              <span class="block font-mono text-2xl font-bold tabular-nums text-ink">{{ planStore.sessionProgress(displayedSession.id).done }}/{{ planStore.sessionProgress(displayedSession.id).total }}</span>
              <span class="block text-xs text-muted">done</span>
            </p>
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

Load the Dashboard with an active session, confirm the done/total count now renders noticeably larger and bolder than the plan-name text beside it, with "done" as a small label beneath it, and that nothing overlaps or wraps awkwardly at mobile width (375px).

- [ ] **Step 4: Commit**

```bash
git add src/views/DashboardView.vue
git commit -m "Promote Dashboard's today-progress number to oversized stat type"
```

---

## Task 13: Workouts stat typography

**Files:**
- Modify: `src/views/WorkoutsView.vue`

- [ ] **Step 1: Promote the block-progress number**

Replace:

```html
        <div class="flex items-center justify-between text-xs text-muted">
          <span>Block progress</span>
          <span class="font-mono tabular-nums">{{ planStore.blockProgress.done }}/{{ planStore.blockProgress.total }} sessions</span>
        </div>
```

with:

```html
        <div class="flex items-end justify-between">
          <span class="text-xs text-muted">Block progress</span>
          <span class="text-right">
            <span class="block font-mono text-xl font-bold tabular-nums text-ink">{{ planStore.blockProgress.done }}/{{ planStore.blockProgress.total }}</span>
            <span class="block text-[11px] text-muted">sessions</span>
          </span>
        </div>
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

Load Workouts, confirm the block-progress count renders larger/bolder than the "Block progress" label beside it, directly above the existing progress bar, with no visual cramping.

- [ ] **Step 4: Commit**

```bash
git add src/views/WorkoutsView.vue
git commit -m "Promote Workouts' block-progress number to oversized stat type"
```

---

## Task 14: Recipe macro stat-tile grid

**Files:**
- Modify: `src/views/RecipeView.vue`

- [ ] **Step 1: Replace the single-line macro readout with a stat-tile grid**

Replace:

```html
      <p v-if="macros" class="mt-2 font-mono text-xs tabular-nums text-muted">
        {{ Math.round(macros.kcal) }} kcal · {{ Math.round(macros.proteinG) }}g protein · {{ Math.round(macros.carbG) }}g carb · {{ Math.round(macros.fatG) }}g fat
      </p>
```

with (the same `dl`/`grid`/`text-center` pattern already established in `StepGoal.vue`'s "What that looks like" card, widened to 4 columns and given its own card wrapper since this one has no surrounding card today):

```html
      <dl v-if="macros" class="mt-2 grid grid-cols-4 gap-3 rounded-xl border border-rule bg-surface p-4 text-center shadow-card">
        <div>
          <dt class="text-xs text-muted">Calories</dt>
          <dd class="font-mono text-lg tabular-nums text-ink">{{ Math.round(macros.kcal) }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted">Protein</dt>
          <dd class="font-mono text-lg tabular-nums text-ink">{{ Math.round(macros.proteinG) }}g</dd>
        </div>
        <div>
          <dt class="text-xs text-muted">Carbs</dt>
          <dd class="font-mono text-lg tabular-nums text-ink">{{ Math.round(macros.carbG) }}g</dd>
        </div>
        <div>
          <dt class="text-xs text-muted">Fat</dt>
          <dd class="font-mono text-lg tabular-nums text-ink">{{ Math.round(macros.fatG) }}g</dd>
        </div>
      </dl>
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

Open a recipe, confirm the 4 macro values now render as a bordered/shadowed 4-column tile grid instead of one small text line, and that it doesn't overflow or wrap at mobile width (375px) — reduce to `grid-cols-2` at that width if it does (check before deciding this is needed; the values are short enough that 4 columns should fit at 375px, but verify rather than assume).

- [ ] **Step 4: Commit**

```bash
git add src/views/RecipeView.vue
git commit -m "Replace Recipe's macro line with a stat-tile grid"
```

---

## Task 15: Dashboard checkbox check-off flash

**Files:**
- Modify: `src/views/DashboardView.vue`

- [ ] **Step 1: Track which item was just checked**

In `<script setup>`, after the existing `const expandedItemId = ref<string | null>(null)` block, add:

```ts

// Brief background flash on check-off — a purposeful, short-lived
// micro-interaction on the one moment per exercise that matters most,
// not decoration on every hover. Cleared after 500ms; the flash color
// itself fades back out over the row's own `transition-[background-
// color]` (see the template change), so this only needs to control
// WHEN the flash class is removed, not animate anything imperatively.
const justCheckedId = ref<string | null>(null)
```

Replace the existing `onToggleItem` function:

```ts
function onToggleItem(item: PlanItem): void {
  if (!displayedSession.value) return
  planStore.toggleItemChecked(userId.value, displayedSession.value, item)
}
```

with:

```ts
function onToggleItem(item: PlanItem): void {
  if (!displayedSession.value) return
  const wasChecked = planStore.isItemChecked(item.id)
  planStore.toggleItemChecked(userId.value, displayedSession.value, item)
  if (!wasChecked) {
    justCheckedId.value = item.id
    setTimeout(() => {
      if (justCheckedId.value === item.id) justCheckedId.value = null
    }, 500)
  }
}
```

- [ ] **Step 2: Apply the flash class in the template**

Replace:

```html
            <li
              v-for="item in planStore.itemsForSession(displayedSession.id)"
              :key="item.id"
              class="rounded-xl border border-rule bg-surface px-4 py-3 shadow-card transition-shadow lg:hover:shadow-none lg:hover:bg-ground/60"
            >
```

with:

```html
            <li
              v-for="item in planStore.itemsForSession(displayedSession.id)"
              :key="item.id"
              class="rounded-xl border border-rule bg-surface px-4 py-3 shadow-card transition-[background-color,box-shadow] duration-300 lg:hover:shadow-none lg:hover:bg-ground/60"
              :class="{ 'bg-train-wash': justCheckedId === item.id }"
            >
```

- [ ] **Step 3: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual verification**

Check an exercise off on the Dashboard, confirm the row briefly flashes the accent-wash background color and smoothly fades back to normal over about a third of a second, and confirm unchecking it does NOT trigger the flash (only checking does).

- [ ] **Step 5: Commit**

```bash
git add src/views/DashboardView.vue
git commit -m "Add a brief check-off flash to Dashboard exercise rows"
```

---

## Task 16: Workouts checkbox check-off flash

**Files:**
- Modify: `src/views/WorkoutsView.vue`

- [ ] **Step 1: Track which item was just checked**

In `<script setup>`, after the existing `const expandedItemId = ref<string | null>(null)` block, add:

```ts

// Same brief check-off flash as DashboardView.vue — see that file's
// own comment on this same pattern for why.
const justCheckedId = ref<string | null>(null)
```

Replace the existing `onToggleItem` function:

```ts
function onToggleItem(planSession: PlanSession, item: PlanItem): void {
  planStore.toggleItemChecked(userId.value, planSession, item)
}
```

with:

```ts
function onToggleItem(planSession: PlanSession, item: PlanItem): void {
  const wasChecked = planStore.isItemChecked(item.id)
  planStore.toggleItemChecked(userId.value, planSession, item)
  if (!wasChecked) {
    justCheckedId.value = item.id
    setTimeout(() => {
      if (justCheckedId.value === item.id) justCheckedId.value = null
    }, 500)
  }
}
```

- [ ] **Step 2: Apply the flash class in the template**

Replace:

```html
            <li
              v-for="item in planStore.itemsForSession(s.id)"
              :key="item.id"
              class="rounded-xl border border-rule bg-surface px-4 py-3 shadow-card transition-shadow lg:hover:shadow-none lg:hover:bg-ground/60"
            >
```

with:

```html
            <li
              v-for="item in planStore.itemsForSession(s.id)"
              :key="item.id"
              class="rounded-xl border border-rule bg-surface px-4 py-3 shadow-card transition-[background-color,box-shadow] duration-300 lg:hover:shadow-none lg:hover:bg-ground/60"
              :class="{ 'bg-train-wash': justCheckedId === item.id }"
            >
```

- [ ] **Step 3: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual verification**

Same check as Task 15, on the Workouts view instead.

- [ ] **Step 5: Commit**

```bash
git add src/views/WorkoutsView.vue
git commit -m "Add a brief check-off flash to Workouts exercise rows"
```

---

## Task 17: Promotion banner transition — shared CSS + Dashboard

**Files:**
- Modify: `src/style.css`
- Modify: `src/views/DashboardView.vue`

**Interfaces:**
- Produces: global `.promo-enter-active`/`.promo-leave-active`/`.promo-enter-from`/`.promo-leave-to` classes, consumed by Task 18 too (kept in `style.css`, not duplicated per-component, since both Dashboard and Workouts need the identical transition).

- [ ] **Step 1: Add the shared transition CSS**

Insert into `src/style.css`, right after the `@media (prefers-reduced-motion: reduce) { ... }` block at the end of the file:

```css

/* Entrance/exit for the promotion banner (Dashboard + Workouts) — the
   app's one real "moment", worth a beat of polish instead of popping
   in/out instantly. Frozen for free by the reduced-motion rule above,
   since it's a plain CSS transition matched by that rule's universal
   selector. */
.promo-enter-active,
.promo-leave-active {
  transition:
    opacity 200ms ease-out,
    transform 200ms ease-out;
}
.promo-enter-from,
.promo-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
```

- [ ] **Step 2: Wrap Dashboard's promotion banner in a Transition**

Replace:

```html
          <div
            v-if="planStore.promotionMessages.length"
            class="mt-3 flex items-start justify-between gap-2 rounded-xl border border-train bg-train-wash px-3 py-2 text-xs text-train"
          >
            <ul class="space-y-1">
              <li v-for="(message, i) in planStore.promotionMessages" :key="i">{{ message }}</li>
            </ul>
            <button
              type="button"
              class="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-train/70 transition-colors hover:text-train"
              aria-label="Dismiss"
              @click="planStore.dismissPromotionMessages()"
            >
              <X :size="16" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
```

with:

```html
          <Transition name="promo">
            <div
              v-if="planStore.promotionMessages.length"
              class="mt-3 flex items-start justify-between gap-2 rounded-xl border border-train bg-train-wash px-3 py-2 text-xs text-train"
            >
              <ul class="space-y-1">
                <li v-for="(message, i) in planStore.promotionMessages" :key="i">{{ message }}</li>
              </ul>
              <button
                type="button"
                class="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-train/70 transition-colors hover:text-train"
                aria-label="Dismiss"
                @click="planStore.dismissPromotionMessages()"
              >
                <X :size="16" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
          </Transition>
```

- [ ] **Step 3: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual verification**

Complete a session on the Dashboard that triggers a promotion message, confirm the banner fades and slides in rather than appearing instantly, and confirm dismissing it (the X button) fades/slides it back out rather than vanishing instantly.

- [ ] **Step 5: Commit**

```bash
git add src/style.css src/views/DashboardView.vue
git commit -m "Add fade/slide transition to the promotion banner (Dashboard)"
```

---

## Task 18: Promotion banner transition — Workouts

**Files:**
- Modify: `src/views/WorkoutsView.vue`

**Interfaces:**
- Consumes: `.promo-*` CSS classes from Task 17 (already global, no import needed).

- [ ] **Step 1: Wrap Workouts' promotion banner in a Transition**

Replace:

```html
      <div v-if="planStore.promotionMessages.length" class="mt-4 flex items-start justify-between gap-2 rounded-xl border border-train bg-train-wash px-3 py-2 text-xs text-train">
        <ul class="space-y-1">
          <li v-for="(message, i) in planStore.promotionMessages" :key="i">{{ message }}</li>
        </ul>
        <button
          type="button"
          class="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-train/70 transition-colors hover:text-train"
          aria-label="Dismiss"
          @click="planStore.dismissPromotionMessages()"
        >
          <X :size="16" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
```

with:

```html
      <Transition name="promo">
        <div v-if="planStore.promotionMessages.length" class="mt-4 flex items-start justify-between gap-2 rounded-xl border border-train bg-train-wash px-3 py-2 text-xs text-train">
          <ul class="space-y-1">
            <li v-for="(message, i) in planStore.promotionMessages" :key="i">{{ message }}</li>
          </ul>
          <button
            type="button"
            class="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-train/70 transition-colors hover:text-train"
            aria-label="Dismiss"
            @click="planStore.dismissPromotionMessages()"
          >
            <X :size="16" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </Transition>
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

Same check as Task 17, on the Workouts view instead.

- [ ] **Step 4: Commit**

```bash
git add src/views/WorkoutsView.vue
git commit -m "Add fade/slide transition to the promotion banner (Workouts)"
```

---

## Task 19: Dark mode as default

**Files:**
- Modify: `src/style.css`

- [ ] **Step 1: Swap the token blocks**

Replace the entire span from the `@theme { ... }` block through the end of the `@media (prefers-color-scheme: dark) { ... }` block (lines 9-88 — everything between `@theme {` and the closing `}` that precedes `html,\nbody,\n#app {`) with:

```css
@theme {
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;

  --color-ground: #0e1513;
  --color-surface: #151e1b;
  --color-ink: #e7edea;
  --color-ink-soft: #c3cfca;
  --color-muted: #8fa09b;
  --color-rule: #25322e;

  --color-train: #57be9e;
  --color-train-wash: #16302a;
  --color-nutri: #cba95c;
  --color-nutri-wash: #2c2617;

  --color-warn: #e08a6b;
  --color-warn-wash: #33201a;

  /* Sidebar surface (desktop only, App.vue/SidebarNav.vue) — one step
   * off `surface` the same way `ground` is, so the sidebar reads as a
   * distinct panel next to the content column rather than card-on-card. */
  --color-panel: #101815;
}

:root {
  /* A dark shadow barely registers against an already-dark surface — it
   * just looks muddy rather than lifted. A subtle light hairline border
   * reads as "raised" just as clearly here, so the token becomes a
   * (transparent, i.e. no-op) shadow and shadow-card's own utility class
   * adds the border itself only in dark mode — which is the default now,
   * see the light override below for the real shadow value. */
  --shadow-card: 0 0 0 transparent;
}

:root[data-theme='light'] {
  --color-ground: #f6f8f7;
  --color-surface: #ffffff;
  --color-ink: #16201e;
  --color-ink-soft: #3d4c48;
  --color-muted: #66756f;
  --color-rule: #dce3e0;

  --color-train: #1f6f5c;
  --color-train-wash: #e4efea;
  --color-nutri: #8a6e2f;
  --color-nutri-wash: #f2ecdd;

  --color-warn: #a4472b;
  --color-warn-wash: #f7e7e1;

  --color-panel: #eef2f0;

  /* Card elevation — soft and diffuse (a soft shadow reads as lifted
   * without the harsh, dated drop-shadows of a decade ago). */
  --shadow-card: 0 1px 2px rgba(16, 24, 22, 0.04), 0 8px 24px -6px rgba(16, 24, 22, 0.1);
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme='dark']) {
    --color-ground: #f6f8f7;
    --color-surface: #ffffff;
    --color-ink: #16201e;
    --color-ink-soft: #3d4c48;
    --color-muted: #66756f;
    --color-rule: #dce3e0;

    --color-train: #1f6f5c;
    --color-train-wash: #e4efea;
    --color-nutri: #8a6e2f;
    --color-nutri-wash: #f2ecdd;

    --color-warn: #a4472b;
    --color-warn-wash: #f7e7e1;

    --color-panel: #eef2f0;
    --shadow-card: 0 1px 2px rgba(16, 24, 22, 0.04), 0 8px 24px -6px rgba(16, 24, 22, 0.1);
  }
}
```

- [ ] **Step 2: Verify typecheck stays clean**

Run: `npm run typecheck`
Expected: clean (this task is CSS-only, but confirms nothing else in the build broke).

- [ ] **Step 3: Manual verification — three states**

Using the browser's device-emulation "prefers-color-scheme" override (or OS-level setting):
1. No preference set at all → app should render dark by default.
2. Preference set to "light" → app should render light.
3. Preference set to "dark" → app should render dark (unchanged from before this task).

For each, spot-check that `--color-ground`, `--color-surface`, and `--shadow-card` resolve to the values shown above (via devtools computed-style inspection on `:root`), and that no card looks "muddy" (a light shadow accidentally left active under dark, or vice versa).

- [ ] **Step 4: Commit**

```bash
git add src/style.css
git commit -m "Make dark mode the default; light becomes the explicit override"
```

---

## Final verification (after all 19 tasks)

- [ ] Run `npx vitest run` — expect all tests passing, including the 8 new `computeSessionStreak` tests.
- [ ] Run `npm run build` — expect a clean production build.
- [ ] Push to GitHub (`git push origin master`) and confirm the AWS Amplify deploy succeeds.
- [ ] Do one full live pass on the deployed URL: tab through a form-heavy view and confirm focus rings, reload a few list views and confirm skeletons (not spinners) appear, check off an exercise and confirm the flash, view a recipe and confirm the macro tile grid, and confirm the app loads dark by default in a fresh incognito window with no stored preference.
