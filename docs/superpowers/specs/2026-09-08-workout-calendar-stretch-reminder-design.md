# Workout calendar + morning stretch reminder — design

## Context

Two related requests from Kyle: a calendar that marks which days a workout was completed, and a daily "stretch when you wake up" reminder that's checked off but explicitly does **not** count toward the existing session streak (`computeSessionStreak` in `src/lib/workoutLogging.ts`, which counts consecutive *plan-order* sessions completed — not consecutive calendar days; a genuinely separate concept from what this feature adds).

Neither piece exists today. Confirmed while scoping this: the app has zero notification infrastructure (no service worker push, no `Notification`/`pushManager` usage anywhere), and workout sessions are never pinned to specific calendar dates ahead of time — a `PlanSession` only has `weekNumber`/`dayIndex` (order within the plan), and only becomes tied to a real date the moment someone actually logs it (`WorkoutLog.performedAt`). Both facts directly shaped the decisions below.

## Decisions (settled during brainstorming)

- **The reminder is an in-app card, not a push notification.** A real OS-level notification needs browser permission, service worker push handling, and a real trigger mechanism at "wake-up time" — none of which exists, and building it is a much bigger, separate feature. The in-app card shows the first time Today is opened each day, matching every other prompt this app already has (the promotion banner, the progression nudge).
- **The calendar shows completed days only — no "missed" state.** The app has no notion of "a session was supposed to happen on this specific date" (see Context) — sessions are logged whenever they actually happen, in order, not against a fixed calendar schedule. A "missed/due" indicator would have to be inferred (e.g. "longer than usual since the last session") rather than read from real data. Declined for v1: it's a heuristic dressed up as a fact, and a separate feature in its own right if wanted later.
- **Two calendar surfaces, sharing one data function, no new backend for either:**
  - **Train (`WorkoutsView.vue`)**: a full current-month grid. Current month only for v1 — no prev/next navigation (real added scope: month-boundary logic, an empty state for months before the account existed — a natural v2 if wanted).
  - **Today (`DashboardView.vue`)**: a compact 7-cell strip at the very top of the page, **trailing 7 days ending today** (not a fixed Mon–Sun week) — so it never reads as a mostly-empty strip early in a calendar week. Workout completion only, not stretch completion (see below) — keeps the two habits visually distinct, matching the "stretch doesn't count toward streaks" instinct. Purely decorative for v1: no tap-through to a specific day (Train's calendar is where you go to actually browse).
- **The stretch reminder is a real, synced table**, not browser-local storage — every other piece of state in this app persists the same way (survives a reload, shows correctly on another device), and a habit check-in that silently doesn't sync would be a real inconsistency, not a shortcut worth taking for something this small to build properly.
- **Checking it off behaves like an exercise checkbox**, not a dismissible banner: stays visible, visually checked (muted + strikethrough, same as a completed exercise), resets fresh the next calendar day. Never disappears mid-visit. Toggleable both ways (check and uncheck), matching every other checkbox in this app, even though the ask was only ever "check it off."

## Data model

### Calendar: reuses `workout_logs`, no schema change

New pure function, `src/lib/workoutCalendar.ts`:

```ts
/** Every LOCAL calendar date (yyyy-mm-dd, in the viewer's own timezone —
 *  not a UTC slice of the ISO string, which would misdate anyone whose
 *  midnight doesn't line up with UTC's) with at least one completed
 *  workout log, restricted to [startDate, endDate] inclusive (both
 *  yyyy-mm-dd). Pure: no Date.now(), no store access — callers pass in
 *  `logs` and the range explicitly. */
export function completedDatesInRange(
  logs: readonly WorkoutLog[],
  startDate: string,
  endDate: string,
): Set<string>
```

Implementation: filter `logs` to `status === 'completed'`, convert each `performedAt` to a local `yyyy-mm-dd` via `Date` getters (`getFullYear()`/`getMonth()`/`getDate()`, zero-padded — never `.toISOString().slice(0, 10)`, which reads the UTC date), keep only dates within `[startDate, endDate]`.

**Relocate `src/generators/meal/dateMath.ts` to `src/lib/dateMath.ts` first.** Its `addDays`/`daysBetween` are exactly the boundary-date math both calendar surfaces need (month-start/end for Train, "today minus 6" for the strip) once you already have a correct local `yyyy-mm-dd` string to start from — genuinely reusable, pure, domain-agnostic string math with zero meal-specific logic in the implementation. Only its doc comment and location say "meal" — it lives under `generators/meal/` and is framed entirely around meal-plan date columns, which was accurate when it had exactly one caller and stops being accurate with a second, unrelated one. Move the file, update its header comment to drop the meal-specific framing, update the meal generator's own imports to the new path, and re-run its existing tests from the new location. `workoutCalendar.ts`'s local-date-from-timestamp conversion is new either way — nothing existing does that today, since nothing before this has needed to turn a precise instant into "which calendar day did the viewer experience this on."

Two call sites, two ranges, same function:
- `WorkoutsView.vue`: `completedDatesInRange(planStore.workoutLogs, firstOfCurrentMonth, lastOfCurrentMonth)`.
- `DashboardView.vue`: `completedDatesInRange(planStore.workoutLogs, sixDaysAgo, today)`.

Both already have `planStore.workoutLogs` available (it's already a returned ref from `plan.ts`). No store changes needed for the calendar.

### Stretch reminder: new table, new Dexie table, new small store

**Migration `0011_stretch_logs.sql`:**

```sql
create table stretch_logs (
  user_id      uuid not null references profiles on delete cascade,
  date         date not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table stretch_logs enable row level security;

create policy "stretch_logs_owner" on stretch_logs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

One row = "stretched that day." No `updated_at` needed — a row is either present or absent, there's nothing to update in place (matches `deleted_at`'s own "never a hard delete, except when the domain genuinely has no in-between state" reasoning used elsewhere in this schema for rows that are pure presence/absence).

**`db.ts`**: version bump, new table `stretchLogs: Table<StretchLog, [string, string]>` (compound key `[userId, date]`, same convention as `userEquipment`/`userLimitations`).

**`types/domain.ts`**: `interface StretchLog { userId: string; date: string; completedAt: string }`.

**New `src/stores/stretch.ts`** (deliberately not folded into `plan.ts` — stretching isn't tied to having an active workout plan at all):

```ts
export const useStretchStore = defineStore('stretch', () => {
  const todayCompleted = ref(false)

  async function loadToday(userId: string): Promise<void>
  // Reads today's local date, checks Dexie for a matching row, pulls
  // from Supabase first for a real user (same "pull before read" shape
  // loadActivePlan already uses), sets todayCompleted.

  async function toggleToday(userId: string): Promise<void>
  // Local date key. If not completed: write the Dexie row, push it
  // (best-effort, same try/catch-into-warnings convention as
  // everywhere else). If completed: delete the Dexie row, delete
  // remotely too. Flips todayCompleted either way.

  return { todayCompleted, loadToday, toggleToday }
})
```

## UI

### Train — `WorkoutCalendar.vue` (new, `src/components/workout/`)

Props: `completedDates: ReadonlySet<string>` (already computed by the caller — this component does no data fetching, purely presentational, same split as `ProgressionLadder.vue`). Renders the current month: a 7-column Sun–Sat grid, date numbers, empty leading/trailing cells for days outside the month. A completed day gets `bg-train-wash` background and `text-train font-semibold` text — same tokens the rest of the app already uses, no new colors. Today gets a `border border-train` ring regardless of completion state, so it's always findable.

Placed in `WorkoutsView.vue` as its own `rounded-2xl border border-rule bg-surface p-4 shadow-card` section, immediately after the existing block-progress/week-bars section (line ~106) and before the week-selector buttons — groups every "progress overview" visual together before the actual session lists below.

### Today — week-strip (new markup directly in `DashboardView.vue`, not its own component — single use site)

7 cells in a row, trailing window (`today` back to `today - 6 days`, computed each mount — not stored). Same visual language as the month grid (`bg-train-wash`/`text-train` for a completed day, ring on today), each cell shows a 1-2 letter day-of-week label above the date number. Placed as the very first thing under the `<h1>Today</h1>` / streak header row — above the closest-to-promotion `Alert`, above the loading skeleton, above the `!hasPlan` empty state. Renders even with no active plan (an empty `Set()` just means no cell is filled) — someone hasn't generated a plan yet can still see this.

### Today — stretch card (new markup directly in `DashboardView.vue`)

A `rounded-xl border border-rule bg-surface px-4 py-3 shadow-card` row — the same card treatment as an exercise item in the session list below it — containing: a checkbox (same `min-h-11 min-w-11` tap target as every exercise checkbox), a `Sunrise` icon (`@lucide/vue`, `:size="18"`, `text-muted`) marking it as visually distinct from a workout exercise despite the shared card language, and the label "Morning stretch" (`text-muted line-through` once checked, same convention as a completed exercise). Placed directly below the week-strip, above the closest-to-promotion `Alert` — before today's actual workout session, since stretching is framed as the first thing you do. Like the week-strip, renders regardless of `hasPlan`.

Checkbox `@change` calls `stretchStore.toggleToday(userId)`; `stretchStore.loadToday(userId)` is called from the same `onMounted` that already calls `planStore.loadActivePlan`/`mealStore.loadActivePlan`.

## Testing approach

- `completedDatesInRange` and the trailing-7-days date math get real unit tests — pure functions with genuine edge cases (a completed log exactly at a month boundary, a `performedAt` late enough in the day that its UTC and local dates differ, the empty-logs case). Matches this project's established split: pure logic gets tests, Vue-layer code gets manual/live verification.
- Relocating `dateMath.ts` also closes a real, pre-existing gap: it has never had its own spec file (only exercised indirectly through the meal generator's tests). Add one at the new location while moving it — cheap, and it's about to gain a second, unrelated caller that deserves the same direct coverage the first one always should have had.
- `WorkoutCalendar.vue`, the week-strip, the stretch card, and `stretch.ts` get manual/live verification — no store in this codebase has a dedicated spec file today (checked: `src/stores/*.spec.ts` matches nothing), so a new one here would be inconsistent with the existing convention rather than an improvement on it.

## Out of scope for this pass

- Any "missed/due" indicator on either calendar surface (see Decisions above — this app has no data for it).
- Month navigation on Train's calendar (current month only).
- Tap-through interaction on any calendar day or strip cell (e.g., jumping to what was done that day).
- Showing stretch completion on the week-strip or month calendar (workout-only, by design — see Decisions).
- Any change to the existing session-streak calculation or its display — stretching staying uncounted is enforced simply by never feeding `stretch_logs` into `computeSessionStreak`, not by a new flag or exclusion rule.
