# Workout Calendar + Stretch Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a workout-completion calendar (a current-month grid on Train, a trailing-7-day strip on Today) and a daily morning-stretch check-in that's tracked separately from the existing session streak.

**Architecture:** The calendar is a pure read of existing `workout_logs` data through one new pure function, consumed by two small presentational pieces — no new backend. The stretch reminder is a genuinely new, minimally-scoped vertical slice (migration → Dexie table → small Pinia store → UI), following the exact sync conventions every other per-user table in this app already uses.

**Tech Stack:** Vue 3 `<script setup>`, Pinia, Tailwind v4, Dexie, Supabase/Postgres, Vitest.

## Global Constraints

- No new colors — every visual element reuses existing tokens (`bg-train-wash`, `text-train`, `border-train`, `text-muted`, `border-rule`, `bg-surface`, `shadow-card`).
- Calendar shows completed days only — no "missed/due" state (no data to back one; see spec's Context section).
- Train's calendar is current-month only — no prev/next navigation.
- Today's strip is workout-completion only — never shows stretch completion.
- Today's strip window is the trailing 7 days ending today, not a fixed calendar week.
- Stretch completion persists in a real, synced table — not browser-local storage.
- Stretch checkbox behaves like an exercise checkbox: stays visible and checked once done, toggleable both ways, never a dismissible/disappearing card.
- Every tap target stays at this app's established `min-h-11 min-w-11` (44px) convention.
- Pure logic (date math) gets real unit tests; Vue components and Pinia stores get manual/live verification — matches this codebase's existing, consistent split (confirmed: no store anywhere in this project has a dedicated `.spec.ts` file).

---

### Task 1: Relocate `dateMath.ts` to a shared location

**Files:**
- Create: `src/lib/dateMath.ts`
- Create: `src/lib/dateMath.spec.ts`
- Delete: `src/generators/meal/dateMath.ts`
- Modify: `src/generators/meal/assemble.ts:5`
- Modify: `src/generators/meal/grid.ts:4`
- Modify: `src/generators/meal/repair.ts:6`
- Modify: `src/generators/meal/scoring.ts:3`
- Modify: `src/generators/meal/validate.ts:3`
- Modify: `src/generators/meal/grid.spec.ts:5`

**Interfaces:**
- Produces: `addDays(iso: string, days: number): string` and `daysBetween(fromIso: string, toIso: string): number`, both from `@/lib/dateMath` — Task 2 imports these.

**Why this task exists:** `dateMath.ts` currently lives under `src/generators/meal/` and its own header comment frames it entirely around meal-plan date columns (`meal_plans.week_starts_on`, etc.). Task 2 needs the exact same pure, UTC-safe date-string math for the workout calendar — a second, unrelated caller that makes the meal-specific framing and location inaccurate. The functions themselves have zero meal-specific logic; only the doc comment and folder say "meal." This also closes a real, pre-existing gap: the file has never had its own test file, only exercised indirectly through the meal generator's own tests.

- [ ] **Step 1: Read the current file so the move is byte-exact**

Read `src/generators/meal/dateMath.ts`. Its current full contents:

```ts
/**
 * Pure UTC-based date-string math for yyyy-mm-dd values (meal_plans.week_
 * starts_on, meal_plan_entries.serve_on, user_recipe_feedback.last_served_on
 * — all `date`, never `timestamptz`). UTC specifically so a date string
 * never shifts by a day depending on the browser's local timezone — these
 * values represent a calendar day, not an instant.
 */

const MS_PER_DAY = 86_400_000

function parseDateUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  return new Date(parseDateUTC(iso) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDateUTC(toIso) - parseDateUTC(fromIso)) / MS_PER_DAY)
}
```

- [ ] **Step 2: Create `src/lib/dateMath.ts` with the relocated, re-framed content**

```ts
/**
 * Pure UTC-based date-string math for yyyy-mm-dd `date` values (never
 * `timestamptz`) — used across this app wherever a value represents a
 * calendar day rather than an instant: meal_plans.week_starts_on,
 * meal_plan_entries.serve_on, user_recipe_feedback.last_served_on, and
 * the workout-calendar month/week boundary math (src/lib/workoutCalendar.ts).
 * UTC specifically so a date string never shifts by a day depending on the
 * browser's local timezone.
 *
 * Originally lived under src/generators/meal/ with a meal-only framing —
 * moved here once a second, unrelated caller (the workout calendar) made
 * that location and framing inaccurate. The implementation is unchanged.
 */

const MS_PER_DAY = 86_400_000

function parseDateUTC(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

export function addDays(iso: string, days: number): string {
  return new Date(parseDateUTC(iso) + days * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseDateUTC(toIso) - parseDateUTC(fromIso)) / MS_PER_DAY)
}
```

- [ ] **Step 3: Delete the old file**

Delete `src/generators/meal/dateMath.ts`.

- [ ] **Step 4: Update all 6 importers to the new path**

In each of these files, change the import line exactly as shown (only the module specifier changes — the named imports stay the same):

`src/generators/meal/assemble.ts:5`
```ts
// before
import { addDays } from './dateMath'
// after
import { addDays } from '@/lib/dateMath'
```

`src/generators/meal/grid.ts:4`
```ts
// before
import { daysBetween } from './dateMath'
// after
import { daysBetween } from '@/lib/dateMath'
```

`src/generators/meal/repair.ts:6`
```ts
// before
import { addDays } from './dateMath'
// after
import { addDays } from '@/lib/dateMath'
```

`src/generators/meal/scoring.ts:3`
```ts
// before
import { daysBetween } from './dateMath'
// after
import { daysBetween } from '@/lib/dateMath'
```

`src/generators/meal/validate.ts:3`
```ts
// before
import { addDays } from './dateMath'
// after
import { addDays } from '@/lib/dateMath'
```

`src/generators/meal/grid.spec.ts:5`
```ts
// before
import { addDays } from './dateMath'
// after
import { addDays } from '@/lib/dateMath'
```

- [ ] **Step 5: Write `src/lib/dateMath.spec.ts` — the test file this function never had**

```ts
import { describe, expect, it } from 'vitest'

import { addDays, daysBetween } from './dateMath'

describe('addDays', () => {
  it('adds days within the same month', () => {
    expect(addDays('2026-09-08', 1)).toBe('2026-09-09')
  })

  it('subtracts days (negative input) — the trailing-7-days boundary case', () => {
    expect(addDays('2026-09-08', -6)).toBe('2026-09-02')
  })

  it('crosses a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
  })

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('adding zero returns the same date', () => {
    expect(addDays('2026-09-08', 0)).toBe('2026-09-08')
  })
})

describe('daysBetween', () => {
  it('counts whole days forward', () => {
    expect(daysBetween('2026-09-01', '2026-09-08')).toBe(7)
  })

  it('is negative when toIso is earlier than fromIso', () => {
    expect(daysBetween('2026-09-08', '2026-09-01')).toBe(-7)
  })

  it('is zero for the same date', () => {
    expect(daysBetween('2026-09-08', '2026-09-08')).toBe(0)
  })

  it('crosses a month boundary correctly', () => {
    expect(daysBetween('2026-08-25', '2026-09-05')).toBe(11)
  })
})
```

- [ ] **Step 6: Run the new test file**

Run: `npx vitest run src/lib/dateMath.spec.ts`
Expected: 9 tests passing (5 in `addDays`, 4 in `daysBetween`).

- [ ] **Step 7: Run the full meal-generator suite to confirm the relocation didn't break anything**

Run: `npx vitest run src/generators/meal`
Expected: same pass count as before this task (every existing meal-generator test still passes — the relocation changed only where these two functions live, not their behavior).

- [ ] **Step 8: Run typecheck**

Run: `npx vue-tsc -b --noEmit`
Expected: clean, no errors (confirms every import path update resolved correctly).

- [ ] **Step 9: Commit**

```bash
git add src/lib/dateMath.ts src/lib/dateMath.spec.ts src/generators/meal/assemble.ts src/generators/meal/grid.ts src/generators/meal/repair.ts src/generators/meal/scoring.ts src/generators/meal/validate.ts src/generators/meal/grid.spec.ts
git rm src/generators/meal/dateMath.ts
git commit -m "Relocate dateMath.ts to src/lib, add its first test file"
```

---

### Task 2: `workoutCalendar.ts` — the pure data function

**Files:**
- Create: `src/lib/workoutCalendar.ts`
- Create: `src/lib/workoutCalendar.spec.ts`

**Interfaces:**
- Consumes: `WorkoutLog` (from `@/types/domain`, already has `performedAt: string` and `status: WorkoutLogStatus`), `addDays`/`daysBetween` (from `@/lib/dateMath`, Task 1).
- Produces: `localDateString(date: Date): string` and `completedDatesInRange(logs: readonly WorkoutLog[], startDate: string, endDate: string): Set<string>`, both from `@/lib/workoutCalendar` — Task 3, Task 4, and Task 5 all import `localDateString`; Task 3 and Task 4 also import `completedDatesInRange`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/workoutCalendar.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'

import type { WorkoutLog } from '@/types/domain'

import { completedDatesInRange, localDateString } from './workoutCalendar'

function log(overrides: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id: 'log-1',
    userId: 'u1',
    planSessionId: 'session-1',
    performedAt: '2026-09-08T12:00:00.000Z',
    durationMinutes: null,
    sessionRpe: null,
    status: 'completed',
    note: null,
    updatedAt: '2026-09-08T12:00:00.000Z',
    ...overrides,
  }
}

