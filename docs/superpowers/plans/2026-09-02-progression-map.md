# Visual Progression Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each of the 8 movement-pattern progression ladders as a visual node map on the Train (Workouts) view, and surface a "closest to leveling up" nudge on Today.

**Architecture:** Two new pure functions (`buildProgressionMap`, `findClosestToPromotion`) derive display state entirely from data the plan store already loads (`MovementLibrary` + `UserExerciseLevel[]`) — no new fetching. One new presentational component (`ProgressionLadder.vue`) renders one pattern's ladder as a row-wrapping node chain with real SVG connectors. Two existing views wire these in.

**Tech Stack:** Vue 3 `<script setup>`, Pinia (existing `usePlanStore`), `@lucide/vue` icons, Tailwind v4 utility classes against the existing design tokens, Vitest.

## Global Constraints

- No new dependencies.
- Typecheck (`npm run typecheck`) must stay clean after every task.
- Pure logic (`progressionMap.ts`) gets real Vitest unit tests. The new component's rendering (SVG connectors, row-wrap layout) is Vue-reactive/CSS and gets manual/live verification only, performed by the controller directly (not a subagent claim) — the design spec calls out a "highest fidelity" bar for this specifically.
- Reuse existing design tokens only: `bg-train`/`text-train`/`border-train`, `bg-rule`/`text-rule`, `text-muted`, `bg-surface` — no new colors.
- Connectors between nodes must be real vector lines with clean corner-routing at row wraps — not text arrow characters, not a CSS border/pseudo-element hack. See Task 2 for the exact approach.
- Node interaction: tapping any node (locked included) navigates to `/exercises/:exerciseId` (the existing route/view, unmodified).

---

### Task 1: Progression-map pure logic

**Files:**
- Create: `src/lib/progressionMap.ts`
- Test: `src/lib/progressionMap.spec.ts`

**Interfaces:**
- Consumes: `MovementLibrary` (`src/generators/workout/library.ts` — `patternById: Map<number, MovementPattern>`, `exercisesByPattern: Map<number, Exercise[]>` sorted by level ascending, `exerciseById: Map<number, Exercise>`), `promotionOf(library, exerciseId): { exerciseId: number | null; ambiguous: boolean }` (same file), `MovementPattern`/`Exercise`/`UserExerciseLevel`/`PatternCategory` (`src/types/domain.ts`).
- Produces: `NodeStatus`, `ProgressionNode`, `PatternProgress`, `PromotionCandidate` types; `buildProgressionMap(library, levels)`; `findClosestToPromotion(patterns, levels, library)`. Task 3 and Task 4 both import from this file.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/progressionMap.spec.ts`:

```ts
import { describe, expect, it } from 'vitest'

import type { Equipment, Exercise, ExerciseContraindication, ExerciseEquipment, MovementPattern, ProgressionEdge, UserExerciseLevel } from '@/types/domain'
import { buildLibrary } from '@/generators/workout/library'
import { buildProgressionMap, findClosestToPromotion } from './progressionMap'

function pattern(overrides: Partial<MovementPattern> & Pick<MovementPattern, 'id' | 'sortOrder'>): MovementPattern {
  return { slug: `pattern-${overrides.id}`, name: `Pattern ${overrides.id}`, category: 'push', ...overrides }
}

function exercise(overrides: Partial<Exercise> & Pick<Exercise, 'id' | 'patternId' | 'level'>): Exercise {
  return {
    slug: `exercise-${overrides.id}`,
    name: `Exercise ${overrides.id}`,
    metricType: 'reps',
    repMin: 8,
    repMax: 12,
    holdMinS: null,
    holdMaxS: null,
    distanceMinM: null,
    distanceMaxM: null,
    isUnilateral: false,
    demoUrl: null,
    cues: null,
    isActive: true,
    ...overrides,
  }
}

