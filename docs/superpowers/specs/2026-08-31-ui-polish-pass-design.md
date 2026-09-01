# UI polish pass — design

## Context

The big structural redesign (`6683bb5`) gave Groundwork a real icon system, responsive desktop layout, and a design-token foundation. Since then, work has been real Supabase sync and a string of live-testing bug fixes — no further UI refinement. Kyle asked for a pass across **every view, including the 8 intake steps**, looking for small points to improve based on current (2026) UI design practice, both general trends and fitness/nutrition-app-specific patterns (Strava, Whoop, Hevy, MyFitnessPal).

Explicit scope, agreed during brainstorming:
- Refinement-level polish is the primary goal. Bigger structural/layout changes are in scope only where research clearly justifies them — not for their own sake.
- The design-system foundation (color tokens, Lucide icons) stays fixed **unless** research shows something genuinely better. Research was done; verdict is below.
- Delivered as three independently-shippable waves, each committed and verified before moving to the next — not one giant pass.

## Research findings

Full findings and sources are in the conversation this spec came from. Summary of what's actually applicable (filtering out trends that don't fit a deliberately deterministic, non-AI app — voice UI, AR, "AI hyper-personalization" are explicitly not being adopted):

- **Foundation verdict: no change warranted.** A single high-energy accent per purpose (train/nutri), a near-black dark base with generous spacing, and a restrained icon system (Lucide, already used by shadcn/ui and other current dark-first products) are exactly what 2026 sources describe as current best practice for this class of app. Research validated the existing choices rather than surfacing something better — the fixed-unless-justified bar was not met, so the foundation is untouched by this spec.
- **No custom focus states anywhere.** 2026 accessibility sources treat visible keyboard focus as baseline infrastructure, not optional. Groundwork currently falls back to the browser default outline everywhere.
- **Skeleton screens vs. spinners was mis-applied last round.** Correct split: spinners for short, blocking actions (submitting, saving, generating a plan); skeleton screens for content-heavy list/dashboard loads. The spinner work from the previous session's UI pass applied a spinner everywhere, including views that are actually the skeleton case.
- **Stat typography is under-emphasized.** Fitness-dashboard sources specifically call out oversized numeric type for key live stats. Groundwork's key numbers currently render at the same size as their surrounding labels.
- **Micro-interactions on completion moments** (checking something off, a promotion firing) are called out as real engagement drivers, provided motion stays purposeful and respects `prefers-reduced-motion` (Groundwork already freezes all animation under that media query — this spec's new motion inherits that for free).
- **Streaks** are a primary engagement mechanic in both Hevy and Strava.

## Wave 1 — Universal wins (shared CSS/component, touches every view)

### 1.1 Focus states

Add to `src/style.css`, after the existing token blocks:

```css
:focus-visible {
  outline: 2px solid var(--color-train);
  outline-offset: 2px;
}
```

`:focus-visible`, not `:focus` — the former only fires for keyboard/programmatic focus, not every mouse click, which is the actual UX goal (a visible ring for keyboard users, no distracting ring on tap/click). No per-component changes needed; this is one rule with app-wide reach. Verify by tabbing through a form-heavy view (StepAboutYou) and a nav-heavy view (BottomNav/SidebarNav) and confirming a visible, on-brand ring appears only on keyboard focus.

### 1.2 Skeleton loaders

New `src/components/ui/Skeleton.vue`: a single reusable pulsing block —

```vue
<script setup lang="ts">
defineProps<{ class?: string }>()
</script>
<template>
  <div class="animate-pulse rounded-xl bg-rule/60" :class="$props.class" />
</template>
```

Replaces the `Spinner` component (added last session) specifically on these loading branches, each composed from a few `Skeleton` blocks shaped roughly like the content about to appear:

| View | Skeleton shape |
|---|---|
| `DashboardView.vue` | 3 row-shaped blocks (today's items) + 2 smaller blocks (today's meals) |
| `WorkoutsView.vue` | 1 card-shaped block (progress card) + 3 row blocks |
| `MealsView.vue` | 7 day-section headers, each with 1 row block |
| `GroceryView.vue` | 3 aisle-group headers, each with 2-3 row blocks |
| `RecipeView.vue` | 1 title-width block, 1 short block, 4 ingredient-row blocks |
| `ExerciseView.vue` | 1 icon-box-shaped block, 3 text-line blocks |

`Spinner` stays exactly where it already is: `IntakeView.vue`'s "Generating…"/"Working…" (a genuinely short, blocking action), the three auth pending states in `ProfileView.vue`, and `ProfileView.vue`'s `!session.isReady` boot check. Those are correctly the spinner case per the research above and are not touched.

## Wave 2 — Stat typography + micro-interactions

### 2.1 Oversized key stats

- `DashboardView.vue`: today's `{{ done }}/{{ total }} done` count goes from `font-mono text-xs tabular-nums text-muted` to a visually promoted treatment — the number large and bold (e.g. `text-2xl font-bold text-ink`), "done" as a small label beside or beneath it.
- `WorkoutsView.vue`: the block-progress `done/total sessions` readout gets the same promotion, next to its existing progress bar.
- `RecipeView.vue`: the single-line macro readout (`{{ kcal }} kcal · {{ protein }}g protein · ...`) is replaced with a 4-tile stat grid, **reusing the exact pattern already built for `StepGoal.vue`'s "What that looks like" card** (a `grid grid-cols-4 gap-3 text-center` of `dt`/`dd` pairs) — one consistent macro-display language across the app instead of two.

### 2.2 Micro-interactions

- Checking an item off in `DashboardView.vue`/`WorkoutsView.vue`: the row gets a brief `transition-colors` flash through `bg-train-wash` back to its resting background, instead of an instant static change. CSS-only (a Vue-bound class toggled briefly on the checkbox's `@change`, removed after the transition completes), no new persisted state.
- The promotion banner (`promotionMessages`) in both of those views gets wrapped in a `<Transition name="fade-slide">` with a short (150-200ms) fade+slight-slide-in, instead of appearing instantly.

Both inherit the existing global `prefers-reduced-motion` freeze with no extra code.

## Wave 3 — Judgment-call items

### 3.1 Dark mode as default

Currently `style.css`'s base `@theme`/`:root` block holds the **light** palette; dark applies via `:root[data-theme='dark']` or `@media (prefers-color-scheme: dark)`. This flips: the dark values move into the base block, and light becomes the explicit override (`:root[data-theme='light']` and `@media (prefers-color-scheme: light) { :root:not([data-theme='dark']) {...} }`).

This touches every token defined across all three color-scheme blocks (ground, surface, panel, ink, muted, rule, the train/nutri/warn washes, shadow-card) — a mechanical but exhaustive swap; every token needs both halves moved correctly, not just the obvious ones.

**Worth knowing before approving this**: there is currently no in-app theme toggle anywhere (confirmed — `data-theme` is only referenced in `style.css`, nothing in the Vue app ever sets it). Flipping the default means anyone whose OS reports no preference, or explicitly prefers light, sees dark with no way to switch back short of changing their OS setting. That's an acceptable tradeoff for a dark-first fitness app per the research, but it's a real behavior change, not neutral.

### 3.2 Session streak

Adapted specifically for Groundwork's periodized-program structure, **not** a naive calendar-day streak — Strava/Hevy's daily-streak model assumes daily logging, but a 3-5-day/week plan has programmed rest days that shouldn't break a streak the way a missed calendar day would elsewhere.

Definition: **consecutive prescribed sessions completed**, counting backward from the most recent prescribed session, stopping at the first one that's `partial`/`skipped`/not yet logged. New pure function `computeSessionStreak(sessions: PlanSession[], logs: WorkoutLog[]): number` alongside `workoutLogging.ts`'s existing pure helpers — unit-tested the same way `selectNextSession`/`sessionStatusFor` already are.

Surfaced in `DashboardView.vue`'s header, next to "Today" — e.g. a small `🔥 N-session streak` line, shown only when `N > 0` (no need to show "0-session streak" to someone who hasn't started).

## Views touched (comprehensive, per the agreed scope)

Wave 1 (focus states) reaches every view via the global CSS rule with no per-file changes needed for that part. Skeleton loaders touch the 6 listed above specifically. Waves 2-3 touch `DashboardView.vue`, `WorkoutsView.vue`, `RecipeView.vue`, and `src/lib/workoutLogging.ts`. The 8 intake step components and `GroceryView.vue`/`ExerciseView.vue`/`ProfileView.vue` are covered by Wave 1's universal reach (focus states, and skeletons where they already show a loading state) but have no additional per-file changes proposed beyond that — research didn't surface anything specific to them beyond the universal wins.

## Testing approach

Matches the project's established convention: `computeSessionStreak` is pure logic and gets real unit tests (edge cases: no sessions yet, streak broken by a skipped session, streak unbroken across a scheduled rest day, streak at the very start of a block). Everything else in this spec is Dexie/Vue-reactive UI (skeletons, focus rings, CSS transitions, the dark-default token swap) and gets manual/live browser verification only, per this project's existing convention — no unit tests attempted for Tailwind class output or CSS cascade behavior.