describe('localDateString', () => {
  it('formats year-month-day with zero-padding, in local time', () => {
    // Constructed via the LOCAL Date constructor (not a UTC ISO string) so
    // this assertion holds regardless of which timezone the test runs in —
    // both the construction and the function under test read local time.
    expect(localDateString(new Date(2026, 0, 5, 10, 0))).toBe('2026-01-05')
  })

  it('does not roll over at local midnight boundaries', () => {
    expect(localDateString(new Date(2026, 8, 8, 23, 59))).toBe('2026-09-08')
    expect(localDateString(new Date(2026, 8, 9, 0, 0))).toBe('2026-09-09')
  })
})

describe('completedDatesInRange', () => {
  it('includes a completed log whose local date falls in range', () => {
    // Built the same way: a local Date going in, its own .toISOString()
    // as the "real" timestamptz value coming back out — so this is
    // guaranteed to round-trip to '2026-09-08' no matter the local
    // timezone the test suite runs under, which is the actual property
    // this function exists to guarantee (see its own doc comment).
    const performedAt = new Date(2026, 8, 8, 23, 30).toISOString()
    const result = completedDatesInRange([log({ performedAt })], '2026-09-08', '2026-09-08')
    expect(result).toEqual(new Set(['2026-09-08']))
  })

  it('excludes a log outside the requested range', () => {
    const result = completedDatesInRange([log({ performedAt: '2026-09-01T12:00:00.000Z' })], '2026-09-08', '2026-09-14')
    expect(result.size).toBe(0)
  })

  it('excludes a non-completed log even when its date is in range', () => {
    const result = completedDatesInRange(
      [log({ status: 'partial' }), log({ id: 'log-2', status: 'skipped' })],
      '2026-09-08',
      '2026-09-08',
    )
    expect(result.size).toBe(0)
  })

  it('deduplicates two completed logs on the same date into one entry', () => {
    const result = completedDatesInRange(
      [log({ id: 'log-1' }), log({ id: 'log-2', planSessionId: 'session-2' })],
      '2026-09-08',
      '2026-09-08',
    )
    expect(result).toEqual(new Set(['2026-09-08']))
  })

  it('is inclusive of both range boundaries', () => {
    const startLog = log({ performedAt: new Date(2026, 8, 1, 8, 0).toISOString() })
    const endLog = log({ id: 'log-2', performedAt: new Date(2026, 8, 30, 8, 0).toISOString() })
    const result = completedDatesInRange([startLog, endLog], '2026-09-01', '2026-09-30')
    expect(result).toEqual(new Set(['2026-09-01', '2026-09-30']))
  })

  it('returns an empty set for no logs', () => {
    expect(completedDatesInRange([], '2026-09-01', '2026-09-30')).toEqual(new Set())
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/workoutCalendar.spec.ts`
Expected: FAIL — `Cannot find module './workoutCalendar'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/lib/workoutCalendar.ts`:

```ts
import { daysBetween } from '@/lib/dateMath'
import type { WorkoutLog } from '@/types/domain'

/** yyyy-mm-dd for a Date, in the VIEWER'S OWN local timezone — never
 *  `date.toISOString().slice(0, 10)`, which reads the UTC date and would
 *  misdate anyone whose local midnight doesn't line up with UTC's. Zero-
 *  padded so string comparison ('2026-09-08' < '2026-09-09') sorts
 *  correctly, matching every other yyyy-mm-dd value in this app. */
export function localDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Every LOCAL calendar date (yyyy-mm-dd) with at least one completed
 * workout log, restricted to [startDate, endDate] inclusive (both
 * yyyy-mm-dd, compared via dateMath's UTC-safe daysBetween — startDate/
 * endDate are pure calendar dates with no timezone of their own, unlike
 * performedAt). Pure: no Date.now(), no store access — callers pass in
 * `logs` and the range explicitly.
 */
export function completedDatesInRange(logs: readonly WorkoutLog[], startDate: string, endDate: string): Set<string> {
  const dates = new Set<string>()
  for (const l of logs) {
    if (l.status !== 'completed') continue
    const date = localDateString(new Date(l.performedAt))
    if (daysBetween(startDate, date) < 0) continue
    if (daysBetween(date, endDate) < 0) continue
    dates.add(date)
  }
  return dates
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/workoutCalendar.spec.ts`
Expected: PASS — 8 tests (2 in `localDateString`, 6 in `completedDatesInRange`).

- [ ] **Step 5: Run typecheck**

Run: `npx vue-tsc -b --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/workoutCalendar.ts src/lib/workoutCalendar.spec.ts
git commit -m "Add workoutCalendar.ts: pure completed-dates lookup for the calendar"
```

---

### Task 3: Train — `WorkoutCalendar.vue`

**Files:**
- Create: `src/components/workout/WorkoutCalendar.vue`
- Modify: `src/views/WorkoutsView.vue`

**Interfaces:**
- Consumes: `completedDatesInRange`, `localDateString` (from `@/lib/workoutCalendar`, Task 2), `addDays` (from `@/lib/dateMath`, Task 1), `planStore.workoutLogs` (already exists, returned from `usePlanStore()`).
- Produces: nothing further tasks depend on — this is a leaf UI piece.

- [ ] **Step 1: Create `src/components/workout/WorkoutCalendar.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  /** First of the month to render, any time-of-day (only year/month are read). */
  monthDate: Date
  completedDates: ReadonlySet<string>
}>()

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// One cell per grid position: nulls for the empty leading/trailing cells
// outside the actual month, so the grid always renders a clean multiple
// of 7 columns regardless of what day of the week the month starts on.
const cells = computed(() => {
  const year = props.monthDate.getFullYear()
  const month = props.monthDate.getMonth()
  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month

  const result: ({ day: number; dateStr: string; isToday: boolean } | null)[] = []
  for (let i = 0; i < firstWeekday; i++) result.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    result.push({ day, dateStr, isToday: isCurrentMonth && today.getDate() === day })
  }
  return result
})

const monthLabel = computed(() => props.monthDate.toLocaleDateString(undefined, { month: 'long' }))
</script>

<template>
  <div>
    <h3 class="text-sm font-semibold text-ink">{{ monthLabel }}</h3>
    <div class="mt-2 grid grid-cols-7 gap-1">
      <span v-for="(label, i) in DAY_LABELS" :key="i" class="text-center text-[10px] font-medium text-muted">{{ label }}</span>
      <template v-for="(cell, i) in cells" :key="i">
        <div v-if="cell === null"></div>
        <div
          v-else
          class="flex aspect-square items-center justify-center rounded-lg text-xs font-medium"
          :class="[
            completedDates.has(cell.dateStr) ? 'bg-train-wash text-train font-semibold' : 'text-ink',
            cell.isToday ? 'border border-train' : '',
          ]"
        >
          {{ cell.day }}
        </div>
      </template>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Read the current relevant section of `WorkoutsView.vue`**

The section this task inserts after (currently `src/views/WorkoutsView.vue:86-106`):

```vue
      <div class="mt-4 rounded-2xl border border-rule bg-surface p-4 shadow-card lg:mt-6">
        <div class="flex items-end justify-between">
          <span class="text-xs text-muted">Block progress</span>
          <span class="text-right">
            <span class="block font-mono text-xl font-bold tabular-nums text-ink">{{ planStore.blockProgress.done }}/{{ planStore.blockProgress.total }}</span>
            <span class="block text-[11px] text-muted">sessions</span>
          </span>
        </div>
        <div class="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-rule">
          <div class="h-full rounded-full bg-train transition-[width] duration-500" :style="{ width: blockPercent() + '%' }"></div>
        </div>

        <div class="mt-4 flex items-end gap-2" aria-label="Weekly progress">
          <div v-for="week in weekNumbers" :key="week" class="flex flex-1 flex-col items-center gap-1">
            <div class="flex h-14 w-full items-end overflow-hidden rounded-lg bg-rule">
              <div class="w-full rounded-lg bg-train transition-[height] duration-500" :style="{ height: weekPercent(week) + '%' }"></div>
            </div>
            <span class="font-mono text-[11px] tabular-nums text-muted">{{ planStore.weekProgress.get(week)?.done ?? 0 }}/{{ planStore.weekProgress.get(week)?.total ?? 0 }}</span>
          </div>
        </div>
      </div>

      <div class="mt-4 flex gap-2">
```

- [ ] **Step 3: Insert the calendar section, right after the block-progress card and before the week-selector buttons**

Replace that exact block with:

```vue
      <div class="mt-4 rounded-2xl border border-rule bg-surface p-4 shadow-card lg:mt-6">
        <div class="flex items-end justify-between">
          <span class="text-xs text-muted">Block progress</span>
          <span class="text-right">
            <span class="block font-mono text-xl font-bold tabular-nums text-ink">{{ planStore.blockProgress.done }}/{{ planStore.blockProgress.total }}</span>
            <span class="block text-[11px] text-muted">sessions</span>
          </span>
        </div>
        <div class="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-rule">
          <div class="h-full rounded-full bg-train transition-[width] duration-500" :style="{ width: blockPercent() + '%' }"></div>
        </div>

        <div class="mt-4 flex items-end gap-2" aria-label="Weekly progress">
          <div v-for="week in weekNumbers" :key="week" class="flex flex-1 flex-col items-center gap-1">
            <div class="flex h-14 w-full items-end overflow-hidden rounded-lg bg-rule">
              <div class="w-full rounded-lg bg-train transition-[height] duration-500" :style="{ height: weekPercent(week) + '%' }"></div>
            </div>
            <span class="font-mono text-[11px] tabular-nums text-muted">{{ planStore.weekProgress.get(week)?.done ?? 0 }}/{{ planStore.weekProgress.get(week)?.total ?? 0 }}</span>
          </div>
        </div>
      </div>

      <div class="mt-4 rounded-2xl border border-rule bg-surface p-4 shadow-card">
        <WorkoutCalendar :month-date="new Date()" :completed-dates="monthCompletedDates" />
      </div>

      <div class="mt-4 flex gap-2">
```

- [ ] **Step 4: Add the import and the `monthCompletedDates` computed to `WorkoutsView.vue`'s script**

In `src/views/WorkoutsView.vue`, add to the imports (after the existing `ProgressionLadder` import, `src/views/WorkoutsView.vue:7`):

```ts
// before
import ProgressionLadder from '@/components/workout/ProgressionLadder.vue'
import SetLogEditor from '@/components/workout/SetLogEditor.vue'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { buildProgressionMap } from '@/lib/progressionMap'
// after
import ProgressionLadder from '@/components/workout/ProgressionLadder.vue'
import SetLogEditor from '@/components/workout/SetLogEditor.vue'
import WorkoutCalendar from '@/components/workout/WorkoutCalendar.vue'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { buildProgressionMap } from '@/lib/progressionMap'
import { completedDatesInRange, localDateString } from '@/lib/workoutCalendar'
```

Then add this computed right after `progressions` (`src/views/WorkoutsView.vue:33`, immediately before `function weekPercent`):

```ts
const monthCompletedDates = computed(() => {
  const now = new Date()
  const firstOfMonth = localDateString(new Date(now.getFullYear(), now.getMonth(), 1))
  const lastOfMonth = localDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  return completedDatesInRange(planStore.workoutLogs, firstOfMonth, lastOfMonth)
})
```

This file only needs `completedDatesInRange`/`localDateString` — month boundaries are computed directly via the `Date` constructor above, not `addDays` (Task 4 is the one that needs `addDays`, in `DashboardView.vue`).

- [ ] **Step 5: Run typecheck**

Run: `npx vue-tsc -b --noEmit`
Expected: clean.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: 419 passing (402 baseline + 9 from Task 1's `dateMath.spec.ts` + 8 from Task 2's `workoutCalendar.spec.ts`) — this task adds no new tests itself, `WorkoutCalendar.vue` is presentational and verified live in Step 7.

- [ ] **Step 7: Live-verify in the browser**

Start the dev server, sign in (or use the local-dev fallback), navigate to `/workouts` with an active plan that has at least one completed session. Confirm: the calendar renders the current month with correct day-of-week alignment (the 1st lands under the correct weekday), the day(s) with a completed session show the teal `bg-train-wash` fill, today has a visible ring regardless of completion state, and the layout matches the app's card styling (rounded corners, border, shadow) consistent with the block-progress card above it.

- [ ] **Step 8: Commit**

```bash
git add src/components/workout/WorkoutCalendar.vue src/views/WorkoutsView.vue
git commit -m "Add WorkoutCalendar.vue: current-month completed-days grid on Train"
```

---

### Task 4: Today — the trailing-7-day strip

**Files:**
- Modify: `src/views/DashboardView.vue`

**Interfaces:**
- Consumes: `completedDatesInRange`, `localDateString` (from `@/lib/workoutCalendar`, Task 2), `addDays` (from `@/lib/dateMath`, Task 1), `planStore.workoutLogs` (already exists).
- Produces: nothing further tasks depend on.

- [ ] **Step 1: Add imports to `src/views/DashboardView.vue`**

```ts
// before (src/views/DashboardView.vue:1-13)
<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'

import Alert from '@/components/shared/Alert.vue'
import Skeleton from '@/components/shared/Skeleton.vue'
import SetLogEditor from '@/components/workout/SetLogEditor.vue'
import { findClosestToPromotion } from '@/lib/progressionMap'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { useMealPlanStore } from '@/stores/mealPlan'
import { usePlanStore } from '@/stores/plan'
import { useSessionStore } from '@/stores/session'
import type { MealSlot, PlanItem } from '@/types/domain'

// after
<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { computed, onMounted, ref, watch } from 'vue'

import Alert from '@/components/shared/Alert.vue'
import Skeleton from '@/components/shared/Skeleton.vue'
import SetLogEditor from '@/components/workout/SetLogEditor.vue'
import { addDays } from '@/lib/dateMath'
import { findClosestToPromotion } from '@/lib/progressionMap'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { completedDatesInRange, localDateString } from '@/lib/workoutCalendar'
import { useMealPlanStore } from '@/stores/mealPlan'
import { usePlanStore } from '@/stores/plan'
import { useSessionStore } from '@/stores/session'
import type { MealSlot, PlanItem } from '@/types/domain'
```

- [ ] **Step 2: Add the strip's data computed**

Add this right after `closestToPromotion` (the last computed in the script block, `src/views/DashboardView.vue:114-117`, immediately before the closing `</script>`):

```ts
// Trailing 7 days ending today (not a fixed Mon–Sun week) — this strip
// always reads as "recent momentum" regardless of what day it is, unlike
// a fixed calendar week that would show a mostly-empty strip every
// Monday. Recomputed fresh on each mount, not stored.
const weekStripDays = computed(() => {
  const today = localDateString(new Date())
  const days: { dateStr: string; label: string; dayNumber: number; isToday: boolean }[] = []
  for (let i = 6; i >= 0; i--) {
    const dateStr = addDays(today, -i)
    const [, , dayPart] = dateStr.split('-')
    const label = new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })
    days.push({ dateStr, label, dayNumber: Number(dayPart), isToday: dateStr === today })
  }
  return days
})
const weekStripCompletedDates = computed(() => {
  const today = localDateString(new Date())
  const sevenDaysAgo = addDays(today, -6)
  return completedDatesInRange(planStore.workoutLogs, sevenDaysAgo, today)
})
```

- [ ] **Step 3: Insert the strip markup at the very top of the template**

The current header block (`src/views/DashboardView.vue:120-129`):

```vue
<template>
  <div class="p-4 lg:p-0">
    <div class="flex items-baseline justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight text-ink lg:text-3xl">Today</h1>
      <p v-if="planStore.sessionStreak > 0" class="shrink-0 text-sm font-medium text-train">🔥 {{ planStore.sessionStreak }}-session streak</p>
    </div>
    <Alert v-if="closestToPromotion" variant="success" class="mt-1">
      🎯 One more good <span class="font-medium">{{ closestToPromotion.patternName }}</span> session to level up
    </Alert>
```

Replace with (strip inserted between the header row and the promotion `Alert`):

```vue
<template>
  <div class="p-4 lg:p-0">
    <div class="flex items-baseline justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight text-ink lg:text-3xl">Today</h1>
      <p v-if="planStore.sessionStreak > 0" class="shrink-0 text-sm font-medium text-train">🔥 {{ planStore.sessionStreak }}-session streak</p>
    </div>

    <div class="mt-3 grid grid-cols-7 gap-1.5">
      <div v-for="d in weekStripDays" :key="d.dateStr" class="text-center">
        <span class="block text-[10px] font-medium text-muted">{{ d.label }}</span>
        <span
          class="mt-0.5 flex aspect-square items-center justify-center rounded-lg text-xs font-medium"
          :class="[
            weekStripCompletedDates.has(d.dateStr) ? 'bg-train-wash text-train font-semibold' : 'text-ink',
            d.isToday ? 'border border-train' : '',
          ]"
        >
          {{ d.dayNumber }}
        </span>
      </div>
    </div>

    <Alert v-if="closestToPromotion" variant="success" class="mt-3">
      🎯 One more good <span class="font-medium">{{ closestToPromotion.patternName }}</span> session to level up
    </Alert>
```

- [ ] **Step 4: Run typecheck**

Run: `npx vue-tsc -b --noEmit`
Expected: clean.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: 419 passing, same as after Task 3 (no new tests this task — presentational, verified live in Step 6).

- [ ] **Step 6: Live-verify in the browser**

Navigate to `/` (Today) with an active plan that has at least one completed session within the last 7 days. Confirm: the strip shows 7 cells labeled with single-letter weekday initials, the correct dates (today's cell shows today's actual day-of-month number and the ring), a completed day within the window shows the teal fill, and the strip renders even for an account with no plan yet (empty fill everywhere, no errors). Also confirm it still renders correctly with zero completed sessions in the window (no teal cells, no visual breakage).

- [ ] **Step 7: Commit**

```bash
git add src/views/DashboardView.vue
git commit -m "Add trailing-7-day workout strip to the top of Today"
```

---

### Task 5: Stretch reminder — migration, store, and UI

**Files:**
- Create: `supabase/migrations/0011_stretch_logs.sql`
- Modify: `src/types/domain.ts:224` (insert after `WorkoutLog`)
- Modify: `src/lib/db.ts`
- Create: `src/stores/stretch.ts`
- Modify: `src/views/DashboardView.vue`
- Modify: `docs/schema.md`

**Interfaces:**
- Consumes: `localDateString` (from `@/lib/workoutCalendar`, Task 2), `pushRow`/`pullEntityRows`/`fromRow` (from `@/lib/sync`, already exist), `LOCAL_DEV_USER_ID` (from `@/lib/localUser`, already exists), `supabase` (from `@/lib/supabase`, already exists).
- Produces: `useStretchStore()` returning `{ todayCompleted: Ref<boolean>, warnings: Ref<string[]>, loadToday(userId: string): Promise<void>, toggleToday(userId: string): Promise<void> }` — nothing later in this plan depends on it (this is the last task), but note the exact shape for anyone extending this later.

**Note for whoever implements this task:** the migration FILE is your deliverable — do not run it against the real Supabase project yourself. The controller applies it separately (`supabase db query --linked --file supabase/migrations/0011_stretch_logs.sql`) after reviewing the file, the same way every other migration in this project has been applied. Write the file, and structure your local testing (Steps 6-7 below) so it works entirely against Dexie without needing the migration live yet — the `LOCAL_DEV_USER_ID` path never touches Supabase at all, which is exactly what makes this possible.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0011_stretch_logs.sql`:

```sql
-- Groundwork schema — migration 0011: daily stretch check-in
-- See docs/schema.md's "Stretch log" section note. One row = "stretched
-- that day" — pure presence/absence, no updated_at (nothing is ever
-- updated in place, only inserted or deleted).

create table stretch_logs (
  user_id      uuid not null references profiles on delete cascade,
  date         date not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table stretch_logs enable row level security;
create policy owner_all on stretch_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

- [ ] **Step 2: Add the `StretchLog` domain type**

In `src/types/domain.ts`, insert immediately after `WorkoutLog`'s closing brace (currently line 224, right before `export interface SetLog {` at line 226):

```ts
export interface StretchLog {
  userId: string
  date: string // yyyy-mm-dd, local calendar date — see src/lib/workoutCalendar.ts
  completedAt: string // timestamptz, ISO
}
```

- [ ] **Step 3: Bump `db.ts` to version 5**

In `src/lib/db.ts`, add `StretchLog` to the type import list (alphabetically, after `SetLog`):

```ts
// before
  SetLog,
  Unit,
// after
  SetLog,
  StretchLog,
  Unit,
```

Add the table declaration after the `userTargets` line (currently `src/lib/db.ts:124`, right before the `syncMeta` comment):

```ts
// before
  profiles!: EntityTable<Profile, 'id'>
  userTargets!: EntityTable<UserTargets, 'userId'>

  /** table name -> ISO timestamp of the last successful pull from Supabase. */
  syncMeta!: EntityTable<{ table: string; lastSyncedAt: string }, 'table'>
// after
  profiles!: EntityTable<Profile, 'id'>
  userTargets!: EntityTable<UserTargets, 'userId'>

  // ── v5: stretch reminder ──────────────────────────────────────────────
  stretchLogs!: Table<StretchLog, [string, string]>

  /** table name -> ISO timestamp of the last successful pull from Supabase. */
  syncMeta!: EntityTable<{ table: string; lastSyncedAt: string }, 'table'>
```

Add the version block after `this.version(4)` (currently `src/lib/db.ts:192-196`):

```ts
// before
    this.version(4).stores({
      // ── per-user state: written offline, synced up when connected ────
      profiles: '&id',
      userTargets: '&userId',
    })
  }
}
// after
    this.version(4).stores({
      // ── per-user state: written offline, synced up when connected ────
      profiles: '&id',
      userTargets: '&userId',
    })

    this.version(5).stores({
      // ── per-user state: written offline, synced up when connected ────
      stretchLogs: '[userId+date], userId',
    })
  }
}
```

- [ ] **Step 4: Write `src/stores/stretch.ts`**

```ts
import { ref } from 'vue'
import { defineStore } from 'pinia'

import { db } from '@/lib/db'
import { LOCAL_DEV_USER_ID } from '@/lib/localUser'
import { supabase } from '@/lib/supabase'
import { fromRow, pullEntityRows, pushRow } from '@/lib/sync'
import { localDateString } from '@/lib/workoutCalendar'
import type { StretchLog } from '@/types/domain'

/**
 * Deliberately its own tiny store, not folded into plan.ts — stretching
 * isn't tied to having an active workout plan at all (see the design
 * spec's Decisions section). Tracks only TODAY's own completion; there's
 * no history view for this yet (see the spec's Out of scope section), so
 * nothing beyond `todayCompleted` needs to be reactive.
 */
export const useStretchStore = defineStore('stretch', () => {
  const todayCompleted = ref(false)
  const warnings = ref<string[]>([])

  async function loadToday(userId: string): Promise<void> {
    const today = localDateString(new Date())

    if (userId !== LOCAL_DEV_USER_ID) {
      const remoteRows = await pullEntityRows('stretch_logs', userId, null, null)
      if (remoteRows) {
        await db.stretchLogs.bulkPut(remoteRows.map((r) => fromRow<StretchLog>(r)))
      }
    }

    const row = await db.stretchLogs.get([userId, today])
    todayCompleted.value = row !== undefined
  }

  async function toggleToday(userId: string): Promise<void> {
    const today = localDateString(new Date())

    if (todayCompleted.value) {
      await db.stretchLogs.delete([userId, today])
      todayCompleted.value = false
      if (userId !== LOCAL_DEV_USER_ID) {
        try {
          const { error } = await supabase.from('stretch_logs').delete().eq('user_id', userId).eq('date', today)
          if (error) warnings.value = [...warnings.value, `Sync delete from stretch_logs failed: ${error.message}`]
        } catch (err) {
          warnings.value = [...warnings.value, `Sync delete from stretch_logs failed: ${(err as Error).message}`]
        }
      }
      return
    }

    const row: StretchLog = { userId, date: today, completedAt: new Date().toISOString() }
    await db.stretchLogs.put(row)
    todayCompleted.value = true
    if (userId !== LOCAL_DEV_USER_ID) await pushRow('stretch_logs', row, warnings.value)
  }

  return { todayCompleted, warnings, loadToday, toggleToday }
})
```

- [ ] **Step 5: Wire the stretch card into `DashboardView.vue`**

Add the import and store instance. Current top of script (after Task 4's edits):

```ts
// before
import { useMealPlanStore } from '@/stores/mealPlan'
import { usePlanStore } from '@/stores/plan'
import { useSessionStore } from '@/stores/session'
import type { MealSlot, PlanItem } from '@/types/domain'

// Landing screen: today's prescribed session, today's meals, nothing else.
// Deliberately not a settings-style list — this is scanned, not read.
const planStore = usePlanStore()
const mealStore = useMealPlanStore()
const session = useSessionStore()

// No real auth yet (see TASKS.md) — same fallback IntakeView.vue/MealsView.vue use.
const userId = computed(() => session.session?.user.id ?? LOCAL_DEV_USER_ID)

onMounted(() => {
  planStore.loadActivePlan(userId.value)
  mealStore.loadActivePlan(userId.value)
})

// after
import { useMealPlanStore } from '@/stores/mealPlan'
import { usePlanStore } from '@/stores/plan'
import { useSessionStore } from '@/stores/session'
import { useStretchStore } from '@/stores/stretch'
import type { MealSlot, PlanItem } from '@/types/domain'

// Landing screen: today's prescribed session, today's meals, nothing else.
// Deliberately not a settings-style list — this is scanned, not read.
const planStore = usePlanStore()
const mealStore = useMealPlanStore()
const session = useSessionStore()
const stretchStore = useStretchStore()

// No real auth yet (see TASKS.md) — same fallback IntakeView.vue/MealsView.vue use.
const userId = computed(() => session.session?.user.id ?? LOCAL_DEV_USER_ID)

onMounted(() => {
  planStore.loadActivePlan(userId.value)
  mealStore.loadActivePlan(userId.value)
  stretchStore.loadToday(userId.value)
})
```

Add the `Sunrise` icon to the existing `@lucide/vue` import:

```ts
// before
import { ChevronRight } from '@lucide/vue'
// after
import { ChevronRight, Sunrise } from '@lucide/vue'
```

Insert the stretch card in the template, directly below the week-strip added in Task 4 and above the promotion `Alert`:

```vue
<!-- before -->
    </div>

    <Alert v-if="closestToPromotion" variant="success" class="mt-3">
      🎯 One more good <span class="font-medium">{{ closestToPromotion.patternName }}</span> session to level up
    </Alert>

<!-- after -->
    </div>

    <div class="mt-3 flex items-center gap-3 rounded-xl border border-rule bg-surface px-4 py-3 shadow-card">
      <label class="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center">
        <input type="checkbox" class="h-5 w-5 accent-train" :checked="stretchStore.todayCompleted" @change="stretchStore.toggleToday(userId)" />
      </label>
      <Sunrise :size="18" class="shrink-0 text-muted" aria-hidden="true" />
      <span class="flex-1 text-sm font-medium" :class="stretchStore.todayCompleted ? 'text-muted line-through' : 'text-ink'">Morning stretch</span>
    </div>

    <Alert v-if="closestToPromotion" variant="success" class="mt-3">
      🎯 One more good <span class="font-medium">{{ closestToPromotion.patternName }}</span> session to level up
    </Alert>
```

- [ ] **Step 6: Run typecheck**

Run: `npx vue-tsc -b --noEmit`
Expected: clean.

- [ ] **Step 7: Run the full test suite**

Run: `npx vitest run`
Expected: 419 passing, same as after Task 4 (no new tests — `stretch.ts` is a store, verified live per this project's established convention).

- [ ] **Step 8: Live-verify in the browser — signed-out / local-dev path (works without the migration applied)**

Navigate to `/` using the local-dev fallback (no real sign-in). Confirm: the "Morning stretch" card renders below the week-strip, unchecked by default, with the `Sunrise` icon and correct label. Click the checkbox: it becomes checked, the label goes muted + strikethrough, matching a completed exercise's visual treatment exactly. Reload the page: confirm it's still checked (Dexie persisted it). Click it again: confirm it unchecks cleanly and reflects immediately.

- [ ] **Step 9: Controller applies the migration, then live-verify the signed-in sync path**

The controller (not this task's implementer) runs:

```bash
supabase db query --linked --file supabase/migrations/0011_stretch_logs.sql
```

Once applied: sign in with a real account, check the stretch box, and confirm via `supabase db query --linked --query "select * from stretch_logs;"` that a row appears with today's date. Uncheck it and confirm the row is gone. Sign out, clear the site's IndexedDB (or use a different browser), sign back in, and confirm `loadToday` correctly pulls the real state back (checked if a row exists remotely).

- [ ] **Step 10: Update `docs/schema.md`**

Add `stretch_logs` to the Domain map table (`docs/schema.md:16-22`) as its own row, since it isn't part of the Training cluster's workout-plan machinery:

```markdown
<!-- before -->
| Planning & shopping | `meal_plans`, `meal_plan_entries`, `user_recipe_feedback`, `grocery_lists`, `grocery_items` | per-user |

The two spines (training, nutrition) meet only at `profiles`/`user_targets`, which is what lets them be built and shipped independently.

<!-- after -->
| Planning & shopping | `meal_plans`, `meal_plan_entries`, `user_recipe_feedback`, `grocery_lists`, `grocery_items` | per-user |
| Wellness | `stretch_logs` | per-user |

The two spines (training, nutrition) meet only at `profiles`/`user_targets`, which is what lets them be built and shipped independently.
```

Add a section note after the RLS note (`docs/schema.md:43`, end of file):

```markdown

**Stretch log (`0011_stretch_logs.sql`).** Deliberately independent of `workout_plans`/`workout_logs` — checking it off isn't tied to having an active plan, or to any specific session. One row means "stretched that day"; there's nothing to update in place, so no `updated_at` (unlike every syncable per-user table elsewhere in this schema, which do get one — this table's rows are pure presence/absence, created or deleted, never edited).
```

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/0011_stretch_logs.sql src/types/domain.ts src/lib/db.ts src/stores/stretch.ts src/views/DashboardView.vue docs/schema.md
git commit -m "Add daily stretch reminder: migration, store, and Today UI"
```

## Final verification (after all 5 tasks)

- [ ] Run `npx vue-tsc -b --noEmit` — expect clean.
- [ ] Run `npx vitest run` — baseline before this plan is 402 tests passing; expect 419 (402 + 9 in `dateMath.spec.ts` + 8 in `workoutCalendar.spec.ts`), none broken.
- [ ] Run `npm run build` — expect a clean production build.
- [ ] Live, on the controller's side: confirm the migration has actually been applied (Task 5 Step 9), then walk through all three surfaces together with a real account that has both workout history and a stretch check-in — Train's month calendar, Today's week-strip, and the stretch card — confirming the two calendar surfaces agree with each other (a day marked complete on the strip is also marked complete on the month grid) and that the stretch card's state is independent of both (checking/unchecking it never changes either calendar).