function level(overrides: Partial<UserExerciseLevel> & Pick<UserExerciseLevel, 'patternId' | 'exerciseId'>): UserExerciseLevel {
  return {
    userId: 'user-1',
    consecutiveSuccess: 0,
    consecutiveFailure: 0,
    lastEvaluatedAt: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const NO_EQUIPMENT: Equipment[] = []
const NO_EXERCISE_EQUIPMENT: ExerciseEquipment[] = []
const NO_CONTRAINDICATIONS: ExerciseContraindication[] = []
const NO_EDGES: ProgressionEdge[] = []

describe('buildProgressionMap', () => {
  it('marks exercises below the current level completed, at it current, above locked', () => {
    const patterns = [pattern({ id: 1, sortOrder: 1 })]
    const exercises = [
      exercise({ id: 10, patternId: 1, level: 1 }),
      exercise({ id: 11, patternId: 1, level: 2 }),
      exercise({ id: 12, patternId: 1, level: 3 }),
    ]
    const library = buildLibrary({ patterns, exercises, edges: NO_EDGES, equipment: NO_EQUIPMENT, exerciseEquipment: NO_EXERCISE_EQUIPMENT, contraindications: NO_CONTRAINDICATIONS })
    const levels = [level({ patternId: 1, exerciseId: 11 })] // currently on the level-2 exercise

    const result = buildProgressionMap(library, levels)

    expect(result).toHaveLength(1)
    expect(result[0].nodes.map((n) => n.status)).toEqual(['completed', 'current', 'locked'])
  })

  it('treats rung 1 as current when there is no user_exercise_levels row yet for a pattern', () => {
    const patterns = [pattern({ id: 2, sortOrder: 1 })]
    const exercises = [exercise({ id: 20, patternId: 2, level: 1 }), exercise({ id: 21, patternId: 2, level: 2 })]
    const library = buildLibrary({ patterns, exercises, edges: NO_EDGES, equipment: NO_EQUIPMENT, exerciseEquipment: NO_EXERCISE_EQUIPMENT, contraindications: NO_CONTRAINDICATIONS })

    const result = buildProgressionMap(library, [])

    expect(result[0].nodes.map((n) => n.status)).toEqual(['current', 'locked'])
  })

  it('orders patterns by sortOrder regardless of insertion order', () => {
    // Deliberately inserted in reverse of sortOrder — this is the case that
    // would silently pass if buildProgressionMap trusted Map iteration
    // order instead of sorting explicitly.
    const patterns = [pattern({ id: 2, sortOrder: 2 }), pattern({ id: 1, sortOrder: 1 })]
    const exercises = [exercise({ id: 10, patternId: 1, level: 1 }), exercise({ id: 20, patternId: 2, level: 1 })]
    const library = buildLibrary({ patterns, exercises, edges: NO_EDGES, equipment: NO_EQUIPMENT, exerciseEquipment: NO_EXERCISE_EQUIPMENT, contraindications: NO_CONTRAINDICATIONS })

    const result = buildProgressionMap(library, [])

    expect(result.map((p) => p.patternId)).toEqual([1, 2])
  })
})

describe('findClosestToPromotion', () => {
  const patterns = [pattern({ id: 1, sortOrder: 2 }), pattern({ id: 2, sortOrder: 1 })]
  const exercises = [
    exercise({ id: 10, patternId: 1, level: 1 }),
    exercise({ id: 11, patternId: 1, level: 2 }), // pattern 1 has a level 2 to promote to
    exercise({ id: 20, patternId: 2, level: 1 }), // pattern 2's only rung — nowhere to promote to
  ]
  const edges: ProgressionEdge[] = [{ fromExerciseId: 10, toExerciseId: 11, kind: 'progression' }]
  const library = buildLibrary({ patterns, exercises, edges, equipment: NO_EQUIPMENT, exerciseEquipment: NO_EXERCISE_EQUIPMENT, contraindications: NO_CONTRAINDICATIONS })

  it('picks the pattern with the highest consecutiveSuccess', () => {
    const levels = [level({ patternId: 1, exerciseId: 10, consecutiveSuccess: 1 })]
    expect(findClosestToPromotion(patterns, levels, library)).toEqual({ patternId: 1, patternName: 'Pattern 1', consecutiveSuccess: 1 })
  })

  it('breaks ties by sortOrder (lower wins)', () => {
    const levels = [
      level({ patternId: 1, exerciseId: 10, consecutiveSuccess: 1 }), // sortOrder 2
    ]
    // Give pattern 2 a promotable rung for this one test so the tie is real.
    const exercisesWithTie = [...exercises, exercise({ id: 21, patternId: 2, level: 2 })]
    const edgesWithTie: ProgressionEdge[] = [...edges, { fromExerciseId: 20, toExerciseId: 21, kind: 'progression' }]
    const libraryWithTie = buildLibrary({ patterns, exercises: exercisesWithTie, edges: edgesWithTie, equipment: NO_EQUIPMENT, exerciseEquipment: NO_EXERCISE_EQUIPMENT, contraindications: NO_CONTRAINDICATIONS })
    const tiedLevels = [...levels, level({ patternId: 2, exerciseId: 20, consecutiveSuccess: 1 })]

    expect(findClosestToPromotion(patterns, tiedLevels, libraryWithTie)).toEqual({ patternId: 2, patternName: 'Pattern 2', consecutiveSuccess: 1 })
  })

  it('returns null when there are no rows at all', () => {
    expect(findClosestToPromotion(patterns, [], library)).toBeNull()
  })

  it('returns null when every streak is zero', () => {
    const levels = [level({ patternId: 1, exerciseId: 10, consecutiveSuccess: 0 })]
    expect(findClosestToPromotion(patterns, levels, library)).toBeNull()
  })

  it('excludes a pattern already on its final rung even with a positive streak', () => {
    // Pattern 2's only exercise (id 20) has no outgoing progression edge in
    // the base `edges` fixture — promotionOf must return null for it.
    const levels = [level({ patternId: 2, exerciseId: 20, consecutiveSuccess: 1 })]
    expect(findClosestToPromotion(patterns, levels, library)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/progressionMap.spec.ts`
Expected: FAIL — `Cannot find module './progressionMap'` (the file doesn't exist yet).

- [ ] **Step 3: Implement `progressionMap.ts`**

Create `src/lib/progressionMap.ts`:

```ts
import { promotionOf } from '@/generators/workout/library'
import type { MovementLibrary } from '@/generators/workout/library'
import type { MovementPattern, PatternCategory, UserExerciseLevel } from '@/types/domain'

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
  category: PatternCategory
  nodes: ProgressionNode[]
}

export interface PromotionCandidate {
  patternId: number
  patternName: string
  consecutiveSuccess: number
}

/**
 * One entry per pattern in the library, ordered by sortOrder — sorted
 * explicitly here rather than trusting Map iteration order, which
 * reflects insertion order (ultimately whatever order Dexie's
 * `.toArray()` happens to return), not a documented sort_order guarantee.
 *
 * Below the user's current exercise for a pattern = completed, at it =
 * current, above = locked. No user_exercise_levels row yet for a pattern
 * = rung 1 (the lowest level) is treated as current — that's genuinely
 * where the generator would start someone on this pattern, so it's a
 * real answer, not a placeholder empty state.
 */
export function buildProgressionMap(library: MovementLibrary, levels: readonly UserExerciseLevel[]): PatternProgress[] {
  const levelByPattern = new Map(levels.map((l) => [l.patternId, l]))

  const patterns = [...library.patternById.values()].sort((a, b) => a.sortOrder - b.sortOrder)

  return patterns.map((pattern) => {
    const exercises = library.exercisesByPattern.get(pattern.id) ?? []
    const currentRow = levelByPattern.get(pattern.id)
    const currentExercise = currentRow ? library.exerciseById.get(currentRow.exerciseId) : undefined
    const currentLevel = currentExercise?.level ?? exercises[0]?.level

    const nodes: ProgressionNode[] = exercises.map((exercise) => {
      let status: NodeStatus = 'locked'
      if (currentLevel !== undefined) {
        if (exercise.level < currentLevel) status = 'completed'
        else if (exercise.level === currentLevel) status = 'current'
      }
      return { exerciseId: exercise.id, name: exercise.name, level: exercise.level, status }
    })

    return { patternId: pattern.id, patternName: pattern.name, category: pattern.category, nodes }
  })
}

/**
 * The pattern closest to its next promotion: highest consecutiveSuccess,
 * restricted to rows that are genuinely "one away" (a positive streak —
 * 0 means no current streak, not "far away") and genuinely promotable
 * (promotionOf returns null once a pattern is on its final rung, so a
 * streak there is real progress but not a "level up" nudge). Ties break
 * on the pattern's own sortOrder, lower wins.
 *
 * Returns null when nothing qualifies — no rows yet, every streak is
 * zero, or every positive streak belongs to an already-maxed pattern.
 * These are three shapes of "nothing to nudge about", not three cases to
 * special-case separately.
 */
export function findClosestToPromotion(
  patterns: readonly MovementPattern[],
  levels: readonly UserExerciseLevel[],
  library: MovementLibrary,
): PromotionCandidate | null {
  const patternById = new Map(patterns.map((p) => [p.id, p]))

  type Candidate = { level: UserExerciseLevel; pattern: MovementPattern }
  const candidates: Candidate[] = []
  for (const l of levels) {
    if (l.consecutiveSuccess <= 0) continue
    if (promotionOf(library, l.exerciseId).exerciseId === null) continue
    const pattern = patternById.get(l.patternId)
    if (!pattern) continue
    candidates.push({ level: l, pattern })
  }

  if (candidates.length === 0) return null

  candidates.sort((a, b) => b.level.consecutiveSuccess - a.level.consecutiveSuccess || a.pattern.sortOrder - b.pattern.sortOrder)
  const best = candidates[0]
  return { patternId: best.pattern.id, patternName: best.pattern.name, consecutiveSuccess: best.level.consecutiveSuccess }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/progressionMap.spec.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/progressionMap.ts src/lib/progressionMap.spec.ts
git commit -m "Add pure progression-map derivation logic"
```

---

### Task 2: `ProgressionLadder` component

**Files:**
- Create: `src/components/workout/ProgressionLadder.vue`

**Interfaces:**
- Consumes: `PatternProgress`, `ProgressionNode` from `src/lib/progressionMap.ts` (Task 1).
- Produces: `ProgressionLadder` component, prop `progress: PatternProgress`. Task 3 renders one per pattern.

- [ ] **Step 1: Create the component**

Create `src/components/workout/ProgressionLadder.vue`:

```vue
<script setup lang="ts">
import { Check, Lock } from '@lucide/vue'
import { computed } from 'vue'

import type { PatternProgress, ProgressionNode } from '@/lib/progressionMap'

const props = defineProps<{ progress: PatternProgress }>()

// Fixed row length rather than a fluid flex-wrap: a fluid wrap can leave
// a single orphaned node dangling alone on its own row depending on
// container width, exactly the "naive flex-wrap" look the design spec
// rules out. A fixed count makes every row's connector geometry
// (in-row lines, and the row-to-row hook below) fully predictable from
// the node's index alone — no runtime position measurement needed.
const NODES_PER_ROW = 5

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = []
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size))
  return rows
}

const rows = computed(() => chunk(props.progress.nodes, NODES_PER_ROW))

// A connector reads as "behind you" only when both ends are already
// climbed (completed, or the final completed-to-current step) — anything
// touching a locked node stays neutral, the same rule the nodes
// themselves already encode.
function bothClimbed(before: ProgressionNode, after: ProgressionNode): boolean {
  return before.status !== 'locked' && after.status !== 'locked'
}
</script>

<template>
  <section class="mt-4">
    <h3 class="text-sm font-semibold text-ink">{{ progress.patternName }}</h3>
    <div class="mt-2 flex flex-col gap-1">
      <template v-for="(row, rowIndex) in rows" :key="rowIndex">
        <div class="flex items-center">
          <template v-for="(node, i) in row" :key="node.exerciseId">
            <RouterLink
              :to="`/exercises/${node.exerciseId}`"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-mono font-bold tabular-nums transition-transform hover:scale-105"
              :class="{
                'bg-train text-white': node.status === 'completed',
                'border-2 border-train bg-surface text-train': node.status === 'current',
                'bg-rule/60 text-muted': node.status === 'locked',
              }"
              :aria-label="`${node.name}, level ${node.level}, ${node.status}`"
            >
              <Check v-if="node.status === 'completed'" :size="16" :stroke-width="2.5" aria-hidden="true" />
              <Lock v-else-if="node.status === 'locked'" :size="14" :stroke-width="2" aria-hidden="true" />
              <span v-else>{{ node.level }}</span>
            </RouterLink>
            <div
              v-if="i < row.length - 1"
              class="h-0.5 flex-1"
              :class="bothClimbed(node, row[i + 1]) ? 'bg-train' : 'bg-rule'"
            />
          </template>
        </div>
        <svg
          v-if="rowIndex < rows.length - 1"
          viewBox="0 0 100 32"
          preserveAspectRatio="none"
          class="h-8 w-full"
          :class="bothClimbed(row[row.length - 1], rows[rowIndex + 1][0]) ? 'text-train' : 'text-rule'"
          aria-hidden="true"
        >
          <path d="M 94 0 C 94 16, 6 16, 6 32" fill="none" stroke="currentColor" stroke-width="2" />
        </svg>
      </template>
    </div>
  </section>
</template>
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Manual verification**

You very likely do NOT have working browser/visual-rendering tools in this environment. Do not claim you observed the rendered SVG connectors, row-wrap behavior, or node coloring — that would be fabricated. Instead, re-read the file and confirm it matches this step's code exactly, and state in your report that live visual verification is deferred to the controller, who has real browser tooling and has treated every other visual task this session the same way.

- [ ] **Step 4: Commit**

```bash
git add src/components/workout/ProgressionLadder.vue
git commit -m "Add ProgressionLadder component"
```

---

### Task 3: Wire the progression map into Train (Workouts)

**Files:**
- Modify: `src/stores/plan.ts`
- Modify: `src/views/WorkoutsView.vue`

**Interfaces:**
- Consumes: `buildProgressionMap` (Task 1), `ProgressionLadder` (Task 2).
- Produces: `planStore.library` and `planStore.levels` become part of the store's public return object (Step 1 below) — Task 4 relies on this same exposure, not on re-doing it.

**Important — verified during plan review, not assumed:** `plan.ts` already loads `library` (the full `MovementLibrary`) and `levels` (`UserExerciseLevel[]`) into internal refs inside `loadActivePlan()`, but neither is in the store's `return { ... }` object (confirmed by reading it — `src/stores/plan.ts:493-520` lists `plan, sessions, items, loading, warnings, hasPlan, sessionsByWeek, nextSession, sessionStreak, weekProgress, blockProgress, promotionMessages, itemsForSession, exerciseName, exercise, patternName, patternSlug, equipmentForExercise, equipmentName, isItemChecked, sessionProgress, setLogsForItem, loadActivePlan, toggleItemChecked, updateSetLog, dismissPromotionMessages` — no `library`, no `levels`). Both need to be added to that return object before any view can read `planStore.library`/`planStore.levels` at all.

- [ ] **Step 1: Expose `library` and `levels` from the plan store**

In `src/stores/plan.ts`, find the `return { ... }` object (currently lines 493-520, quoted above). Add `library` and `levels` to it — alongside `plan` and `sessions` is a natural spot, since all three are core loaded state:

```ts
  return {
    plan,
    sessions,
    items,
    loading,
    warnings,
    hasPlan,
    library,
    levels,
    sessionsByWeek,
```

(Every other line in the existing return object stays exactly as it is — this only inserts the two new lines after `hasPlan,`.)

- [ ] **Step 2: Run the existing test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: PASS — same count as before this task (adding fields to a store's return object doesn't change any existing behavior).

- [ ] **Step 3: Add the import and computed**

In `src/views/WorkoutsView.vue`'s `<script setup>` block, add to the existing imports:

```ts
import ProgressionLadder from '@/components/workout/ProgressionLadder.vue'
import { buildProgressionMap } from '@/lib/progressionMap'
```

Add this computed alongside the view's other computeds:

```ts
const progressions = computed(() => (planStore.library ? buildProgressionMap(planStore.library, planStore.levels) : []))
```

- [ ] **Step 4: Render the section**

`src/views/WorkoutsView.vue` currently ends (lines 183-187):

```html
        </section>
      </div>
    </template>
  </div>
</template>
```

Insert the new section between that inner `</div>` (line 184, closing the week/session content grid) and the `</template>` right after it (line 185), so the result reads:

```html
        </section>
      </div>
      <section class="mt-8">
        <h2 class="text-lg font-semibold text-ink">Progressions</h2>
        <template v-for="(p, i) in progressions" :key="p.patternId">
          <p
            v-if="i === 0 || p.category !== progressions[i - 1].category"
            class="mt-4 text-xs font-semibold uppercase tracking-wide text-muted"
          >
            {{ p.category }}
          </p>
          <ProgressionLadder :progress="p" />
        </template>
      </section>
    </template>
  </div>
</template>
```

For reference, here is the new section on its own:

```html
      <section class="mt-8">
        <h2 class="text-lg font-semibold text-ink">Progressions</h2>
        <template v-for="(p, i) in progressions" :key="p.patternId">
          <p
            v-if="i === 0 || p.category !== progressions[i - 1].category"
            class="mt-4 text-xs font-semibold uppercase tracking-wide text-muted"
          >
            {{ p.category }}
          </p>
          <ProgressionLadder :progress="p" />
        </template>
      </section>
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Manual verification**

You very likely do NOT have working browser/visual-rendering tools in this environment. Do not claim you observed the section rendering, the category dividers, or the ladders — that would be fabricated. Instead, re-read the modified file and confirm the added markup matches this step's code exactly and sits inside the correct existing branch, and state in your report that live visual verification is deferred to the controller.

- [ ] **Step 7: Commit**

```bash
git add src/stores/plan.ts src/views/WorkoutsView.vue
git commit -m "Show the progression map on the Train view"
```

---

### Task 4: The "closest to leveling up" nudge on Today

**Files:**
- Modify: `src/views/DashboardView.vue`

**Interfaces:**
- Consumes: `findClosestToPromotion` (Task 1), `planStore.library` and `planStore.levels` (exposed on the store's return object in Task 3, Step 1 — this task does not need to touch `plan.ts` itself, that exposure already happened).

- [ ] **Step 1: Add the import and computed**

In `src/views/DashboardView.vue`'s `<script setup>` block, add to the existing imports:

```ts
import { findClosestToPromotion } from '@/lib/progressionMap'
```

Add this computed:

```ts
const closestToPromotion = computed(() => {
  if (!planStore.library) return null
  return findClosestToPromotion([...planStore.library.patternById.values()], planStore.levels, planStore.library)
})
```

- [ ] **Step 2: Render the nudge**

`DashboardView.vue`'s header currently reads (from the session streak task):

```html
    <div class="flex items-baseline justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight text-ink lg:text-3xl">Today</h1>
      <p v-if="planStore.sessionStreak > 0" class="shrink-0 text-sm font-medium text-train">🔥 {{ planStore.sessionStreak }}-session streak</p>
    </div>
```

Replace it with:

```html
    <div class="flex items-baseline justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight text-ink lg:text-3xl">Today</h1>
      <p v-if="planStore.sessionStreak > 0" class="shrink-0 text-sm font-medium text-train">🔥 {{ planStore.sessionStreak }}-session streak</p>
    </div>
    <p v-if="closestToPromotion" class="mt-1 text-sm text-muted">
      🎯 One more good <span class="font-medium text-ink">{{ closestToPromotion.patternName }}</span> session to level up
    </p>
```

(Verified against the current file — `src/views/DashboardView.vue:98-102` — byte-for-byte as of this plan being written; the streak `<div>` is unchanged, only the new `<p>` line is added after it.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Manual verification**

You very likely do NOT have working browser/visual-rendering tools in this environment. Do not claim you observed the nudge rendering — that would be fabricated. Instead, re-read the modified file and confirm the added markup matches this step's code exactly, and state in your report that live visual verification (including exercising the nudge with real `consecutiveSuccess` data, which needs a seeded fixture) is deferred to the controller.

- [ ] **Step 5: Commit**

```bash
git add src/views/DashboardView.vue
git commit -m "Add a closest-to-promotion nudge to Today"
```

---

## Final verification (after all 4 tasks)

- [ ] Run `npx vitest run` — expect all pre-existing tests plus the 8 new `progressionMap` tests passing, none broken.
- [ ] Run `npm run build` — expect a clean production build.
- [ ] Live, on the controller's side: seed a temporary `user_exercise_levels` row (and, if needed, temporary `workoutPlans`/`planSessions`/`planItems` rows so a plan is active) directly in IndexedDB for a couple of patterns with different `consecutiveSuccess` values, reload Train, and confirm: the ladder renders with the right node colors/icons for completed/current/locked, the SVG connectors route cleanly at a row wrap (not a straight line ignoring the wrap, not an orphaned node), tapping a locked node navigates to its exercise page, and Today shows the nudge naming the correct pattern. Revert the temporary data afterward, confirmed empty again — same discipline as every other live-data check this session.
