# Visual progression map — design

## Context

Roadmap item #1 in `docs/roadmap.md`: Groundwork already runs a real progression ladder per movement pattern — `movement_patterns` → `progression_edges` → per-level `exercises` — that drives which exercise gets prescribed at a user's current level, and a promotion engine (`src/generators/workout/promotion.ts`) that fires a real event when someone levels up. None of it is visible anywhere in the UI: a user has no way to see the ladder, where they sit on it, or what's next. Dedicated calisthenics apps (Calistack, Calistree, Simple Calisthenics) treat exactly this kind of visual skill map as their flagship feature.

## Schema reality check (verified against the actual repo, not assumed)

- **The ladders are linear, not branching.** No branch content exists anywhere in the current seed data (`library.ts`'s own comments confirm this twice — `promotionOf`/`lateralOf`). This is 8 straight staircases, not a tree.
- **Exactly 8 movement patterns**, fixed content, `sort_order` 1–8 already clustering by category: `horizontal_push`(1)/`vertical_push`(2) = push, `vertical_pull`(3)/`horizontal_pull`(4) = pull, `squat`(5)/`hinge`(6) = legs, `core`(7) = core, `skill_handstand`(8) = skill. Roughly 7–9 rungs per pattern (`horizontal_push` has 9, real names: Wall push-up → Incline → Knee → Push-up → Diamond → Decline → Archer → Pseudo-planche → One-arm push-up progression).
- **`user_exercise_levels` has no history.** One row per `(user_id, pattern_id)` — `exercise_id` (current rung), `consecutive_success`, `consecutive_failure`, `last_evaluated_at`. Promotion fires at `consecutiveSuccess >= 2`, regression at `consecutiveFailure >= 3` (`promotion.ts`). There is no record of ever having reached a higher rung than your current one — a regression is indistinguishable from having never gotten there.
- **Everything this feature needs is already loaded.** `plan.ts`'s `loadActivePlan()` already builds the full `MovementLibrary` (all 8 patterns, all exercises, content-table data — not scoped to the user's current plan) and loads all of the user's `user_exercise_levels` rows, gated only on "has an active plan" — the same gate every other Train/Today content already sits behind. **This feature adds zero new data-fetching.** It's new derived logic plus new UI reading state the store already has.
- **`ExerciseView.vue` is safe to link from a locked node.** It's pure reference content (name, level, target reps, cues, equipment) with no "in progress" assumption baked in, and its exercise lookup (`store.exercise(id)` → `exercisesById` map) resolves any valid id regardless of plan membership.

## Decisions (settled during brainstorming)

- **Where it lives:** a new "Progressions" section on the Train (Workouts) view, below the existing week-selector/session content. Today's header gains a single-line nudge naming whichever pattern is closest to promoting.
- **Node state is current-position-only, no watermark.** Below your current rung = completed. Your current rung = current. Above = locked. A regression can revert a previously-completed node back to locked — accepted as correct given the schema, not treated as a bug or a gap to paper over with new columns.
- **"Closest to leveling up" (Today's nudge):** the pattern with the highest `consecutive_success` across the user's `user_exercise_levels` rows (promotion fires at 2, so a value of 1 means one good session away). Ties break on the pattern's `sort_order` (lower wins). If no pattern has any progress yet, or every pattern is already on its final rung, the nudge simply doesn't render — no forced empty state.
- **Page structure:** one flat list of all 8 patterns in `sort_order`, with a small uppercase category label as a lightweight divider whenever the category changes (not a full section per category — `core` and `skill` are singletons, and a whole section for one item is heavier than the content justifies).
- **Node interaction:** tapping any node (locked included) navigates to `/exercises/:exerciseId` — the existing `ExerciseView.vue`, unmodified.
- **Layout for a pattern's chain:** a horizontal row of circular nodes connected by real vector connector lines, wrapping to a new row when it runs out of width rather than scrolling or windowing to a "current ± N" slice. Chosen specifically over the other two options considered (full horizontal scroll; a windowed slice with tap-to-expand) because the whole ladder stays visible at once with no hidden state and no extra interaction needed to see the full climb.
- **Visual quality bar (stated explicitly, came up twice unprompted):** connectors are real SVG lines with clean corner-routing at the row wraps — not text arrow characters, not a CSS border/pseudo-element hack that only looks right on a straight run. Node states use the app's existing design tokens (`--color-train`/`--color-train-wash` for current and completed, `--color-muted`/`--color-rule` for locked) rather than new ad hoc colors. The wrap logic gets real layout work, not a naive `flex-wrap` that leaves an orphaned single node dangling on its own row.

## Component design

### `src/lib/progressionMap.ts` (new — pure logic, unit-tested)

```ts
export type NodeStatus = 'completed' | 'current' | 'locked'

export interface ProgressionNode {
  exerciseId: number
  name: string
  level: number
  status: NodeStatus
}

export interface PatternProgress {
  patternId: number
  patternName: string
  category: string
  nodes: ProgressionNode[]
}

export interface PromotionCandidate {
  patternId: number
  patternName: string
  consecutiveSuccess: number
}
```

- `buildProgressionMap(library: MovementLibrary, levels: readonly UserExerciseLevel[]): PatternProgress[]` — one entry per pattern in `library`, patterns ordered by `sort_order` (already the iteration order `library.patternById` preserves from `buildLibrary`'s input array — confirm at implementation time rather than re-sort blindly). For each pattern, walks `library.exercisesByPattern.get(patternId)` (already sorted by level ascending) and stamps each exercise's status by comparing its level against the level of the user's current exercise for that pattern (via the matching `user_exercise_levels` row, if any). **No row for a pattern yet → rung 1 (the lowest-level exercise) is treated as `current`, everything above it `locked`.** That's genuinely where the generator would start someone on that pattern, so it's a real answer, not a placeholder — resolves the otherwise-ambiguous "every node locked, nothing highlighted" dead state.
- `findClosestToPromotion(patterns: readonly MovementPattern[], levels: readonly UserExerciseLevel[], library: MovementLibrary): PromotionCandidate | null` — the ranking/tie-break rule from Decisions above, restricted to rows where `consecutiveSuccess > 0` (a value of 0 means "no current streak," not "one away" — not a candidate at all) AND where `promotionOf(library, currentExerciseId).exerciseId` is non-null (a pattern already on its final rung has nowhere to promote to, so a streak there is real but not a "leveling up" nudge). Returns `null` when no row satisfies both — covers the brand-new-user case (no rows), the nobody's-mid-streak case (all zero), and the everyone-relevant-is-already-maxed case, as three instances of the same "nothing to show" rule rather than three separate cases to special-case.

### `src/components/workout/ProgressionLadder.vue` (new)

Renders one `PatternProgress`: the pattern name/category label, then the node chain (SVG connectors, wrapping rows) with each node a `<RouterLink :to="/exercises/${node.exerciseId}">`. Takes `PatternProgress` as a prop — no store access of its own, matching this codebase's existing "dumb component reads its prop, view reads the store" convention (e.g. `PatternIcon.vue`).

### `WorkoutsView.vue` changes

New "Progressions" section: `const progressions = computed(() => planStore.library ? buildProgressionMap(planStore.library, planStore.levels) : [])`, rendered as `<ProgressionLadder v-for="p in progressions" :key="p.patternId" :progress="p" />` with the category-divider logic (compare each entry's `category` to the previous one in the loop). Sits behind the same `v-else` (has-plan) gate the rest of the view already uses — no separate loading/empty state needed.

### `DashboardView.vue` changes

A new computed calling `findClosestToPromotion`, reading `planStore.levels` and `planStore.library` (the `patterns` argument derived from `library.patternById`'s values — exact extraction is a plan-time detail). Rendered as a single-line nudge near the existing streak line, `v-if="closestToPromotion"`, something like: `🎯 One more good {{ closestToPromotion.patternName }} session to level up`. Exact copy is a plan-time detail, not a spec-level requirement.

## Testing approach

Matches this project's established split: `progressionMap.ts` is pure logic (given a library + levels, return a value) and gets real unit tests — node-status derivation across all three states, the no-row-for-this-pattern-yet case, the tie-break rule, the "nothing to show" case for both functions. `ProgressionLadder.vue`'s rendering (SVG connector routing, row-wrap behavior, the actual visual result) is Vue-reactive/CSS and gets manual/live verification, same convention as every other visual task this session — the controller performs this directly given the stated high-fidelity bar, not left to a subagent's claim.

## Out of scope for this pass

- The "highest ever reached" watermark (Decisions, node-state option 2) — explicitly deferred, not forgotten; revisit if losing a completed mark on regression feels wrong in practice.
- Any change to `ExerciseView.vue` itself, `promotion.ts`, or the `user_exercise_levels` schema — this feature is additive, read-only against existing data.
- Branch/tree rendering — there is no branch content to render yet; if `progression_edges` ever gains a real branch, this is a future revisit, not a speculative build-ahead now.
